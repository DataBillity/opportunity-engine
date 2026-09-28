export function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
  const candidate = (fence?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Model response did not contain a JSON object");
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    const repaired = closeTruncatedJson(candidate.slice(start));
    if (repaired === null) throw err;
    return JSON.parse(repaired);
  }
}

/**
 * Output cut off at the token limit ends mid-value. Cut back to the last complete
 * element and close the open arrays and objects so the complete fields survive.
 */
export function closeTruncatedJson(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let cut = -1;
  let closers: string[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      cut = i + 1;
      closers = [...stack];
      if (stack.length === 0) return text.slice(0, cut);
    } else if (ch === ",") {
      cut = i;
      closers = [...stack];
    }
  }

  if (cut < 0) return null;
  return `${text.slice(0, cut)}${closers.reverse().join("")}`;
}
