import type { Request, Response, NextFunction } from "express";
import { corporateAuthResponse, corporateOriginSetting, requireCorporateRead, corporatePreviewEnabled } from "./auth.server.js";
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
      const origin = new URL(env[corporateOriginSetting(env)] ?? "");
      if (req.get("host") !== origin.host) return res.sendStatus(403);
      const url = new URL(req.originalUrl, origin);
      if (url.origin !== origin.origin) return res.sendStatus(403);
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
      const status = code === "corporate_login" ? 401 : code === "corporate_denied" ? 403 : 503;
      return res.status(status).json({ code });
    }
  };
}
