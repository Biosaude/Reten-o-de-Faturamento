import type { Request, Response, NextFunction } from "express";
import { corporateAuthResponse, configuredCorporateOrigin, previewEntryOrigin, requireCorporateRead, corporatePreviewEnabled } from "./auth.server.js";
import { corporateOperation, reportCorporateFailure, reportCorporateRejection } from "./diagnostics.js";
import { CorporateAccessError, corporateAuthPaths } from "./access.js";

const paths: readonly string[] = Object.values(corporateAuthPaths);

export function retentionCorporateMiddleware(
  env = process.env,
  authorize = requireCorporateRead,
  handleRoute = corporateAuthResponse,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!corporatePreviewEnabled(env)) {
      if (paths.includes(req.path)) return res.sendStatus(404);
      return next();
    }
    try {
      const origin = configuredCorporateOrigin(env);
      const host = req.get("host");
      if (host !== origin.host) {
        const canonical = req.method === "GET" && previewEntryOrigin(host, env);
        if (canonical && (req.path === corporateAuthPaths.login || req.path === "/api/corporate-status")) {
          res.set("Cache-Control", "private, no-store");
          res.set("Referrer-Policy", "no-referrer");
          if (req.path === corporateAuthPaths.login) return res.redirect(303, canonical.href);
          return res.status(403).json({ code: "corporate_origin_mismatch", canonicalOrigin: canonical.origin });
        }
        reportCorporateRejection(corporateOperation(req.path), "origin_mismatch");
        return res.sendStatus(403);
      }
      const url = new URL(req.originalUrl, origin);
      if (url.origin !== origin.origin) {
        reportCorporateRejection(corporateOperation(req.path), "origin_mismatch");
        return res.sendStatus(403);
      }
      const headers = new Headers();
      for (const key of ["cookie", "origin", "sec-fetch-site"]) {
        const value = req.get(key);
        if (value) headers.set(key, value);
      }
      const request = new Request(url, { method: req.method, headers });
      if (paths.includes(req.path)) {
        const response = await handleRoute(request);
        if (!response) return res.sendStatus(404);
        for (const [name, value] of response.headers)
          if (name !== "set-cookie") res.setHeader(name, value);
        if (response.headers.has("set-cookie")) res.setHeader("Set-Cookie", response.headers.getSetCookie());
        return res.status(response.status).send(await response.text());
      }
      if (!(await authorize(request))) return res.status(401).json({ code: "corporate_login" });
      return next();
    } catch (error) {
      const code = error instanceof CorporateAccessError ? error.code : "corporate_unavailable";
      if (!(error instanceof CorporateAccessError)) reportCorporateFailure(corporateOperation(req.path), error);
      const status = code === "corporate_login" ? 401 : code === "corporate_denied" ? 403 : 503;
      return res.status(status).json({ code });
    }
  };
}
