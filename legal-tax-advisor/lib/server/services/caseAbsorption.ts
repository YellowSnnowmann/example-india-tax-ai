import path from "path";
import fs from "fs/promises";
import { logger } from "../logger";
import debug from "debug";
import { getAlphahumanMemoryClient } from "./alphahumanMemory";

const log = debug("app:cases:absorb");
const CASES_NAMESPACE = "cases";
const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;

interface StructuredCase {
  cnr?: string;
  filing?: { filing_date?: string; filing_number?: string };
  registration?: { registration_date?: string; registration_number?: string };
  status?: {
    stage?: string;
    coram?: string;
    bench_type?: string;
    case_status?: string;
    state?: string;
    district?: string;
  };
  petitioners?: Array<{ name?: string; advocates?: string[] }>;
  respondents?: Array<{ name?: string; advocates?: string[] }>;
  acts?: Array<{ act?: string; article?: string; section?: string }>;
  hearings?: Array<{ judge?: string; purpose?: string; hearing_date?: string }>;
  orders?: Array<{ order_number?: string; judge?: string; order_date?: string }>;
  [key: string]: unknown;
}

interface SummaryCase {
  cnr?: string;
  summary?: string;
  order_summary?: Array<{
    order_date?: string;
    summary?: string;
    order_number?: string;
    judges?: string[];
    petitioners?: string[];
    respondents?: string[];
    precedents?: Array<{ case_number?: string; court_name?: string; purpose?: string }>;
  }>;
}

export interface CaseAbsorbResult {
  cnr: string;
  totalChunks: number;
  success: boolean;
  error?: string;
}

function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (!text || text.length <= size) return text ? [text] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + size;
    if (end < text.length) {
      const nextNewline = text.indexOf("\n", end);
      if (nextNewline !== -1 && nextNewline - end < 300) end = nextNewline + 1;
      else {
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

function buildCaseText(structured: StructuredCase, summary: SummaryCase): string {
  const parts: string[] = [];

  parts.push(`Case CNR: ${structured.cnr ?? summary.cnr ?? "unknown"}`);
  if (structured.filing) {
    parts.push(
      `Filing: ${structured.filing.filing_number ?? ""} (${structured.filing.filing_date ?? ""})`
    );
  }
  if (structured.registration) {
    parts.push(
      `Registration: ${structured.registration.registration_number ?? ""} (${structured.registration.registration_date ?? ""})`
    );
  }
  if (structured.status) {
    const s = structured.status;
    parts.push(
      `Status: ${s.case_status ?? ""} | Stage: ${s.stage ?? ""} | Coram: ${s.coram ?? ""} | Bench: ${s.bench_type ?? ""}`
    );
    parts.push(`Court: ${s.state ?? ""} - ${s.district ?? ""}`);
  }
  if (structured.petitioners?.length) {
    parts.push(
      "Petitioners: " +
        structured.petitioners
          .map((p) => `${p.name ?? ""}${p.advocates?.length ? ` (${p.advocates.join(", ")})` : ""}`)
          .join("; ")
    );
  }
  if (structured.respondents?.length) {
    parts.push(
      "Respondents: " +
        structured.respondents
          .map((r) => `${r.name ?? ""}${r.advocates?.length ? ` (${r.advocates.join(", ")})` : ""}`)
          .join("; ")
    );
  }
  if (structured.acts?.length) {
    const actsStr = structured.acts
      .filter((a) => a.act || a.section || a.article)
      .map((a) => [a.act, a.section, a.article].filter(Boolean).join(" "))
      .join("; ");
    if (actsStr) parts.push(`Acts/Sections: ${actsStr}`);
  }
  if (structured.hearings?.length) {
    parts.push(
      "Hearings: " +
        structured.hearings
          .slice(0, 10)
          .map((h) => `${h.hearing_date ?? ""} - ${h.judge ?? ""}: ${h.purpose ?? ""}`)
          .join(" | ")
    );
  }
  if (structured.orders?.length) {
    parts.push(
      "Orders: " +
        structured.orders
          .slice(0, 15)
          .map((o) => `#${o.order_number} ${o.order_date ?? ""} (${o.judge ?? ""})`)
          .join(" | ")
    );
  }

  if (summary.summary) {
    parts.push("\n--- Case Summary ---\n" + summary.summary);
  }
  if (summary.order_summary?.length) {
    parts.push("\n--- Order Summaries ---");
    for (const os of summary.order_summary.slice(0, 20)) {
      parts.push(`[${os.order_date ?? ""}] ${os.summary ?? ""}`);
      if (os.precedents?.length) {
        parts.push(
          "  Precedents: " +
            os.precedents.map((p) => p.case_number + " - " + (p.purpose ?? "")).join("; ")
        );
      }
    }
  }

  return parts.filter(Boolean).join("\n\n");
}

/**
 * Absorb a single case folder (CNR-named) into Alphahuman Memory.
 * Expects structured.json and summary.json in the folder.
 */
export async function absorbCase(caseDir: string): Promise<CaseAbsorbResult> {
  const cnr = path.basename(caseDir);
  const structuredPath = path.join(caseDir, "structured.json");
  const summaryPath = path.join(caseDir, "summary.json");

  const [structuredRaw, summaryRaw] = await Promise.all([
    fs.readFile(structuredPath, "utf-8").catch(() => null),
    fs.readFile(summaryPath, "utf-8").catch(() => null),
  ]);

  if (!structuredRaw && !summaryRaw) {
    throw new Error(`Case ${cnr}: missing structured.json and summary.json`);
  }

  const structured: StructuredCase = structuredRaw ? JSON.parse(structuredRaw) : {};
  const summary: SummaryCase = summaryRaw ? JSON.parse(summaryRaw) : {};

  const text = buildCaseText(structured, summary);
  if (!text.trim()) {
    throw new Error(`Case ${cnr}: no extractable text`);
  }

  const chunks = chunkText(text);
  log("absorbCase", { cnr, chunks: chunks.length, textLen: text.length });

  const client = getAlphahumanMemoryClient();
  for (let i = 0; i < chunks.length; i++) {
    await client.insertMemory({
      title: `Case ${cnr} (chunk ${i + 1}/${chunks.length})`,
      content: chunks[i]!,
      namespace: CASES_NAMESPACE,
      sourceType: "doc",
      documentId: `case_${cnr}_${i}`,
      metadata: {
        source: "case",
        cnr,
        chunkIndex: i,
        totalChunks: chunks.length,
      },
    });
  }

  logger.info("Case absorbed", { cnr, totalChunks: chunks.length });
  return { cnr, totalChunks: chunks.length, success: true };
}

/**
 * Get case content by CNR from Alphahuman Memory (ingested scraped cases).
 * Returns combined context for that CNR via RAG query, or null if not found.
 */
export async function getCaseByCnrFromMemory(cnr: string): Promise<string | null> {
  try {
    const client = getAlphahumanMemoryClient();
    const res = await client.queryMemory({
      query: cnr,
      namespace: CASES_NAMESPACE,
      maxChunks: 150,
    });
    const contextStr =
      res.data.llmContextMessage ??
      (res.data.context?.chunks ?? [])
        .map((c: Record<string, unknown>) =>
          typeof (c as { content?: string }).content === "string"
            ? (c as { content: string }).content
            : typeof (c as { text?: string }).text === "string"
              ? (c as { text: string }).text
              : ""
        )
        .filter(Boolean)
        .join("\n\n---\n\n");
    return contextStr.trim() || null;
  } catch {
    return null;
  }
}

/**
 * List CNR folders in the scraped cases directory.
 */
export async function listCaseFolders(sourcePath: string): Promise<string[]> {
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && /^[A-Z0-9]{16,}$/i.test(e.name))
    .map((e) => path.join(sourcePath, e.name));
}

/**
 * Absorb all cases from the scraped cases directory.
 */
export async function absorbAllCases(sourcePath: string): Promise<CaseAbsorbResult[]> {
  const folders = await listCaseFolders(sourcePath);
  const results: CaseAbsorbResult[] = [];

  for (const folder of folders) {
    try {
      const result = await absorbCase(folder);
      results.push(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Case absorption failed", { folder, error: msg });
      results.push({ cnr: path.basename(folder), totalChunks: 0, success: false, error: msg });
    }
  }

  return results;
}
