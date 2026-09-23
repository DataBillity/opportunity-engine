import { NextResponse } from "next/server";
import { PursuitIngestResult } from "@opportunity-engine/contracts";
import {
  capSourceText,
  extractSolicitationHeuristic,
  mergeSolicitationExtractions,
  resolveProjectType,
  scorePursuitTriage,
} from "@opportunity-engine/core";
import {
  extractSolicitationWithModel,
  getAvailableProviders,
  describeMissingKeys,
  ModelGatewayError,
} from "@opportunity-engine/ai";
import {
  extractDocumentText,
  kindForLane,
  MAX_FILE_BYTES,
  MAX_FILES,
} from "@/lib/extract-document";

export const runtime = "nodejs";
export const maxDuration = 60;

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 12;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export async function GET() {
  const providers = getAvailableProviders();
  return NextResponse.json({
    ready: true,
    modelExtraction: providers.claude || providers.gemini,
    providers,
    hint: providers.claude || providers.gemini ? undefined : describeMissingKeys(),
  });
}

export async function POST(request: Request) {
  if (tooManyAttempts(clientKey(request))) {
    return NextResponse.json({ error: "Too many ingest requests. Try again shortly." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const laneRaw = String(form.get("lane") ?? "B");
  const projectTypeRaw = String(form.get("projectType") ?? "").trim().toLowerCase();
  const selectedType = projectTypeRaw === "rfi" || projectTypeRaw === "sow" || projectTypeRaw === "rfp"
    ? projectTypeRaw
    : undefined;
  const lane = selectedType === "sow" || laneRaw === "C" ? "C" : "B";
  const organizationName = String(form.get("organizationName") ?? "").trim() || "Unknown account";
  const organizationIndustry = String(form.get("organizationIndustry") ?? "").trim() || undefined;
  const organizationChannel = String(form.get("organizationChannel") ?? "").trim() || undefined;
  const organizationSummary = String(form.get("organizationSummary") ?? "").trim() || undefined;
  const priorText = String(form.get("priorText") ?? "").trim();

  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Upload at most ${MAX_FILES} files` }, { status: 400 });
  }

  const extracted = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${file.name} exceeds the 12 MB limit` }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await extractDocumentText({
      name: file.name,
      mime: file.type,
      bytes,
    });
    extracted.push(doc);
  }

  const combined = [priorText, ...extracted.map(doc => doc.text).filter(Boolean)]
    .join("\n\n")
    .trim();
  const capped = capSourceText(combined);
  const primaryName = extracted[0]?.name || "solicitation.txt";
  const resolvedType = resolveProjectType({
    selected: selectedType,
    lane,
    text: capped.text,
    filename: primaryName,
  });
  const projectType = resolvedType.projectType;
  let extraction = extractSolicitationHeuristic(capped.text, primaryName, projectType);
  let provider: "claude" | "gemini" | "heuristic" = "heuristic";
  let modelVersion = "heuristic-triage-v1";
  let usedModel = false;
  let warning: string | undefined;

  if (!capped.text) {
    warning = extracted.length
      ? "No extractable text (scanned PDF or unsupported type). Scoring is pending until a text document is attached."
      : "No document text was provided.";
  } else {
    const providers = getAvailableProviders();
    if (providers.claude || providers.gemini) {
      try {
        const model = await extractSolicitationWithModel({
          filename: primaryName,
          lane,
          projectType,
          organizationName,
          organizationIndustry,
          documentText: capped.text,
        });
        extraction = mergeSolicitationExtractions(extraction, model.extraction);
        provider = model.provider;
        modelVersion = model.modelVersion;
        usedModel = true;
      } catch (err) {
        warning = err instanceof ModelGatewayError
          ? `Model extraction unavailable (${err.message}). Used the heuristic parser.`
          : "Model extraction failed. Used the heuristic parser.";
      }
    }
  }

  const triage = scorePursuitTriage({
    extraction,
    sourceText: capped.text,
    lane,
    projectType,
    filename: primaryName,
    org: {
      name: organizationName,
      industry: organizationIndustry,
      channel: organizationChannel,
      summary: organizationSummary,
    },
    provider,
    modelVersion,
  });

  const payload = PursuitIngestResult.parse({
    documents: extracted.map(doc => ({
      name: doc.name,
      kind: kindForLane(lane, doc.name),
      mime: doc.mime,
      sizeBytes: doc.sizeBytes,
      extractedChars: doc.text.length,
      parseStatus: doc.parseStatus,
    })),
    extraction,
    triage,
    sourceText: capped.text,
    sourceTextTruncated: capped.truncated,
    usedModel,
    warning,
  });

  return NextResponse.json(payload);
}
