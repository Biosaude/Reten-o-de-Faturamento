import { generateKeyPairSync } from "node:crypto";
import type { Server } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { createApp } from "../server/app.js";
import { retentionSupabase } from "../server/preview-supabase.js";

let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each(["preview", "production"])("intercepta HTTP direto em %s antes do Supabase", async environment => {
  vi.stubEnv("VERCEL_ENV", environment);
  vi.stubEnv("RETENTION_AUTH_MODE", environment === "preview" ? "preview" : undefined);
  server = await new Promise<Server>(resolve => {
    const running = createApp().listen(0, "127.0.0.1", () => resolve(running));
  });
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  vi.stubEnv(environment === "preview" ? "RETENTION_PREVIEW_ORIGIN" : "RETENTION_PRODUCTION_ORIGIN", origin);
  for (const [method, path] of [
    ["GET", "/public/dataset"], ["GET", "/public/versions"], ["GET", "/public/versions/version"],
    ["GET", "/dataset"], ["GET", "/audit/versions"], ["POST", "/export/xlsx"], ["POST", "/import"],
    ["GET", "/auth/config"],
  ]) {
    const response = await fetch(origin + "/api" + path, { method, headers: { Authorization: "Bearer supabase-fixture" } });
    expect(response.status).toBe(503); // Even without service configuration, legacy handlers cannot run.
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "corporate_unavailable" });
  }
});

it("usa exclusivamente a configuração Supabase dedicada no modo corporativo", () => {
  const env = { VERCEL_ENV: "preview", RETENTION_AUTH_MODE: "preview",
    SUPABASE_URL: "https://original.supabase.co", SUPABASE_ANON_KEY: "fixture", SUPABASE_SERVICE_ROLE_KEY: "fixture",
    RETENTION_PREVIEW_SUPABASE_URL: "https://sintetico.supabase.co",
    RETENTION_PREVIEW_SUPABASE_ANON_KEY: "anon-fixture", RETENTION_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: "service-fixture" };
  expect(retentionSupabase(env).url).toBe("https://sintetico.supabase.co");
  expect(() => retentionSupabase({ ...env, RETENTION_PREVIEW_SUPABASE_URL: env.SUPABASE_URL })).toThrow();
  expect(() => retentionSupabase({ ...env, RETENTION_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: undefined })).toThrow();
  const production = { ...env, VERCEL_ENV: "production", RETENTION_PRODUCTION_SUPABASE_REF: "original" };
  expect(retentionSupabase(production).url).toBe(env.SUPABASE_URL);
  expect(() => retentionSupabase({ ...production, SUPABASE_URL: env.RETENTION_PREVIEW_SUPABASE_URL })).toThrow();
});


it("revalida concessão, expiração e falhas de serviço em requisições diretas", async () => {
  const browserFetch = fetch;
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("RETENTION_AUTH_MODE", undefined);
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const objectId = "22222222-2222-4222-8222-222222222222";
  const central = "https://central.example.invalid/api/internal/retention-entitlement";
  const redis = "https://redis.example.invalid/";
  const { privateKey } = generateKeyPairSync("ed25519");
  const settings = { RETENTION_ENTRA_TENANT_ID: tenantId, RETENTION_ENTRA_CLIENT_ID: objectId,
    RETENTION_ENTRA_CLIENT_SECRET: "fixture-only", RETENTION_SESSION_STORE_URL: redis,
    RETENTION_SESSION_STORE_TOKEN: "fixture-only", RETENTION_CENTRAL_BI_ENTITLEMENT_URL: central,
    RETENTION_CENTRAL_BI_ASSERTION_KEY_ID: "synthetic",
    RETENTION_CENTRAL_BI_ASSERTION_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
  let enabled = true;
  let expired = false;
  let redisAvailable = true;
  let centralAvailable = true;
  let lookupCount = 0;
  vi.stubGlobal("fetch", async (input: URL, options: RequestInit) => {
    if (input.href === redis) {
      const [command, key] = JSON.parse(String(options.body));
      expect(command).toBe("GET");
      expect(key).toMatch(/^retention:production:/);
      if (!redisAvailable) return new Response(null, { status: 503 });
      return Response.json({ result: JSON.stringify({ tenantId, objectId, expiresAt: expired ? 1 : Date.now() + 60000 }) });
    }
    expect(input.href).toBe(central);
    lookupCount++;
    if (!centralAvailable) return new Response(null, { status: 503 });
    return Response.json({ allowed: enabled });
  });
  server = await new Promise<Server>(resolve => {
    const running = createApp().listen(0, "127.0.0.1", () => resolve(running));
  });
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  vi.stubEnv("RETENTION_PRODUCTION_ORIGIN", origin.replace("http:", "https:"));
  const status = (cookie = true, path = "/corporate-status") => browserFetch(origin + "/api" + path, {
    headers: cookie ? { Cookie: "__Host-retention-session=" + "F".repeat(43) } : {},
  }).then(response => response.status);

  expect(await status(false, "/public/dataset")).toBe(401);
  expect(await status()).toBe(204);
  enabled = false;
  expect(await status(true, "/public/versions")).toBe(403);
  expect(lookupCount).toBe(2);
  expired = true;
  expect(await status(true, "/public/dataset")).toBe(401);
  expect(lookupCount).toBe(2);
  expired = false;
  centralAvailable = false;
  expect(await status(true, "/public/dataset")).toBe(503);
  redisAvailable = false;
  expect(await status(true, "/public/dataset")).toBe(503);
  expect(lookupCount).toBe(3);
});
