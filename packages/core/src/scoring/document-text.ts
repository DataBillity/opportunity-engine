/**
 * Clean text extracted from PDFs and Word files before it is parsed or sent to a model:
 * drop table-of-contents entries, page markers, and running headers and footers,
 * and set headings apart so they never merge into the sentence that follows.
 * PURE — no I/O.
 */

const TOC_ENTRY = /\.{4,}\s*\d+\s*$/;
const PAGE_MARKER = /^(?:page\s+\d+(?:\s+of\s+\d+)?|\d+\s*\|\s*p\s*a\s*g\s*e|-\s*\d+\s*-|\d+)$/i;
const TOC_TITLE = /^table of contents$/i;

function isHeading(line: string): boolean {
  if (line.length > 90) return false;
  if (/^(?:[A-Z]|[IVX]{1,4}|\d{1,2})\.\s+[A-Z][A-Z0-9 ,&/()'’–-]{3,}$/.test(line)) return true;
  if (/^[A-Z][A-Z ]{3,}:/.test(line)) return true;
  const letters = line.replace(/[^A-Za-z]/g, "");
  return letters.length >= 4 && letters === letters.toUpperCase();
}

export function normalizeSolicitationText(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n").map(line => line.replace(/\s+/g, " ").trim());

  const counts = new Map<string, number>();
  for (const line of lines) {
    if (line && line.length <= 80) counts.set(line, (counts.get(line) ?? 0) + 1);
  }

  const out: string[] = [];
  for (const line of lines) {
    if (!line) {
      out.push("");
      continue;
    }
    if (TOC_ENTRY.test(line) || TOC_TITLE.test(line) || PAGE_MARKER.test(line)) continue;
    if ((counts.get(line) ?? 0) >= 3 && !/^(?:\d+\.\s|(?:A|Answer|Response)\s*:|[•▪●*-]\s)/i.test(line)) continue;
    if (isHeading(line)) {
      out.push("", line, "");
      continue;
    }
    out.push(line);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const DOCUMENT_LABEL = /^===== DOCUMENT: .* =====$/gm;

const SUPPORTING_DOCUMENT = /attach|\batt\s*\d|appendix|exhibit|addend|amend|\bq\s*&\s*a\b|\bqa\b|question|answers|worksheet|template|pricing|schedule/i;

export function isSupportingDocument(name: string): boolean {
  return SUPPORTING_DOCUMENT.test(name.replace(/[_.-]+/g, " "));
}

/** Main solicitation first (longest non-attachment), then attachments in natural name order. */
export function orderSolicitationDocuments<T extends { name: string; text: string }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => {
    const supportA = isSupportingDocument(a.name) ? 1 : 0;
    const supportB = isSupportingDocument(b.name) ? 1 : 0;
    if (supportA !== supportB) return supportA - supportB;
    if (!supportA) return b.text.length - a.text.length;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

/** One labeled, cleaned block per file so the model can tell the main RFI from its attachments. */
export function combineSolicitationDocuments(docs: { name: string; text: string }[]): string {
  return orderSolicitationDocuments(docs)
    .filter(doc => doc.text.trim())
    .map(doc => `===== DOCUMENT: ${doc.name} =====\n\n${normalizeSolicitationText(doc.text)}`)
    .join("\n\n");
}

const QA_TITLE = /response(?:s)? to (?:the )?(?:potential |prospective )?(?:vendor|respondent|bidder|offeror)s?['’]? questions|vendor questions|questions? (?:and|&) (?:answers|responses)|\bq\s*&\s*a\b/i;

/**
 * A document of vendor questions and the issuer's answers. Its questions were asked by
 * other vendors, so they are never questions for us to answer or sections for us to draft.
 */
export function isQuestionAnswerDocument(name: string, text: string): boolean {
  return QA_TITLE.test(name.replace(/[_.-]+/g, " ")) || QA_TITLE.test(text.slice(0, 600));
}

const LABEL_LINE = /^===== DOCUMENT: (.*) =====$/m;

/** Split text built by combineSolicitationDocuments back into its labeled documents. */
export function splitLabeledDocuments(text: string): { name: string; body: string }[] {
  const parts = text.split(new RegExp(LABEL_LINE.source, "gm"));
  const docs: { name: string; body: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) docs.push({ name: parts[i]!, body: parts[i + 1]!.trim() });
  return docs;
}

/**
 * Replace each vendor Q&A document with a one-line note, keeping every other document
 * and its label. Text with no document labels is returned unchanged.
 */
export function omitQuestionAnswerDocuments(text: string, note = "vendor questions and issuer answers omitted"): string {
  const docs = splitLabeledDocuments(text);
  if (!docs.length) return text;
  return docs
    .map(doc => `===== DOCUMENT: ${doc.name} =====\n\n${isQuestionAnswerDocument(doc.name, doc.body) ? (note ? `[${note}]` : "") : doc.body}`)
    .join("\n\n");
}
