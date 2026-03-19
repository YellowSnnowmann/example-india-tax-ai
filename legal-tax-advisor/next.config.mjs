/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
  },
  // pdf-parse, pdfjs-dist, external vector store, and LangChain don't work when bundled by webpack; run them in Node (Next 14).
  experimental: {
    serverComponentsExternalPackages: [
      "pdf-parse",
      "pdfjs-dist",
      "external vector store",
      "langchain",
      "@langchain/core",
      "@langchain/openai",
      "@langchain/langgraph",
    ],
  },
};

export default nextConfig;
