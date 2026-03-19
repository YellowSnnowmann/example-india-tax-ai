import path from "path";
import fs from "fs/promises";
import { connectDb } from "../db/mongo";
import { Book } from "../models";
import { logger } from "../logger";
import { getAlphahumanMemoryClient } from "./alphahumanMemory";

const BOOKS_NAMESPACE = "books";
const BOOKS_DIR = path.join(process.cwd(), "books");
const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;

export interface AbsorbResult {
  bookId: string;
  title: string;
  filename: string;
  totalPages: number;
  totalChunks: number;
}

/**
 * Extract text from a PDF buffer. Uses dynamic import so pdf-parse/pdfjs-dist
 * load only when parsing (and run as Node externals, not webpack-bundled).
 */
async function extractTextFromPdf(buffer: Buffer): Promise<{ text: string; totalPages: number }> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    await parser.destroy();
    const fullText = result.text ?? "";
    const totalPages = result.pages?.length ?? 0;
    return { text: fullText.trim(), totalPages };
  } catch (err) {
    await parser.destroy().catch(() => {});
    throw err;
  }
}

/**
 * Split text into overlapping chunks for storage and retrieval.
 */
function chunkText(text: string, options: { chunkSize?: number; overlap?: number } = {}): string[] {
  const size = options.chunkSize ?? CHUNK_SIZE;
  const overlap = options.overlap ?? CHUNK_OVERLAP;
  if (!text || text.length <= size) return text ? [text] : [];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + size;
    if (end < text.length) {
      const nextNewline = text.indexOf("\n", end);
      if (nextNewline !== -1 && nextNewline - end < 300) {
        end = nextNewline + 1;
      } else {
        const lastSpace = text.lastIndexOf(" ", end);
        if (lastSpace > start) end = lastSpace + 1;
      }
    }
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
    if (start >= text.length) break;
  }
  return chunks.filter(Boolean);
}

/**
 * Ingest a single PDF from the books/ folder: extract text, chunk, store via Alphahuman Memory SDK.
 */
export async function absorbBook(filename: string): Promise<AbsorbResult> {
  await connectDb();

  const filePath = path.join(BOOKS_DIR, filename);
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error(`Book not found: ${filename}`);
  }
  if (!filename.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF files are supported");
  }

  const book = await Book.findOneAndUpdate(
    { filename },
    {
      $set: {
        title: filename.replace(/\.pdf$/i, "").replace(/-/g, " "),
        filename,
        sourcePath: filePath,
        status: "processing",
        errorMessage: null,
      },
    },
    { upsert: true, new: true }
  );

  try {
    const buffer = await fs.readFile(filePath);
    const { text, totalPages } = await extractTextFromPdf(buffer);

    const chunks = chunkText(text);
    const bookId = book._id;
    const bookIdStr = bookId.toString();
    const title = book.title ?? filename.replace(/\.pdf$/i, "").replace(/-/g, " ");

    const client = getAlphahumanMemoryClient();
    for (let i = 0; i < chunks.length; i++) {
      await client.insertMemory({
        title: `${title} (chunk ${i + 1}/${chunks.length})`,
        content: chunks[i]!,
        namespace: BOOKS_NAMESPACE,
        sourceType: "doc",
        documentId: `${bookIdStr}_${i}`,
        metadata: {
          source: "book",
          bookId: bookIdStr,
          filename,
          title,
          chunkIndex: i,
          totalChunks: chunks.length,
          totalPages,
        },
      });
    }

    await Book.updateOne(
      { _id: bookId },
      {
        $set: {
          totalPages,
          totalChunks: chunks.length,
          status: "completed",
          errorMessage: null,
        },
      }
    );

    logger.info("Book absorbed", { filename, totalPages, totalChunks: chunks.length });

    return {
      bookId: bookId.toString(),
      title: book.title,
      filename: book.filename,
      totalPages,
      totalChunks: chunks.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await Book.updateOne({ _id: book._id }, { $set: { status: "failed", errorMessage: message } });
    logger.error("Book absorption failed", { filename, error: message });
    throw err;
  }
}

/**
 * List PDFs in the books/ directory.
 */
export async function listBooksOnDisk(): Promise<string[]> {
  const dir = await fs.readdir(BOOKS_DIR).catch(() => []);
  return dir.filter((f) => f.toLowerCase().endsWith(".pdf"));
}

/** Extract chunk text from SDK query/recall context for display. */
function formatChunksFromContext(context: { chunks?: Array<Record<string, unknown>> } | undefined): string {
  if (!context?.chunks?.length) return "";
  const parts = context.chunks.map((c) => {
    const content = (c as { content?: string }).content ?? (c as { text?: string }).text;
    return typeof content === "string" ? content : "";
  });
  return parts.filter(Boolean).join("\n\n---\n\n");
}

/**
 * Retrieve relevant book chunks via Alphahuman Memory SDK (RAG query).
 * Used to inject CA book context into the chat system prompt.
 */
export async function getRelevantBookChunks(query: string, limit: number = 10): Promise<string> {
  try {
    const client = getAlphahumanMemoryClient();
    const res = await client.queryMemory({
      query,
      namespace: BOOKS_NAMESPACE,
      maxChunks: Math.min(limit, 200),
    });
    const contextStr =
      res.data.llmContextMessage ?? formatChunksFromContext(res.data.context);
    if (!contextStr.trim()) return "";
    return contextStr;
  } catch (err) {
    logger.error("Memory book retrieval failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

/**
 * Retrieve relevant case chunks via Alphahuman Memory SDK (RAG query).
 */
export async function getRelevantCaseChunks(query: string, limit: number = 10): Promise<string> {
  try {
    const client = getAlphahumanMemoryClient();
    const res = await client.queryMemory({
      query,
      namespace: "cases",
      maxChunks: Math.min(limit, 200),
    });
    const contextStr =
      res.data.llmContextMessage ?? formatChunksFromContext(res.data.context);
    if (!contextStr.trim()) return "";
    return contextStr;
  } catch (err) {
    logger.error("Memory case retrieval failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}
