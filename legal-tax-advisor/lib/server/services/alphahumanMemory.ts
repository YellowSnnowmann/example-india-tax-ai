import { getConfig } from "../config";
import { AlphahumanMemoryClient } from "@tinyhumansai/neocortex";

let cachedClient: AlphahumanMemoryClient | null = null;

export function isAlphahumanMemoryEnabled(): boolean {
  const { ALPHAHUMAN_TOKEN } = getConfig();
  return !!ALPHAHUMAN_TOKEN?.trim();
}

export function getAlphahumanMemoryClient(): AlphahumanMemoryClient {
  if (cachedClient) return cachedClient;
  const { ALPHAHUMAN_TOKEN, ALPHAHUMAN_BASE_URL } = getConfig();
  if (!ALPHAHUMAN_TOKEN?.trim()) {
    throw new Error("ALPHAHUMAN_TOKEN is required to use Alphahuman Memory ingestion");
  }
  cachedClient = new AlphahumanMemoryClient({
    token: ALPHAHUMAN_TOKEN,
    baseUrl: ALPHAHUMAN_BASE_URL?.trim() ? ALPHAHUMAN_BASE_URL.trim() : undefined,
  });
  return cachedClient;
}

