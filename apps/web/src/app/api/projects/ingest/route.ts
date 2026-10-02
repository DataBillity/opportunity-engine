import { NextResponse } from "next/server";
import { PursuitIngestResult, type RfpGoNoGoAssessment, type ScopeSummarySource } from "@opportunity-engine/contracts";
import {
  applyGoNoGoToTriage,
  capSourceText,
  combineSolicitationDocuments,
  enforceGoNoGoRules,
  orderSolicitationDocuments,
  extractSolicitationHeuristic,
  mergeSolicitationExtractions,
  resolveProjectType,
  sanitizeRfiObjective,
  scorePursuitTriage,
} from "@opportunity-engine/core";
import {
  assessRfpGoNoGo,
  extractSolicitationWithModel,
  ModelGatewayError,
  runWithAnthropicKey,
} from "@opportunity-engine/ai";
import { buildGoNoGoSources } from "@/lib/gonogo-sources";
import { resolveModelAccess } from "@/lib/org-model";
import {
  extractDocumentText,
  kindForLane,
  MAX_FILE_BYTES,
  MAX_FILES,
} from "@/lib/extract-document";
import { readSharedWorkspace } from "@/lib/shared-workspace-store";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  const resolved = await resolveModelAccess();
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const ready = Boolean(resolved.access.apiKey);
  return NextResponse.json({
    ready: true,
    modelExtraction: ready,
    providers: { claude: ready },
    hint: ready ? undefined : resolved.access.missingMessage,
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

  const ordered = orderSolicitationDocuments(extracted);
  const combined = [priorText, combineSolicitationDocuments(extracted)]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const capped = capSourceText(combined);
  const primaryName = ordered[0]?.name || "solicitation.txt";
  const resolvedType = resolveProjectType({
    selected: selectedType,
    lane,
    text: capped.text,
    filename: primaryName,
  });
  const projectType = resolvedType.projectType;
  const heuristic = extractSolicitationHeuristic(capped.text, primaryName, projectType);
  let extraction = heuristic;
  let provider: "claude" | "gemini" | "heuristic" = "heuristic";
  let modelVersion = "heuristic-triage-v1";
  let usedModel = false;
  let warning: string | undefined;
  let summarySource: ScopeSummarySource = { engine: "heuristic" };
  let goNoGo: RfpGoNoGoAssessment | undefined;
  let enforcedGoNoGo: ReturnType<typeof enforceGoNoGoRules> | undefined;
  let goNoGoModel: { provider: "claude" | "gemini"; modelVersion: string } | undefined;
  const resolved = await resolveModelAccess();
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!resolved.access.apiKey && !resolved.access.usesPlatformKey) {
    return NextResponse.json({ error: resolved.access.missingMessage }, { status: 503 });
  }
  const workspace = await readSharedWorkspace(resolved.access.session.organizationId).catch(() => null);

  if (!capped.text) {
    warning = extracted.length
      ? "No extractable text (scanned PDF or unsupported type). Scoring is pending until a text document is attached."
      : "No document text was provided.";
  } else {
    if (resolved.access.apiKey) {
      const apiKey = resolved.access.apiKey;
      const documentNames = ordered.map(doc => doc.name);
      const goNoGoSources = projectType === "rfp"
        ? buildGoNoGoSources({
          documentText: capped.text,
          documentNames,
          organizationName,
          partners: workspace?.partners ?? [],
          graph: workspace?.graph ?? { capabilities: [], experience: [], credentials: [], people: [] },
          pursuits: workspace?.pursuits,
          organizations: workspace?.organizations,
        })
        : null;
      const [modelOutcome, goNoGoOutcome] = await runWithAnthropicKey(apiKey, () => Promise.all([
        extractSolicitationWithModel({
          filename: primaryName,
          lane,
          projectType,
          organizationName,
          organizationIndustry,
          documentText: capped.text,
          documentNames,
        }).then(model => ({ ok: true as const, model }), err => ({ ok: false as const, err })),
        goNoGoSources
          ? assessRfpGoNoGo(goNoGoSources).then(
            result => ({
              ok: true as const,
              enforced: enforceGoNoGoRules(result.assessment),
              provider: result.provider,
              modelVersion: result.modelVersion,
            }),
            err => ({ ok: false as const, err }),
          )
          : Promise.resolve(null),
      ]));
      if (modelOutcome.ok) {
        const model = modelOutcome.model;
        extraction = mergeSolicitationExtractions(heuristic, model.extraction, {
          trustOverlayScope: projectType === "rfi" && model.summaryFromModel,
        });
        provider = model.provider;
        modelVersion = model.modelVersion;
        usedModel = true;
        if (model.summaryFromModel) {
          summarySource = {
            engine: "model",
            model: `${model.provider} / ${model.modelVersion}`,
            structureModel: model.structureModel,
          };
          if (!model.structureModel) {
            warning = "The model could not read the response questions and sections. They came from the text parser; check them before drafting.";
          }
        } else {
          warning = `The model summary failed (${model.summaryError ?? "unknown error"}). The Scope Summary came from the text parser.`;
          summarySource = { engine: "heuristic", note: warning };
        }
      } else {
        const err = modelOutcome.err;
        warning = err instanceof ModelGatewayError
          ? `Model extraction unavailable (${err.message}). Used the heuristic parser.`
          : "Model extraction failed. Used the heuristic parser.";
        summarySource = { engine: "heuristic", note: warning };
      }
      if (goNoGoOutcome?.ok) {
        enforcedGoNoGo = goNoGoOutcome.enforced;
        goNoGo = enforcedGoNoGo.assessment;
        goNoGoModel = { provider: goNoGoOutcome.provider, modelVersion: goNoGoOutcome.modelVersion };
        usedModel = true;
      } else if (goNoGoOutcome && !goNoGoOutcome.ok) {
        const err = goNoGoOutcome.err;
        const detail = err instanceof Error ? err.message : "unknown error";
        const note = `Go/No-Go assessment unavailable (${detail}). The recommendation uses requirement coverage.`;
        warning = warning ? `${warning} ${note}` : note;
      }
    } else {
      summarySource = { engine: "heuristic", note: "No model API keys are configured." };
    }
  }

  // Keep the Opportunity Scope Summary meaningful: never let an RFI objective
  // reduce to the market-research framing. Fall back to the heuristic-inferred
  // objective (already substantive) when the model returns only boilerplate.
  if (projectType === "rfi") {
    const cleaned = sanitizeRfiObjective(extraction.objective);
    extraction = {
      ...extraction,
      objective: cleaned.length ? cleaned : heuristic.objective,
    };
  }

  const capabilityCatalog = (workspace?.graph.capabilities ?? [])
    .filter(item => item.status !== "Archived")
    .map(item => ({ name: item.name }));

  const coverage = scorePursuitTriage({
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
    capabilityCatalog,
  });
  const assessed = enforcedGoNoGo ? applyGoNoGoToTriage(coverage, enforcedGoNoGo) : coverage;
  const triage = goNoGoModel ? { ...assessed, provider: goNoGoModel.provider, modelVersion: goNoGoModel.modelVersion } : assessed;

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
    summarySource,
    goNoGo,
  });

  return NextResponse.json(payload);
}
