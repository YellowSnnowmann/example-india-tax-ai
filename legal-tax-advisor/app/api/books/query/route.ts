import { NextRequest, NextResponse } from "next/server";
import { getAlphahumanMemoryClient, isAlphahumanMemoryEnabled } from "@/lib/server/memory";

/**
 * GET /api/books/query?q=<query>&limit=<n>
 * Query Alphahuman Memory (books namespace) via SDK — same RAG as chat uses.
 */
export async function GET(req: NextRequest) {
  if (!isAlphahumanMemoryEnabled()) {
    return NextResponse.json(
      { error: "Memory is not configured. Set ALPHAHUMAN_TOKEN." },
      { status: 503 }
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json(
      { error: "Missing query. Use ?q=your+search+phrase" },
      { status: 400 }
    );
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(1, parseInt(limitParam ?? "10", 10) || 10), 200);

  try {
    const client = getAlphahumanMemoryClient();
    const res = await client.queryMemory({
      query: q,
      namespace: "books",
      maxChunks: limit,
    });

    const chunks = (res.data.context?.chunks ?? []) as Array<Record<string, unknown>>;
    const results = chunks.map((c, i) => ({
      id: `chunk_${i}`,
      document:
        typeof (c as { content?: string }).content === "string"
          ? (c as { content: string }).content
          : typeof (c as { text?: string }).text === "string"
            ? (c as { text: string }).text
            : null,
      metadata: c,
      distance: null,
    }));

    return NextResponse.json({
      query: q,
      limit,
      count: results.length,
      results,
      cached: res.data.cached,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
