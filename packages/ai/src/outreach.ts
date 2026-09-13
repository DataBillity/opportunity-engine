import {
  OutreachBriefing,
  OutreachDraftOutput,
  type OutreachBriefing as OutreachBriefingType,
} from "@opportunity-engine/contracts";
import { callModel, ModelGatewayError } from "./gateway";
import { parseModelJson } from "./json";

export const OUTREACH_PROMPT_VERSION = "outreach-v1.0";

export interface GroundingFact {
  id: string;
  source: "lead" | "rfp";
  text: string;
}

export interface OutreachDraft {
  subject: string;
  body: string;
  insights: GroundingFact[];
  modelVersion: string;
  provider: "claude" | "gemini";
  promptVersion: string;
  latencyMs: number;
}

const SYSTEM_PROMPT = `You write short, specific outreach emails for DataBillity (Billity AI).

Hard rules:
- Cite only facts listed under GROUNDING FACTS. If a fact is not listed, do not use it.
- Do not invent meetings, prior work with this account, capabilities, dates, or commitments.
- If the selected RFP/SOW is No-Go or closed, do not write as if you are bidding on it. You may reference adjacent timing, budget, or a future phase only when those facts are listed.
- If the briefing is thin, write a short discovery note. Do not invent a reason they should talk.
- Tone: peer-to-peer, concrete, no hype, no "I hope this finds you well", no "synergies".
- 120–180 words. One clear ask (a 15-minute call or a specific next step).
- Sign as the named sender from DataBillity.

Return ONLY JSON with this shape:
{
  "subject": "string",
  "body": "string",
  "usedInsightIds": ["L1", "P2"]
}`;

export function collectGroundingFacts(briefing: OutreachBriefingType): GroundingFact[] {
  const facts: GroundingFact[] = [];
  const org = briefing.organization;
  let lead = 1;
  let rfp = 1;

  const pushLead = (text: string | undefined) => {
    const value = text?.trim();
    if (!value) return;
    facts.push({ id: `L${lead++}`, source: "lead", text: value });
  };
  const pushRfp = (text: string | undefined) => {
    const value = text?.trim();
    if (!value) return;
    facts.push({ id: `P${rfp++}`, source: "rfp", text: value });
  };

  const identity = [org.industry, org.channel ? `Channel: ${org.channel}` : ""]
    .filter(Boolean)
    .join(" · ");
  pushLead(identity || undefined);
  pushLead(org.summary);
  pushLead(org.whyGoodFit);
  for (const factor of org.scoreFactors) pushLead(factor);
  for (const note of org.notes) pushLead(note);
  if (typeof org.score === "number") {
    pushLead(`Opportunity alignment score ${org.score}/100.`);
  }

  const pursuit = briefing.pursuit;
  if (pursuit) {
    const rec = pursuit.rec ? ` Decision: ${pursuit.rec}${pursuit.closed ? " (closed)" : ""}.` : "";
    pushRfp(
      `${pursuit.typeLabel} "${pursuit.name}"${pursuit.solicitationRef ? ` (${pursuit.solicitationRef})` : ""}.${rec}`,
    );
    if (pursuit.dueDate) pushRfp(`Response due ${pursuit.dueDate}.`);
    if (pursuit.status) pushRfp(`Current status: ${pursuit.status}.`);
    for (const item of pursuit.docSummary?.objective ?? []) pushRfp(`Objective: ${item}`);
    for (const item of pursuit.docSummary?.services ?? []) pushRfp(`Requested service: ${item}`);
    for (const item of pursuit.docSummary?.deliverables ?? []) pushRfp(`Deliverable: ${item}`);
    for (const item of pursuit.mappedRequirements) pushRfp(`Capability match: ${item}`);
    for (const item of pursuit.gaps) pushRfp(`Gap: ${item}`);
    for (const item of pursuit.rationale) pushRfp(`Triage: ${item}`);
  }

  return facts.slice(0, 22);
}

export function buildOutreachPrompt(briefing: OutreachBriefingType, facts: GroundingFact[]): string {
  const contact = briefing.organization.contact;
  const factBlock = facts.length
    ? facts.map(fact => `${fact.id} [${fact.source}] ${fact.text}`).join("\n")
    : "(none — write a short discovery note and do not invent reasons)";

  return [
    `Sender: ${briefing.senderName}${briefing.senderTitle ? `, ${briefing.senderTitle}` : ""} at ${briefing.senderCompany}.`,
    `Account: ${briefing.organization.name}`,
    contact
      ? `Recipient: ${contact.name}${contact.title ? `, ${contact.title}` : ""}.`
      : "Recipient: no named contact — address the relevant team.",
    "",
    "GROUNDING FACTS (you may only cite these):",
    factBlock,
  ].join("\n");
}

export async function generateOutreachDraft(rawBriefing: unknown): Promise<OutreachDraft> {
  const briefing = OutreachBriefing.parse(rawBriefing);
  const facts = collectGroundingFacts(briefing);

  const result = await callModel({
    tier: "judgment",
    promptVersion: OUTREACH_PROMPT_VERSION,
    systemPrompt: SYSTEM_PROMPT,
    prompt: buildOutreachPrompt(briefing, facts),
    classification: "internal",
    redactionProfile: "outreach-v1",
    maxTokens: 1200,
    temperature: 0.4,
    jsonMode: true,
  });

  let parsed: unknown;
  try {
    parsed = parseModelJson(result.content);
  } catch {
    throw new ModelGatewayError("Model returned a draft that could not be parsed", "empty_response");
  }

  const draft = OutreachDraftOutput.parse(parsed);
  const byId = new Map(facts.map(fact => [fact.id, fact]));
  const insights = draft.usedInsightIds
    .map(id => byId.get(id))
    .filter((fact): fact is GroundingFact => Boolean(fact));

  return {
    subject: draft.subject.trim(),
    body: draft.body.trim(),
    insights: insights.length ? insights : facts.slice(0, 4),
    modelVersion: result.modelVersion,
    provider: result.provider,
    promptVersion: OUTREACH_PROMPT_VERSION,
    latencyMs: result.latencyMs,
  };
}
