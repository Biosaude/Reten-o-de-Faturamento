import { corporatePreviewEnabled } from "./corporate/auth.server.js";

export function retentionSupabase(env = process.env) {
  if (!corporatePreviewEnabled(env))
    return { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY };
  const value = env.RETENTION_PREVIEW_SUPABASE_URL;
  const url = value && URL.parse(value);
  const production = env.SUPABASE_URL && URL.parse(env.SUPABASE_URL);
  if (!url || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(value ?? "") ||
      (production && production.hostname === url.hostname) ||
      !env.RETENTION_PREVIEW_SUPABASE_ANON_KEY || !env.RETENTION_PREVIEW_SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Configure a base Supabase sintética de Retenção.");
  return { url: url.origin, anonKey: env.RETENTION_PREVIEW_SUPABASE_ANON_KEY,
    serviceKey: env.RETENTION_PREVIEW_SUPABASE_SERVICE_ROLE_KEY };
}
