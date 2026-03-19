# Example: Legal & Tax AI Assistant

This repository is an **example product** that demonstrates how to use the memory SDK (`@tinyhumansai/neocortex`) in a real application. It shows ingestion, namespaced storage, and RAG-style query patterns.

## What This App Does

A single Next.js app with:

- **Chat** — Q&A over ingested tax/legal books and court cases, with answers grounded in retrieved chunks.
- **Case Search** — Fetch cases by CNR, search books, and find relevant cases from ingested data.
- **Book & case ingestion** — PDFs and scraped case JSON are chunked and stored via the SDK for later retrieval.

All long-term memory and retrieval (books and cases) are powered by the SDK; there is no separate vector database in this example.

## How the SDK Is Used

### 1. Client setup

The app uses one shared SDK client, created with a token (and optional base URL) from environment variables. The client is used for both ingestion and query.

- **Config:** `ALPHAHUMAN_TOKEN` (required for memory features), optional `ALPHAHUMAN_BASE_URL`.
- **Package:** `@tinyhumansai/neocortex`.

### 2. Ingestion (write)

- **Books:** PDFs in a `books/` directory are parsed, split into text chunks, and sent to the SDK via **`insertMemory`** with namespace `"books"`. Each chunk is stored with a title (e.g. book name + chunk index) and the chunk text as content.
- **Cases:** Scraped court case documents are chunked and stored via **`insertMemory`** with namespace `"cases"**. Case metadata (e.g. CNR) is included so chunks can be associated with specific cases.

Ingestion is triggered by:

- **Books:** `POST /api/books/absorb` (per file or all PDFs in `books/`).
- **Cases:** A script that reads from a scraped-cases data directory and calls the same ingestion service.

### 3. Query (read / RAG)

- **`queryMemory`** is used with a text query, namespace, and optional `maxChunks` to get relevant chunks.
- **Namespaces:**  
  - `"books"` — for tax/legal book content.  
  - `"cases"` — for court case content.
- **Where it’s used in the app:**
  - **Main chat** — Retrieves relevant book chunks and injects them into the agent context for grounded answers.
  - **Case Search** — Retrieves both book and case chunks and uses them in the case-search agent.
  - **Book search API** — Direct query over the `"books"` namespace.
  - **Case lookup by CNR** — Queries the `"cases"` namespace with the CNR to find chunks for that case.

So in this example, the SDK is used for:

- **Storing** chunked books and cases in two namespaces.
- **Retrieving** relevant chunks by semantic query for RAG and by case identifier (CNR).

## Running the Example

The application and full setup instructions live in the **`legal-tax-advisor/`** directory. From there you can:

1. Install dependencies and configure environment (including `ALPHAHUMAN_TOKEN`).
2. Run the Next.js dev server.
3. Ingest books (and optionally cases) so that chat and case search use the SDK-backed memory.

See **[legal-tax-advisor/README.md](legal-tax-advisor/README.md)** for prerequisites, env vars, and step-by-step run instructions.

## Summary

| Use case        | SDK method     | Namespace | Purpose                                      |
|----------------|----------------|-----------|----------------------------------------------|
| Book ingestion | `insertMemory` | `books`   | Store PDF-derived text chunks                |
| Case ingestion | `insertMemory` | `cases`   | Store court case chunks                      |
| Chat / RAG      | `queryMemory`  | `books`   | Retrieve relevant book chunks for the agent  |
| Case Search    | `queryMemory`  | `books`, `cases` | Retrieve book + case chunks for answers |
| Book search API| `queryMemory`  | `books`   | Direct semantic search over books            |
| Case by CNR    | `queryMemory`  | `cases`   | Find chunks for a specific case              |

This example is intended to illustrate SDK usage only; it is not a supported product or service.
