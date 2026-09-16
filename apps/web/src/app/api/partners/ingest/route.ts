import { NextResponse } from "next/server";
import { callModel, getAvailableProviders, parseModelJson, ModelGatewayError } from "@opportunity-engine/ai";
import { extractDocumentText, MAX_FILE_BYTES, MAX_FILES } from "@/lib/extract-document";
import {
  parsePartnerDocument,
  type PartnerIngestKind,
  type PartnerIngestResult,
} from "@/lib/partner-ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS: PartnerIngestKind[] = ["capabilities", "experience", "credentials", "people"];

function asKind(value: string): PartnerIngestKind {
  return KINDS.includes(value as PartnerIngestKind) ? value as PartnerIngestKind : "capabilities";
}

function mergeResults(kind: PartnerIngestKind, parts: PartnerIngestResult[]): PartnerIngestResult {
  return {
    kind,
    capabilities: parts.flatMap(part => part.capabilities),
    experience: parts.flatMap(part => part.experience),
    credentials: parts.flatMap(part => part.credentials),
    people: parts.flatMap(part => part.people),
    warning: parts.map(part => part.warning).filter(Boolean).join(" "),
  };
}

async function enhanceWithModel(kind: PartnerIngestKind, text: string, filename: string, fallback: PartnerIngestResult): Promise<PartnerIngestResult> {
  const providers = getAvailableProviders();
  if (!providers.claude && !providers.gemini) return fallback;
  try {
    const result = await callModel({
      tier: "extraction",
      promptVersion: "partner-ingest-v1",
      classification: "internal",
      redactionProfile: "partner-document",
      jsonMode: true,
      temperature: 0,
      maxTokens: 1200,
      systemPrompt: "Extract structured partner-graph records from the document. Return JSON only.",
      prompt: `Kind: ${kind}\nFilename: ${filename}\nReturn JSON shaped as:
{"capabilities":[{"name":""}],"experience":[{"name":"","industry":"","technologies":[],"services":[],"summary":""}],"credentials":[{"name":"","credType":"Certification|Insurance|Bonding|License","expiration":"","documentText":"","documentFileName":""}],"people":[{"name":"","roles":[],"expertise":"","technologies":[],"industries":[],"resumeText":"","resumeFileName":""}]}
Fill only the array that matches kind=${kind}. Use the document text:
${text.slice(0, 12000)}`,
    });
    const parsed = parseModelJson(result.content) as Partial<PartnerIngestResult>;
    return {
      kind,
      capabilities: parsed.capabilities?.length ? parsed.capabilities : fallback.capabilities,
      experience: parsed.experience?.length ? parsed.experience : fallback.experience,
      credentials: (parsed.credentials?.length ? parsed.credentials : fallback.credentials).map(item => ({
        ...item,
        documentText: item.documentText || text.slice(0, 8000),
        documentFileName: item.documentFileName || filename,
      })),
      people: (parsed.people?.length ? parsed.people : fallback.people).map(item => ({
        ...item,
        resumeText: item.resumeText || text.slice(0, 12000),
        resumeFileName: item.resumeFileName || filename,
      })),
    };
  } catch (error) {
    if (error instanceof ModelGatewayError) return fallback;
    return fallback;
  }
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const kind = asKind(String(form.get("kind") ?? "capabilities"));
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (!files.length) {
    return NextResponse.json({ error: "Upload at least one document" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Upload at most ${MAX_FILES} files` }, { status: 400 });
  }

  const parts: PartnerIngestResult[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${file.name} exceeds the 12 MB limit` }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractDocumentText({ name: file.name, mime: file.type, bytes });
    const heuristic = parsePartnerDocument(kind, extracted.text, file.name);
    parts.push(await enhanceWithModel(kind, extracted.text, file.name, heuristic));
  }

  return NextResponse.json(mergeResults(kind, parts));
}
