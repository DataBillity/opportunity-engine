import {
  ResponseDraftBriefing,
  ResponseDraftOutput,
  type ResponseDraftBriefing as ResponseDraftBriefingType,
} from "@opportunity-engine/contracts";
import { callModel, ModelGatewayError } from "./gateway";
import { parseModelJson } from "./json";

export const RESPONSE_DRAFT_PROMPT_VERSION = "response-draft-v1.0";

export interface ResponseGroundingFact {
  id: string;
  source: "rfp" | "people" | "experience" | "account";
  text: string;
}

export interface ResponseSectionDraft {
  body: string;
  insights: ResponseGroundingFact[];
  modelVersion: string;
  provider: "claude" | "gemini";
  promptVersion: string;
  latencyMs: number;
  usedFallback: boolean;
}

const SYSTEM_PROMPT = `You write one section of a DataBillity (Billity AI) bid response to an RFP or Statement of Work.

Hard rules:
- Cite only facts listed under GROUNDING FACTS. If a fact is not listed, do not use it.
- Do not invent past performance, clients, metrics, certifications, ATOs, staff, or technology we do not list.
- If a gap or unmapped requirement is listed, qualify it or describe how a partner would cover it. Do not pretend it is already solved.
- Past Performance and Key Personnel may only name people and engagements in the grounding facts.
- Write prose paragraphs for the named section only. No cover letter, no other volumes, no HTML, no markdown headings.
- 220–420 words unless the facts are too thin; then write a short, honest section and say what is missing.
- Tone: precise, operator-facing, no hype, no "synergies", no "world-class".

Return ONLY JSON with this shape:
{
  "body": "string",
  "usedInsightIds": ["R1", "P1"]
}`;

export function collectResponseFacts(briefing: ResponseDraftBriefingType): ResponseGroundingFact[] {
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
  for (const item of pursuit.docSummary?.services ?? []) push("rfp", `Requested service: ${item}`);
  for (const item of pursuit.docSummary?.deliverables ?? []) push("rfp", `Deliverable: ${item}`);
  for (const item of pursuit.mappedRequirements) push("rfp", `Mapped requirement: ${item}`);
  for (const item of pursuit.unmappedRequirements) push("rfp", `Unmapped requirement: ${item}`);
  for (const item of pursuit.gaps) push("rfp", `Gap: ${item}`);
  for (const item of pursuit.rationale) push("rfp", `Triage: ${item}`);
  if (pursuit.sourceExcerpt?.trim()) {
    push("rfp", `Source excerpt: ${pursuit.sourceExcerpt.trim()}`);
  }

  for (const person of briefing.people) {
    const roles = [person.assignedRole, person.role, ...(person.roles ?? [])].filter(Boolean);
    const uniqueRoles = [...new Set(roles.map(role => role!.trim()).filter(Boolean))];
    const tech = (person.technologies ?? []).filter(Boolean);
    const industries = (person.industries ?? []).filter(Boolean);
    const parts = [
      person.name,
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

  return lines.join("\n");
}

export async function generateResponseDraft(rawBriefing: unknown): Promise<ResponseSectionDraft> {
  const briefing = ResponseDraftBriefing.parse(rawBriefing);
  const facts = collectResponseFacts(briefing);

  const result = await callModel({
    tier: "judgment",
    promptVersion: RESPONSE_DRAFT_PROMPT_VERSION,
    systemPrompt: SYSTEM_PROMPT,
    prompt: buildResponseDraftPrompt(briefing, facts),
    classification: "internal",
    redactionProfile: "response-draft-v1",
    maxTokens: 2200,
    temperature: 0.35,
    jsonMode: true,
    timeoutMs: 60_000,
  });

  let parsed: unknown;
  let usedFallback = false;
  try {
    parsed = parseModelJson(result.content);
  } catch {
    usedFallback = true;
    parsed = { body: result.content.trim(), usedInsightIds: [] };
  }

  let draft: { body: string; usedInsightIds: string[] };
  try {
    draft = ResponseDraftOutput.parse(parsed);
  } catch {
    const raw = result.content.trim();
    if (!raw) {
      throw new ModelGatewayError("Model returned a draft that could not be parsed", "empty_response");
    }
    usedFallback = true;
    draft = { body: raw, usedInsightIds: [] };
  }

  const byId = new Map(facts.map(fact => [fact.id, fact]));
  const insights = draft.usedInsightIds
    .map(id => byId.get(id))
    .filter((fact): fact is ResponseGroundingFact => Boolean(fact));

  return {
    body: draft.body.trim(),
    insights: insights.length ? insights : facts.slice(0, 6),
    modelVersion: result.modelVersion,
    provider: result.provider,
    promptVersion: RESPONSE_DRAFT_PROMPT_VERSION,
    latencyMs: result.latencyMs,
    usedFallback,
  };
}
