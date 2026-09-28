import {
  ResponseDraftBriefing,
  ResponseDraftOutput,
  type ResponseDraftBriefing as ResponseDraftBriefingType,
} from "@opportunity-engine/contracts";
import { callModel, ModelGatewayError } from "./gateway";
import { parseModelJson } from "./json";

export const RESPONSE_DRAFT_PROMPT_VERSION = "response-draft-v1.3";

export interface ResponseGroundingFact {
  id: string;
  source: "rfp" | "people" | "experience" | "account";
  text: string;
}

export interface ResponseSectionDraft {
  body: string;
  gaps?: {
    id: string;
    location: string;
    gapType: string;
    description: string;
    owner: string;
    priority: string;
    due: string;
    status: string;
    notes: string;
  }[];
  insights: ResponseGroundingFact[];
  modelVersion: string;
  provider: "claude" | "gemini";
  promptVersion: string;
  latencyMs: number;
  usedFallback: boolean;
}

export function collectResponseFacts(
  briefing: ResponseDraftBriefingType,
  options: { includeSourceExcerpt?: boolean } = {},
): ResponseGroundingFact[] {
  const projectType = briefing.projectType ?? "rfp";
  const facts: ResponseGroundingFact[] = [];
  let rfp = 1;
  let people = 1;
  let experience = 1;
  let account = 1;

  const push = (source: ResponseGroundingFact["source"], text: string | undefined) => {
    const value = text?.trim();
    if (!value) return;
    const prefix = source === "rfp" ? "R" : source === "people" ? "P" : source === "experience" ? "E" : "A";
    const n = source === "rfp" ? rfp++ : source === "people" ? people++ : source === "experience" ? experience++ : account++;
    facts.push({ id: `${prefix}${n}`, source, text: value });
  };

  const org = briefing.organization;
  push("account", `${org.name}${org.industry ? ` (${org.industry})` : ""}.`);
  push("account", org.summary);

  const pursuit = briefing.pursuit;
  push(
    "rfp",
    `${pursuit.typeLabel} "${pursuit.name}"${pursuit.solicitationRef ? ` (${pursuit.solicitationRef})` : ""}.${
      pursuit.rec ? ` Decision: ${pursuit.rec}.` : ""
    }`,
  );
  if (pursuit.dueDate) push("rfp", `Response due ${pursuit.dueDate}.`);
  if (pursuit.documents.length) push("rfp", `Source documents: ${pursuit.documents.join(", ")}.`);
  for (const item of pursuit.docSummary?.objective ?? []) push("rfp", `Objective: ${item}`);
  for (const item of pursuit.docSummary?.challenges ?? []) push("rfp", `Challenge: ${item}`);
  for (const item of pursuit.docSummary?.services ?? []) push("rfp", `Likely service: ${item}`);
  for (const item of pursuit.docSummary?.deliverables ?? []) push("rfp", `Likely deliverable: ${item}`);
  for (const item of pursuit.docSummary?.responseConstraints ?? []) push("rfp", `Response format (shape the draft; do not treat as a reason to pursue): ${item}`);
  const rfi = pursuit.docSummary?.rfiSummary;
  if (rfi) {
    if (rfi.procurementObjective) push("rfp", `Procurement objective: ${rfi.procurementObjective}`);
    for (const theme of rfi.challengeThemes) push("rfp", `Challenge theme${theme.rootCause ? " (root cause)" : ""}: ${theme.theme} — ${theme.detail}`);
    for (const item of rfi.consequences) push("rfp", `Consequence the issuer names: ${item}`);
    if (rfi.endState) push("rfp", `Target end state: ${rfi.endState}`);
    for (const item of rfi.endStateConstraints) push("rfp", `End-state constraint: ${item}`);
    if (rfi.nextStep) push("rfp", `Next procurement step: ${rfi.nextStep}`);
    for (const item of rfi.services) {
      push("rfp", item.type === "explicit"
        ? `Requested service: ${item.service} (${item.evidence})`
        : `Inferred service — our reading, not an issuer requirement (${item.confidence ?? "Low"} confidence): ${item.service}. Evidence: ${item.evidence}`);
    }
    for (const item of rfi.gaps) push("rfp", `Known gap in the ${projectType.toUpperCase()} package: ${item}`);
    for (const item of rfi.issuerQuestions ?? []) {
      push("rfp", `Question for the issuer (${item.priority}, ${item.type}, ${item.timing || "timing not set"}): ${item.question} Basis: ${item.basis} (${item.evidence})`);
    }
    for (const item of rfi.evaluationCriteria ?? []) push("rfp", `Evaluation criterion: ${item}`);
    for (const item of rfi.commercialTerms ?? []) push("rfp", `Commercial term to review: ${item}`);
  }
  for (const item of pursuit.informationRequests ?? []) {
    push("rfp", projectType === "rfi" ? `Question to answer: ${item}` : `Requirement to address: ${item}`);
  }
  for (const item of pursuit.capabilities ?? []) push("experience", `Capability we can cite: ${item}`);
  for (const item of pursuit.mappedRequirements) push("rfp", `Mapped requirement: ${item}`);
  for (const item of pursuit.unmappedRequirements) push("rfp", `Unmapped requirement: ${item}`);
  for (const item of pursuit.gaps) push("rfp", `Gap: ${item}`);
  for (const item of pursuit.rationale) push("rfp", `Triage: ${item}`);
  if (options.includeSourceExcerpt !== false && pursuit.sourceExcerpt?.trim()) {
    push("rfp", `Source excerpt: ${pursuit.sourceExcerpt.trim()}`);
  }

  const primePartner = (briefing.partners ?? []).find(p => p.role === "Prime" || p.role === "prime");
  const primeName = primePartner?.name ?? "DataBillity";
  push("account", `${primeName} responds as Prime. Do not invent UEI, CAGE, NAICS, size, or socioeconomic status. When assigning action items or gaps, use "${primeName}" as the owner name instead of the generic "Prime".`);
  for (const partner of briefing.partners ?? []) {
    const covers = partner.covers.filter(Boolean);
    push(
      "account",
      `Teaming partner ${partner.name}${partner.role ? `. Directory type: ${partner.role}` : ""}. ${
        partner.confirmed
          ? `Confirmed on this response. Gap owner, if needed: Partner: ${partner.name}.`
          : `Not confirmed on this response. Do not assign gaps to this partner; assign ${primeName} and mention the partner in notes.`
      }${covers.length ? ` Covers: ${covers.join(", ")}.` : ""}${partner.summary ? ` ${partner.summary}` : ""}`,
    );
  }

  for (const person of briefing.people) {
    const roles = [person.assignedRole, person.role, ...(person.roles ?? [])].filter(Boolean);
    const uniqueRoles = [...new Set(roles.map(role => role!.trim()).filter(Boolean))];
    const tech = (person.technologies ?? []).filter(Boolean);
    const industries = (person.industries ?? []).filter(Boolean);
    const parts = [
      person.name,
      person.partnerName ? `Partner: ${person.partnerName}` : "",
      uniqueRoles.length ? `Roles: ${uniqueRoles.join(", ")}` : "",
      person.expertise?.trim(),
      tech.length ? `Technologies: ${tech.join(", ")}` : "",
      industries.length ? `Industries: ${industries.join(", ")}` : "",
    ].filter(Boolean);
    const header = parts.join(". ") + ".";
    push("people", person.resumeText?.trim()
      ? `${header}\nResume:\n${person.resumeText.trim()}`
      : header);
  }

  for (const item of briefing.experience) {
    const tech = (item.technologies ?? []).filter(Boolean);
    const services = (item.services ?? []).filter(Boolean);
    const parts = [
      item.name,
      item.industry ? `Industry: ${item.industry}` : "",
      tech.length ? `Technologies: ${tech.join(", ")}` : "",
      services.length ? `Services: ${services.join(", ")}` : "",
      item.summary?.trim(),
    ].filter(Boolean);
    push("experience", parts.join(". ") + ".");
  }

  return facts;
}

export function buildResponseDraftPrompt(
  briefing: ResponseDraftBriefingType,
  facts: ResponseGroundingFact[],
): string {
  const factBlock = facts.length
    ? facts.map(fact => `${fact.id} [${fact.source}] ${fact.text}`).join("\n")
    : "(none — write a short section that says the packet is too thin and do not invent coverage)";

  const lines = [
    `Section to draft: ${briefing.section.name}${briefing.section.ref ? ` (${briefing.section.ref})` : ""}`,
    `Section id: ${briefing.section.id}`,
    `Account: ${briefing.organization.name}`,
    "",
    "GROUNDING FACTS (you may only cite these):",
    factBlock,
  ];

  if (briefing.existingDraft?.trim()) {
    lines.push("", "EXISTING DRAFT TO REVISE:", briefing.existingDraft.trim());
  }
  if (briefing.instructions?.trim()) {
    lines.push("", "OPERATOR INSTRUCTIONS:", briefing.instructions.trim());
  }
  if (briefing.existingGapIds?.length) {
    lines.push("", "EXISTING GAP IDS (number new placeholders after the highest of these):", briefing.existingGapIds.join(", "));
  }

  return lines.join("\n");
}

export async function generateResponseDraft(rawBriefing: unknown): Promise<ResponseSectionDraft> {
  const briefing = ResponseDraftBriefing.parse(rawBriefing);
  const facts = collectResponseFacts(briefing);

  const projectType = briefing.projectType ?? "rfp";
  const rfi = projectType === "rfi";
  const { RFI_SECTION_PROMPT, bidSectionPrompt, normalizeSectionGaps } = await import("./rfi-response");
  const fallbackDue = briefing.pursuit.dueDate ?? "";
  const promptVersion = rfi ? "rfi-response-v1.0" : RESPONSE_DRAFT_PROMPT_VERSION;

  const draftWith = (preferProvider?: "claude" | "gemini") => callModel({
    tier: "judgment",
    preferProvider,
    promptVersion,
    systemPrompt: rfi ? RFI_SECTION_PROMPT : bidSectionPrompt(projectType),
    prompt: buildResponseDraftPrompt(briefing, facts),
    classification: "internal",
    redactionProfile: "response-draft-v1",
    maxTokens: 2200,
    temperature: 0.35,
    jsonMode: true,
    timeoutMs: 60_000,
  });
  const parseDraft = (content: string) => {
    const parsed = parseModelJson(content);
    return ResponseDraftOutput.parse(parsed && typeof parsed === "object"
      ? { ...parsed as object, gaps: normalizeSectionGaps(parsed, fallbackDue) }
      : parsed);
  };

  let result = await draftWith();
  let usedFallback = false;
  let draft: { body: string; usedInsightIds: string[]; gaps: { id: string; location: string; gapType: string; description: string; owner: string; priority: string; due: string; status: string; notes: string }[] };
  try {
    draft = parseDraft(result.content);
  } catch {
    const first = result;
    try {
      result = await draftWith(first.provider === "claude" ? "gemini" : "claude");
      draft = parseDraft(result.content);
    } catch {
      result = first;
      const raw = first.content.trim();
      if (!raw) {
        throw new ModelGatewayError("Model returned a draft that could not be parsed", "empty_response");
      }
      usedFallback = true;
      draft = { body: raw, usedInsightIds: [], gaps: [] };
    }
  }

  const byId = new Map(facts.map(fact => [fact.id, fact]));
  const insights = draft.usedInsightIds
    .map(id => byId.get(id))
    .filter((fact): fact is ResponseGroundingFact => Boolean(fact));

  return {
    body: draft.body.trim(),
    gaps: draft.gaps,
    insights: insights.length ? insights : facts.slice(0, 6),
    modelVersion: result.modelVersion,
    provider: result.provider,
    promptVersion,
    latencyMs: result.latencyMs,
    usedFallback,
  };
}
