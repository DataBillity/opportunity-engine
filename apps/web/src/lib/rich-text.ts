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
  return escapedLine.replace(/\[GAP-\d{3}[^\]]*\]/g, match => `<strong>${match}</strong>`);
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
