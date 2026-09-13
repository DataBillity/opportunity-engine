import mammoth from "mammoth";

export const MAX_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_FILES = 5;

export type ExtractStatus = "extracted" | "empty" | "unsupported";

export interface ExtractedDocument {
  name: string;
  mime: string;
  sizeBytes: number;
  text: string;
  parseStatus: ExtractStatus;
}

const TEXT_EXT = new Set([".txt", ".md", ".csv"]);
const DOCX_EXT = new Set([".docx"]);
const PDF_EXT = new Set([".pdf"]);

export function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

export function kindForLane(lane: "B" | "C", filename: string): "solicitation" | "sow" | "addendum" | "other" {
  const lower = filename.toLowerCase();
  if (/amend|addend|qa|q&a|question/.test(lower)) return "addendum";
  if (lane === "C" || /\bsow\b/.test(lower)) return "sow";
  if (/\brfp\b|solicitation|rfq|rfi/.test(lower)) return "solicitation";
  return lane === "B" ? "solicitation" : "sow";
}

export async function extractDocumentText(input: {
  name: string;
  mime: string;
  bytes: Uint8Array;
}): Promise<ExtractedDocument> {
  const ext = extensionOf(input.name);
  const mime = (input.mime || "").toLowerCase();
  let text = "";
  let parseStatus: ExtractStatus = "unsupported";

  try {
    if (PDF_EXT.has(ext) || mime.includes("pdf")) {
      text = await extractPdf(input.bytes);
      parseStatus = text.trim() ? "extracted" : "empty";
    } else if (DOCX_EXT.has(ext) || mime.includes("wordprocessingml")) {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) });
      text = result.value ?? "";
      parseStatus = text.trim() ? "extracted" : "empty";
    } else if (TEXT_EXT.has(ext) || mime.startsWith("text/")) {
      text = new TextDecoder("utf-8", { fatal: false }).decode(input.bytes);
      parseStatus = text.trim() ? "extracted" : "empty";
    } else {
      parseStatus = "unsupported";
    }
  } catch {
    parseStatus = text.trim() ? "extracted" : "empty";
  }

  return {
    name: input.name,
    mime: input.mime || "application/octet-stream",
    sizeBytes: input.bytes.byteLength,
    text: text.replace(/\u0000/g, "").trim(),
    parseStatus,
  };
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(bytes, { mergePages: true });
  return normalizePdfText(text);
}

function normalizePdfText(text: unknown): string {
  if (typeof text === "string") return text;
  if (Array.isArray(text)) return text.filter(part => typeof part === "string").join("\n");
  return "";
}
