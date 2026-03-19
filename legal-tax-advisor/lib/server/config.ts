import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  OPENAI_API_KEY: z.string(),
  JWT_SECRET: z.string(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  /** Alphahuman Memory API token — required for book/case ingestion and RAG . */
  ALPHAHUMAN_TOKEN: z.string().default(""),
  /** Optional base URL override for Alphahuman backend. */
  ALPHAHUMAN_BASE_URL: z.string().default(""),
  /** Base URL of the app (e.g. http://localhost:3000). Used for OAuth callback. */
  APP_URL: z.string().default("http://localhost:3000"),
  /** Path to scraped cases directory (CNR-named folders with structured.json, summary.json). */
  SCRAPED_CASES_PATH: z.string().default(""),
  /** Optional secret for /api/cases/absorb — when set, X-Cases-Absorb-Secret header bypasses auth. */
  CASES_ABSORB_SECRET: z.string().default(""),
  /**
   * eCourts base URL. Default points to the public portal. Used for CNR case lookup.
   * Users solve the CAPTCHA manually in the Case Search UI.
   */
  ECOURTS_BASE_URL: z.string().default("https://services.ecourts.gov.in/ecourtindia_v6/"),
});

export type Config = z.infer<typeof configSchema>;

let cached: Config | null = null;

/** Lazy-loaded so build-time env is not required. Validates on first API use. */
export function getConfig(): Config {
  if (cached) return cached;
  const env = process.env;
  const appUrl = env.NEXT_PUBLIC_APP_URL || env.APP_URL || "http://localhost:3000";
  cached = configSchema.parse({
    ...env,
    APP_URL: appUrl.replace(/\/+$/, ""),
  });
  return cached;
}
