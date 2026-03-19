import { NextResponse } from "next/server";
import { getAlphahumanMemoryClient, isAlphahumanMemoryEnabled } from "@/lib/server/memory";

/**
 * GET /api/books/memory-debug — Inspect Memory (Alphahuman SDK) for books/cases.
 * No auth; for local debugging only. Kept path for backwards compatibility.
 */
export async function GET() {
  if (!isAlphahumanMemoryEnabled()) {
    return NextResponse.json({
      memoryEnabled: false,
      message: "ALPHAHUMAN_TOKEN is not set.",
    });
  }

  try {
    const client = getAlphahumanMemoryClient();
    const [booksRes, casesRes] = await Promise.all([
      client.queryMemory({ query: "tax", namespace: "books", maxChunks: 3 }),
      client.queryMemory({ query: "case", namespace: "cases", maxChunks: 3 }),
    ]);

    const booksChunks = (booksRes.data.context?.chunks ?? []) as Array<Record<string, unknown>>;
    const casesChunks = (casesRes.data.context?.chunks ?? []) as Array<Record<string, unknown>>;

    const sampleDoc = (c: Record<string, unknown>) => {
      const text =
        typeof (c as { content?: string }).content === "string"
          ? (c as { content: string }).content
          : typeof (c as { text?: string }).text === "string"
            ? (c as { text: string }).text
            : "";
      return text.slice(0, 200) + (text.length > 200 ? "…" : "");
    };

    return NextResponse.json({
      memoryEnabled: true,
      collectionName: "Alphahuman Memory (books + cases)",
      namespaces: { books: "books", cases: "cases" },
      sampleSize: 3,
      sample: {
        books: booksChunks.map((c) => ({ metadata: c, document: sampleDoc(c) })),
        cases: casesChunks.map((c) => ({ metadata: c, document: sampleDoc(c) })),
      },
      note: "Ingestion and query use ALPHAHUMAN_TOKEN only. the previous vector store is no longer used.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        memoryEnabled: true,
        error: message,
        hint: "Ensure ALPHAHUMAN_TOKEN is valid and backend is reachable.",
      },
      { status: 500 }
    );
  }
}
