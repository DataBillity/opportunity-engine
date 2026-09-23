import type { Organization, Pursuit, PursuitDocument } from "@/lib/mock-data";
import { PursuitIngestResult, type ProjectType, type PursuitIngestResult as IngestResult } from "@opportunity-engine/contracts";
import {
  laneForProjectType,
  projectTypeFromLane,
  projectTypeLabel,
  recDecisionLabel,
} from "@opportunity-engine/core";

export class PursuitIngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PursuitIngestError";
  }
}

export function recLabel(rec: Pursuit["rec"], projectType?: ProjectType | string): string {
  const type = projectType === "rfi" || projectType === "sow" || projectType === "rfp"
    ? projectType
    : undefined;
  return recDecisionLabel(rec, type ?? "rfp");
}

export async function ingestPursuitDocuments(input: {
  org: Organization;
  lane: "B" | "C";
  projectType?: ProjectType;
  files: File[];
  priorText?: string;
}): Promise<IngestResult> {
  const form = new FormData();
  form.set("lane", input.lane);
  if (input.projectType) form.set("projectType", input.projectType);
  form.set("organizationName", input.org.name);
  form.set("organizationIndustry", input.org.industry);
  form.set("organizationChannel", input.org.channel);
  form.set("organizationSummary", input.org.summary);
  if (input.priorText) form.set("priorText", input.priorText);
  for (const file of input.files) form.append("files", file);

  const response = await fetch("/api/projects/ingest", {
    method: "POST",
    body: form,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PursuitIngestError(
      typeof json.error === "string" ? json.error : `Ingest failed (${response.status})`,
    );
  }
  const parsed = PursuitIngestResult.safeParse(json);
  if (!parsed.success) {
    throw new PursuitIngestError("Ingest returned an invalid triage packet");
  }
  return parsed.data;
}

export async function createPursuitFromForm(input: {
  org: Organization;
  name: string;
  lane?: "B" | "C";
  projectType?: ProjectType;
  solicitationRef: string;
  files: File[];
}): Promise<{ pursuit: Pursuit; ingested: boolean; warning?: string }> {
  const id = `OPP-${Date.now().toString().slice(-4)}`;
  const projectType = input.projectType ?? projectTypeFromLane(input.lane ?? "B");
  const lane = input.lane ?? laneForProjectType(projectType);
  const typeLabel = projectTypeLabel(projectType);
  const fallbackRef = input.solicitationRef || (
    projectType === "rfi" ? `RFI-${id.slice(-4)}` : projectType === "sow" ? "Direct SOW" : `RFP-${id.slice(-4)}`
  );
  const base = emptyPursuit({
    id,
    orgId: input.org.id,
    name: input.name || "Untitled project",
    typeLabel,
    projectType,
    solicitationRef: fallbackRef,
    lane,
  });

  if (!input.files.length) {
    return { pursuit: base, ingested: false };
  }

  const result = await ingestPursuitDocuments({
    org: input.org,
    lane,
    projectType,
    files: input.files,
  });

  return {
    pursuit: applyIngestToPursuit(base, result, {
      name: input.name,
      solicitationRef: input.solicitationRef,
    }),
    ingested: true,
    warning: result.warning,
  };
}

export function applyIngestToPursuit(
  pursuit: Pursuit,
  result: IngestResult,
  overrides?: { name?: string; solicitationRef?: string },
): Pursuit {
  const extraction = result.extraction;
  const triage = result.triage;
  const projectType = triage.projectType ?? pursuit.projectType ?? projectTypeFromLane(pursuit.lane);
  const documents: PursuitDocument[] = [
    ...pursuit.documents,
    ...result.documents.filter(doc => !pursuit.documents.some(existing => existing.name === doc.name)),
  ];
  return {
    ...pursuit,
    name: overrides?.name?.trim() || extraction.inferredName || pursuit.name,
    typeLabel: projectTypeLabel(projectType),
    projectType,
    lane: laneForProjectType(projectType),
    solicitationRef: overrides?.solicitationRef?.trim() || extraction.solicitationRef || pursuit.solicitationRef,
    dueDate: extraction.dueDate ?? pursuit.dueDate,
    documents,
    docSummary: {
      objective: extraction.objective,
      services: extraction.services,
      deliverables: extraction.deliverables,
    },
    score: triage.score,
    rec: triage.rec,
    confidence: triage.confidence,
    confidenceNote: triage.confidenceNote,
    scoreBreakdown: triage.scoreBreakdown,
    status: triage.status,
    rationale: triage.rationale,
    reqmap: triage.reqmap,
    gaps: triage.gaps,
    rfund: triage.rfund,
    complianceMatrix: triage.complianceMatrix.length ? triage.complianceMatrix : pursuit.complianceMatrix,
    sourceText: result.sourceText,
    sourceTextTruncated: result.sourceTextTruncated,
    triageMode: result.usedModel ? "model" : result.sourceText ? "heuristic" : "pending",
    decisionRecord: {
      ...pursuit.decisionRecord,
      type: projectType === "rfi"
        ? "D4 — Respond/Pass triage (uploaded RFI)"
        : "D4 — Go/No-Go triage (uploaded solicitation)",
      model: `${triage.provider} / ${triage.modelVersion}`,
      action: triage.decisionAction,
    },
  };
}

function emptyPursuit(input: {
  id: string;
  orgId: string;
  name: string;
  typeLabel: string;
  projectType: ProjectType;
  solicitationRef: string;
  lane: "B" | "C";
}): Pursuit {
  return {
    id: input.id,
    orgId: input.orgId,
    name: input.name,
    typeLabel: input.typeLabel,
    projectType: input.projectType,
    solicitationRef: input.solicitationRef,
    lane: input.lane,
    score: 50,
    status: "New — awaiting triage",
    rec: "pending",
    confidence: 0,
    closed: false,
    dueDate: null,
    documents: [],
    docSummary: { objective: [], services: [], deliverables: [] },
    rationale: ["Awaiting initial triage and scoring."],
    reqmap: [],
    gaps: [],
    rfund: { lane: input.lane, tier: "pending", score: 0, note: "Not yet assessed." },
    triageMode: "pending",
    decisionRecord: {
      id: `DEC-${Date.now().toString().slice(-5)}`,
      type: input.projectType === "rfi" ? "D4 — Respond/Pass triage" : "D4 — Go/No-Go triage",
      subject: `Project ${input.id}`,
      model: "triage-v3 / prompt v1.9 / graph v213",
      reviewer: "— not yet assigned",
      action: "Awaiting triage",
      retention: "3 years minimum",
    },
  };
}
