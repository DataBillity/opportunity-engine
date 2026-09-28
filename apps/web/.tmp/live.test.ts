import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { it } from "vitest";
import { extractDocumentText } from "../src/lib/extract-document";
import {
  capSourceText,
  combineSolicitationDocuments,
  extractSolicitationHeuristic,
  mergeSolicitationExtractions,
  orderSolicitationDocuments,
} from "@opportunity-engine/core";
import { extractSolicitationWithModel } from "@opportunity-engine/ai";

const roots = [process.cwd(), resolve(process.cwd(), ".."), resolve(process.cwd(), "../..")];
for (const root of roots) {
  for (const rel of [".env.local", "apps/web/.env.local"]) {
    const file = resolve(root, rel);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || match[1] === "GEMINI_API_KEY") continue;
      if (!process.env[match[1]!]) process.env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
    }
  }
}

const dir = "C:/Users/Lenovo/Downloads/";
const files = [
  "26-001_CalVCB_2026_RFI_Modernization_Solution_Attachment_1.docx",
  "26-001_CalVCB_2026_RFI_Modernization_Solution_Attachment_2.pdf",
  "26-001_CalVCB_2026_RFI_Modernization_Solution_final.pdf",
  "26-001CalVCB_2026_RFI_Modernization_Solution_Attachment_3.pdf",
];

it("extracts the CalVCB package end to end", async () => {
  const docs = [];
  for (const name of files) {
    const bytes = new Uint8Array(readFileSync(dir + name));
    docs.push(await extractDocumentText({ name, mime: "", bytes }));
  }
  const ordered = orderSolicitationDocuments(docs);
  const capped = capSourceText(combineSolicitationDocuments(docs));
  writeFileSync(new URL("./combined.txt", import.meta.url), capped.text);
  const heuristic = extractSolicitationHeuristic(capped.text, ordered[0]!.name, "rfi");
  const started = Date.now();
  const model = await extractSolicitationWithModel({
    filename: ordered[0]!.name,
    lane: "B",
    projectType: "rfi",
    organizationName: "California Victim Compensation Board",
    documentText: capped.text,
    documentNames: ordered.map(doc => doc.name),
  });
  const merged = mergeSolicitationExtractions(heuristic, model.extraction, { trustOverlayScope: model.summaryFromModel });
  writeFileSync(new URL("./live-out.json", import.meta.url), JSON.stringify({
    seconds: (Date.now() - started) / 1000,
    provider: model.provider,
    modelVersion: model.modelVersion,
    summaryFromModel: model.summaryFromModel,
    summaryError: model.summaryError,
    chars: capped.text.length,
    order: ordered.map(doc => doc.name),
    extraction: merged,
  }, null, 2));
}, 300_000);
