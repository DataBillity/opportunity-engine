export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(p|h[1-6]|li|div|blockquote|pre)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isEmptyRichText(html: string | undefined): boolean {
  if (!html?.trim()) return true;
  return htmlToPlainText(html).length === 0;
}

export function sanitizeRichText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function isBulletLine(line: string): boolean {
  return /^([•\-*]|\d+[.)])\s+/.test(line);
}

function listItemHtml(line: string): string {
  return `<li><p>${markGaps(line.replace(/^([•\-*]|\d+[.)])\s+/, ""))}</p></li>`;
}

function markGaps(escapedLine: string): string {
  return escapedLine.replace(/\[GAP-\d{3,4}[^\]]*\]/g, match => `<strong>${match}</strong>`);
}

/** Inline markdown on an already-escaped line: bold, italics, code, GAP placeholders, and GRAPHIC notes. */
function inlineMarkdown(escapedLine: string): string {
  const bare = escapedLine.replace(/\*\*(\[GAP-\d{3,4}[^\]]*\])\*\*/g, "$1");
  return markGaps(bare)
    .replace(/\[GRAPHIC:([^\]]*)\]/gi, (_, note: string) => `<em>[GRAPHIC:${note}]</em>`)
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** Cells of a table row. Pipes inside brackets belong to a GAP placeholder, not the table. */
function tableCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let depth = 0;
  let cell = "";
  for (const ch of inner) {
    if (ch === "[") depth++;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "|" && depth === 0) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/**
 * Model markdown as editor HTML. The editor has h2/h3 headings and no tables, so `#`/`##` become h2,
 * deeper headings h3, and each table row becomes a list item of labelled cells.
 */
export function markdownToHtml(markdown: string): string {
  const lines = escapeHtml(markdown.replace(/\u0000/g, "").replace(/\r\n?/g, "\n")).split("\n");
  const parts: string[] = [];
  let paragraph: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let items: string[] = [];
  let table: string[][] = [];

  const flushParagraph = () => {
    if (paragraph.length) parts.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (listKind && items.length) parts.push(`<${listKind}>${items.join("")}</${listKind}>`);
    listKind = null;
    items = [];
  };
  const flushTable = () => {
    const [header = [], ...body] = table;
    if (table.length) {
      const rows = body.length ? body : [header];
      const labelled = rows.map(row => row
        .map((cell, index) => {
          const label = body.length ? header[index] : "";
          return label && cell ? `<strong>${label}:</strong> ${inlineMarkdown(cell)}` : inlineMarkdown(cell);
        })
        .filter(Boolean)
        .join("; "));
      parts.push(`<ul>${labelled.map(row => `<li><p>${row}</p></li>`).join("")}</ul>`);
    }
    table = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushAll();
      continue;
    }
    if (line.startsWith("|")) {
      flushParagraph();
      flushList();
      if (!/^\|?[\s:|-]+\|?$/.test(line)) table.push(tableCells(line));
      continue;
    }
    flushTable();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const tag = heading[1]!.length <= 2 ? "h2" : "h3";
      parts.push(`<${tag}>${inlineMarkdown(heading[2]!.replace(/\s+#+$/, ""))}</${tag}>`);
      continue;
    }
    if (isBulletLine(line)) {
      flushParagraph();
      const nextKind = /^\d+[.)]\s+/.test(line) ? "ol" : "ul";
      if (listKind && listKind !== nextKind) flushList();
      listKind = nextKind;
      items.push(`<li><p>${inlineMarkdown(line.replace(/^([•\-*]|\d+[.)])\s+/, ""))}</p></li>`);
      continue;
    }
    flushList();
    paragraph.push(line.replace(/^&gt;\s?/, ""));
  }
  flushAll();
  return parts.join("");
}

export function plainTextToHtml(text: string): string {
  const trimmed = text.replace(/\u0000/g, "").trim();
  if (!trimmed) return "";

  const blocks = escapeHtml(trimmed).split(/\n{2,}/);
  return blocks
    .map(block => {
      const lines = block.split("\n");
      const parts: string[] = [];
      let listKind: "ul" | "ol" | null = null;
      let items: string[] = [];

      const flushList = () => {
        if (!listKind || items.length === 0) return;
        parts.push(`<${listKind}>${items.join("")}</${listKind}>`);
        listKind = null;
        items = [];
      };

      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (isBulletLine(line)) {
          const nextKind = /^\d+[.)]\s+/.test(line) ? "ol" : "ul";
          if (listKind && listKind !== nextKind) flushList();
          listKind = nextKind;
          items.push(listItemHtml(line));
          continue;
        }
        flushList();
        parts.push(`<p>${markGaps(line)}</p>`);
      }
      flushList();
      return parts.join("");
    })
    .join("");
}
