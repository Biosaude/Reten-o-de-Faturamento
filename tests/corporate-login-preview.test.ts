import { generateKeyPairSync, sign, verify } from "node:crypto";
import { request, type IncomingHttpHeaders, type Server } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { createApp } from "../server/app.js";

const canonical = "retention-preview.example.invalid";
const deployment = "retention-deployment.vercel.app";
const login = "/api/corporate-auth/login";
const callback = "/api/corporate-auth/callback";
const status = "/api/corporate-status";
const tenantId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
const central = "https://central.example.invalid/api/internal/retention-entitlement";
const redis = "https://redis.example.invalid/";
const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const entraKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
let server: Server | undefined;

function settings() {
  const values = {
    VERCEL: "1", VERCEL_ENV: "preview", RETENTION_AUTH_MODE: "preview",
    RETENTION_PREVIEW_ORIGIN: `https://${canonical}`, VERCEL_URL: deployment,
    RETENTION_ENTRA_TENANT_ID: tenantId, RETENTION_ENTRA_CLIENT_ID: objectId,
    RETENTION_ENTRA_CLIENT_SECRET: "fixture-secret",
    RETENTION_SESSION_STORE_URL: redis, RETENTION_SESSION_STORE_TOKEN: "fixture-token",
    RETENTION_CENTRAL_BI_ENTITLEMENT_URL: central, RETENTION_CENTRAL_BI_ASSERTION_KEY_ID: "fixture",
    RETENTION_CENTRAL_BI_ASSERTION_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

async function start() {
  const app = createApp();
  server = await new Promise<Server>(resolve => {
    const running = app.listen(0, "127.0.0.1", () => resolve(running));
  });
  return app;
}

function get(path: string, headers: Record<string, string> = {}) {
  return new Promise<{ code: number; headers: IncomingHttpHeaders }>((resolve, reject) => {
    const port = (server?.address() as { port: number }).port;
    const req = request({ host: "127.0.0.1", port, path, headers: { host: canonical, ...headers } }, res => {
      res.resume();
      res.on("end", () => resolve({ code: res.statusCode ?? 0, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

afterEach(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("reproduz o alerta no Express sem proxy e limita o Preview pelo hop da Vercel", async () => {
  settings();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("RETENTION_AUTH_MODE", undefined);
  vi.stubEnv("VITE_RETENTION_CORPORATE_PREVIEW", undefined);
  const app = await start();
  expect(app.get("trust proxy")).toBe(1);

  // Express defaults to no trusted proxy. The existing limiter reports XFF in that configuration.
  app.set("trust proxy", false);
  expect((await get(status, { "x-forwarded-for": "198.51.100.25" })).code).toBe(401);
  expect(log.mock.calls.some(([error]) => error?.code === "ERR_ERL_UNEXPECTED_X_FORWARDED_FOR")).toBe(true);
  await new Promise<void>(resolve => server!.close(() => resolve()));
  log.mockClear();

  await start();
  for (let attempt = 0; attempt < 120; attempt++) {
    expect((await get(status, { "x-forwarded-for": `203.0.113.${attempt + 1}, 198.51.100.25` })).code).toBe(401);
  }
  expect((await get(status, { "x-forwarded-for": "203.0.113.200, 198.51.100.25" })).code).toBe(429);
  expect((await get(status, { "x-forwarded-for": "198.51.100.26" })).code).toBe(401);
  expect(log).not.toHaveBeenCalled();

  vi.stubEnv("VERCEL", undefined);
  expect(createApp().get("trust proxy")).toBe(false);
});

it("mantém o login no alias canônico e distingue configuração, Entra, Redis e Central sem registrar valores", async () => {
  vi.resetModules();
  settings();
  vi.stubEnv("RETENTION_ENTRA_CLIENT_SECRET", undefined);
  const { createApp: freshApp } = await import("../server/app.js");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  let discoveryFails = true;
  let redisDenied = true;
  let allowed = false;
  let centralStatus = 200;
  let attempt: unknown;
  let providerError: string | undefined = "invalid_grant";
  let idToken = "";
  const storedSessions = new Map<string, string>();
  const mockFetch = vi.fn(async (input: URL | Request | string, options?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === central) {
      const assertion = new Headers(options?.headers).get("Authorization")!.split(" ")[1];
      const [head, payload, signature] = assertion.split(".");
      expect(verify(null, Buffer.from(`${head}.${payload}`), publicKey, Buffer.from(signature, "base64url"))).toBe(true);
      expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject({
        iss: "biosaude-retention", aud: central, dashboard: "retencao-faturamento", tid: tenantId, oid: objectId, permission: "dashboard:read",
      });
      return centralStatus === 200 ? Response.json({ allowed }) : new Response(null, { status: centralStatus });
    }
    if (url === redis) {
      const [command, key, data] = JSON.parse(String(options?.body));
      if (command === "SET") {
        if (redisDenied) return Response.json({ error: "NOPERM fixture-sensitive-redis-message" });
        if (key.includes(":login:")) attempt = JSON.parse(data);
        else storedSessions.set(key, data);
        return Response.json({ result: "OK" });
      }
      if (key.includes(":login:")) {
        const result = attempt ? JSON.stringify(attempt) : null;
        if (command === "GETDEL") attempt = undefined;
        return Response.json({ result });
      }
      return Response.json({ result: storedSessions.get(key) ?? null });
    }
    if (url.endsWith("/.well-known/openid-configuration")) {
      if (discoveryFails) throw new TypeError("fixture-sensitive-network-message");
      return Response.json({ issuer, authorization_endpoint: issuer + "/authorize", token_endpoint: issuer + "/token",
        jwks_uri: issuer + "/jwks", response_types_supported: ["code"], id_token_signing_alg_values_supported: ["RS256"] });
    }
    if (url === issuer + "/jwks") return Response.json({ keys: [
      { ...entraKeys.publicKey.export({ format: "jwk" }), kid: "fixture", alg: "RS256" },
    ] });
    if (url === issuer + "/token") {
      if (providerError) return Response.json({ error: providerError, error_description: "fixture-sensitive-provider-message" }, { status: 400 });
      expect(new URLSearchParams(String(options?.body)).get("redirect_uri")).toBe(`https://${canonical}${callback}`);
      return Response.json({ id_token: idToken, access_token: "fixture", token_type: "Bearer" });
    }
    throw new Error("Unexpected fixture URL");
  });
  vi.stubGlobal("fetch", mockFetch);
  server = await new Promise<Server>(resolve => {
    const running = freshApp().listen(0, "127.0.0.1", () => resolve(running));
  });

  const redirected = await get(login + "?next=https://unexpected.invalid&code=fixture", { host: deployment, "x-forwarded-host": canonical });
  expect(redirected.code).toBe(303);
  expect(redirected.headers.location).toBe(`https://${canonical}/`);
  expect(redirected.headers["set-cookie"]).toBeUndefined();
  expect((await get(status, { host: deployment })).code).toBe(403);
  expect((await get(login, { host: "other.vercel.app", "x-forwarded-host": canonical })).code).toBe(403);
  expect((await get(callback, { host: deployment })).code).toBe(403);
  expect(mockFetch).not.toHaveBeenCalled();
  expect((await get(login)).code).toBe(503);

  vi.stubEnv("RETENTION_ENTRA_CLIENT_SECRET", "fixture-secret");
  expect((await get(status)).code).toBe(401);
  expect((await get(login, { "sec-fetch-site": "cross-site" })).code).toBe(403);
  expect(mockFetch).not.toHaveBeenCalled();
  expect((await get(login)).code).toBe(503);
  discoveryFails = false;
  expect((await get(login)).code).toBe(503);
  redisDenied = false;

  const started = await get(login);
  expect(started.code).toBe(303);
  const consent = new URL(started.headers.location!);
  expect(consent.searchParams.get("redirect_uri")).toBe(`https://${canonical}${callback}`);
  expect(consent.searchParams.get("code_challenge_method")).toBe("S256");
  const cookie = started.headers["set-cookie"]?.[0] ?? "";
  expect(cookie).toMatch(/^__Host-retention-login=.*HttpOnly.*Secure/);
  const pendingCallback = `${callback}?code=fixture-code&state=${consent.searchParams.get("state")}`;
  expect((await get(pendingCallback, { cookie: cookie.split(";")[0] })).code).toBe(401);
  expect((await get(pendingCallback, { cookie: cookie.split(";")[0] })).code).toBe(400);
  providerError = "invalid_client";
  const retried = await get(login);
  const retryState = new URL(retried.headers.location!).searchParams.get("state");
  const retryCookie = retried.headers["set-cookie"]?.[0].split(";")[0] ?? "";
  expect((await get(`${callback}?code=fixture-code&state=${retryState}`, { cookie: retryCookie })).code).toBe(503);

  providerError = undefined;
  allowed = true;
  const healthy = await get(login);
  const query = new URL(healthy.headers.location!).searchParams;
  const now = Math.floor(Date.now() / 1000);
  const claims = `${encode({ alg: "RS256", kid: "fixture" })}.${encode({
    iss: issuer, aud: objectId, tid: tenantId, oid: objectId, sub: "fixture",
    nonce: query.get("nonce"), iat: now, exp: now + 60,
  })}`;
  idToken = `${claims}.${sign("RSA-SHA256", Buffer.from(claims), entraKeys.privateKey).toString("base64url")}`;
  const authenticated = await get(`${callback}?code=fixture-code&state=${query.get("state")}`, {
    cookie: healthy.headers["set-cookie"]![0].split(";")[0],
  });
  expect(authenticated.code).toBe(303);
  const cookieHeader = authenticated.headers["set-cookie"]?.find(value => value.startsWith("__Host-retention-session="));
  expect(cookieHeader).toBeDefined();
  const session = { cookie: cookieHeader!.split(";")[0] };
  expect((await get(status, session)).code).toBe(204);
  allowed = false;
  expect((await get(status, session)).code).toBe(403);
  centralStatus = 503;
  expect((await get(status, session)).code).toBe(503);
  const diagnostics = warn.mock.calls.map(([entry]) => JSON.parse(entry));
  expect(diagnostics.filter(entry => entry.event === "retention_corporate_auth_denied")).toEqual([
    { event: "retention_corporate_auth_denied", operation: "login", reason: "origin_mismatch" },
    { event: "retention_corporate_auth_denied", operation: "callback", reason: "origin_mismatch" },
    { event: "retention_corporate_auth_denied", operation: "login", reason: "cross_site" },
    { event: "retention_corporate_auth_denied", operation: "access", reason: "no_entitlement" },
  ]);
  expect(diagnostics.filter(entry => entry.event === "retention_corporate_auth_failure")).toEqual([
    { event: "retention_corporate_auth_failure", operation: "login", stage: "configuration", reason: "missing", setting: "RETENTION_ENTRA_CLIENT_SECRET" },
    { event: "retention_corporate_auth_failure", operation: "login", stage: "entra_discovery", reason: "unreachable" },
    { event: "retention_corporate_auth_failure", operation: "login", stage: "redis", reason: "permission_denied", command: "SET", upstreamStatus: 200 },
    { event: "retention_corporate_auth_failure", operation: "callback", stage: "entra_callback", reason: "authentication_rejected" },
    { event: "retention_corporate_auth_failure", operation: "callback", stage: "entra_callback", reason: "client_rejected", upstreamStatus: 400 },
    { event: "retention_corporate_auth_failure", operation: "access", stage: "central", reason: "http_error", upstreamStatus: 503 },
  ]);
  expect(JSON.stringify(diagnostics)).not.toMatch(/fixture-|[F]{43}|example\.invalid/);
});
