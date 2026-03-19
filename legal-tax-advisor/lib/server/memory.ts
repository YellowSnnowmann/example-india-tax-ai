/**
 * Memory (Alphahuman SDK) — external memory backend for books and cases.
 * All ingestion and query use the SDK. Memory backend is now used.
 */
export { isAlphahumanMemoryEnabled as isMemoryBackendEnabled } from "./services/alphahumanMemory";
export { getAlphahumanMemoryClient, isAlphahumanMemoryEnabled } from "./services/alphahumanMemory";

export const LEXAI_BOOKS_COLLECTION = "lexai_books";
