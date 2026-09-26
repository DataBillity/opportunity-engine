import {
  ResponseDraftBriefing,
  RfiResponsePackageOutput,
  type ResponseDraftBriefing as ResponseDraftBriefingType,
  type RfiComplianceRow,
  type RfiGapLogEntry,
  type RfiResponsePackageOutput as RfiResponsePackage,
} from "@opportunity-engine/contracts";
import { callModel, ModelGatewayError } from "./gateway";
import { parseModelJson } from "./json";
import { buildResponseDraftPrompt, collectResponseFacts, type ResponseGroundingFact } from "./response-draft";

export const RFI_RESPONSE_PROMPT_VERSION = "rfi-response-v1.0";

const GAP_TYPE_ALIASES: Record<string, RfiGapLogEntry["gapType"]> = {
  missing_information: "missing_information",
  missing_info: "missing_information",
  unverified_claim: "unverified_claim",
  unverified: "unverified_claim",
  capability_gap: "capability_gap",
  partner_input: "partner_input",
  decision_needed: "decision_needed",
  decision: "decision_needed",
  clarification: "clarification",
  clarification_for_the_issuer: "clarification",
  issuer_question: "clarification",
  compliance_risk: "compliance_risk",
  compliance: "compliance_risk",
};

export const RFI_SECTION_PROMPT = `You write one section of a DataBillity (Billity AI) response to a Request for Information. DataBillity is the Prime. A human reviewer approves and submits every response.

An RFI is market research, not a solicitation and not a binding offer. Inform the issuer, help shape a future requirement, and position the team. Do not write a proposal full of commitments, and do not write a brochure.

Hard rules:
- Cite only facts listed under GROUNDING FACTS. If a fact is not listed, do not use it.
- Never fabricate past performance, clients, contract numbers, certifications, personnel, metrics, identifiers (UEI, CAGE, NAICS, size, socioeconomic status), or partner capabilities.
- The first sentence of the section directly answers what that section is for. The rest supports it with methods, tools, standards, timelines, and outcomes that are actually in the facts.
- Use the issuer's terminology. Plain language, active voice, short paragraphs. No "world-class", "best-in-breed", "cutting-edge", "synergies".
- Attribute partner experience to that partner. Use a partner only when the facts say the partner is confirmed on the team.
- No commitments. Do not commit the Prime or a partner to terms, staffing, schedules, or teaming. Prefer "we would propose" or "our typical approach is".
- Pricing only if the RFI asks and only from figures in the facts. Label any estimate a non-binding rough order of magnitude.
- If something is missing, unverified, or a decision only a human can make, insert a placeholder in the prose: [GAP-### | Owner | Short action]. Number new placeholders after the highest EXISTING GAP id. Owner is "Prime" or "Partner: Name" for a confirmed partner only.
- Stay inside any page, font, or file limit in the facts. Answer what was asked.

Return ONLY JSON:
{
  "body": "section prose with [GAP-### | Owner | Description] placeholders inline",
  "usedInsightIds": ["R1"],
  "gaps": [{
    "id": "GAP-001",
    "location": "section name and RFI reference",
    "gapType": "missing_information",
    "description": "what is needed",
    "owner": "Prime",
    "priority": "High",
    "due": "YYYY-MM-DD",
    "status": "Open",
    "notes": "source or fallback"
  }]
}

gapType is one of: missing_information, unverified_claim, capability_gap, partner_input, decision_needed, clarification, compliance_risk.
priority is High (blocks submission or compliance), Medium (weakens the response), or Low.
Every placeholder in body has exactly one gaps entry with the same id, and every gaps entry appears in body.`;

export const RFI_PACKAGE_PROMPT = `You draft a complete Request for Information response for DataBillity (Billity AI) as Prime. A human reviewer approves and submits it. Return a complete, compliant first draft that shows what you assumed, what you could not verify, and who must supply what is missing.

An RFI is market research, not a binding offer. The response must do three things: answer the issuer's questions, help shape a future procurement in ways that serve the customer, and position DataBillity and its confirmed team. Do not write a proposal full of commitments, and do not write a brochure.

Work in this order, then return the package below:
1. Compliance: issuer, notice number, title, due date and time zone, question deadline, submission method, format rules, every numbered question, required administrative data, and acquisition signals (NAICS, set-aside, vehicle, period, budget, incumbent) when the facts include them.
2. Need: the problem, why now, what the issuer seems unsure about, and constraints.
3. Fit: for each area, Strong (direct past performance), Partial (related or partner-only), or Gap. Do not make the respond/pass call. Note which confirmed partner covers which area, and flag requirements that look written for a competitor.
4. Draft sections that mirror the RFI's headings and numbering. If SECTIONS TO DRAFT lists a structure, use those ids, refs, and titles exactly.
5. For every answer: first sentence answers the question; the rest supports it with specific methods, tools, standards, and outcomes from the facts. Use the issuer's words. Add customer-focused insight (risks, ambiguities, better approaches, acquisition recommendations) without exceeding the ask.
6. Gaps: anything missing, unverified, or undecided becomes a placeholder in the draft and one Gap Log row.
7. Administrative information for the Prime and each confirmed partner: name, address, identifiers, size and socioeconomic status, NAICS, vehicles, and point of contact. Missing items are gaps owned by that company.
8. Self-check: every question is answered or logged; every placeholder has one Gap Log row and vice versa; format limits are respected; no fabricated claims; tone is plain and customer-focused.

Placeholder format, in the draft body: [GAP-### | Owner | Short action]
Examples: [GAP-003 | Prime | Confirm current CMMI appraisal level and date]
Number gaps in the order they appear. Owner is "Prime", or "Partner: Name" only when that partner is confirmed on the team. Unconfirmed partners are named in notes, and the owner stays Prime.
Capability gaps are owned by Prime, with a note on whether a partner could close them.

Gap types: missing_information, unverified_claim, capability_gap, partner_input, decision_needed, clarification, compliance_risk.
Priority: High (blocks submission or compliance), Medium (weakens the response), Low (nice to have).
Set due a few days before the RFI deadline when a deadline is known. Status is Open.

Writing guardrails:
- Cite only GROUNDING FACTS. Never invent past performance, clients, contract numbers, certifications, people, metrics, or identifiers.
- No commitments to terms, staffing, schedules, or teaming. Use "we would propose" or "our typical approach is".
- Pricing only if requested and only from supplied figures, labeled as a non-binding rough order of magnitude.
- If the team cannot meet a requirement, log a capability gap. Do not obscure it.
- If the facts are thin, say so in the reviewer summary and use placeholders instead of invented coverage.
- If the RFI is only a sources-sought or capability statement, keep the draft tight (about 2–5 pages of substance).
- If it asks for draft SOW or PWS comments, put specific comments, tied to section numbers, in Recommendations.
- If it includes an industry-day or one-on-one registration, log that registration as a High Prime gap and mention it in the reviewer summary.

Return ONLY JSON with this shape:
{
  "reviewerSummary": "half a page at most: due date, time, time zone, submission method, fit, open gaps by owner and priority, decisions needed. Flag missing inputs at the top.",
  "compliance": [{ "requirement": "string", "rfiRef": "string", "responseSection": "section title", "owner": "Prime", "status": "Addressed or Open" }],
  "sections": [{ "id": "questions", "ref": "Questions", "title": "Responses to specific questions", "body": "prose with [GAP-### | Owner | Description] inline" }],
  "gaps": [{ "id": "GAP-001", "location": "Sec. title, Q3", "gapType": "missing_information", "description": "string", "owner": "Prime", "priority": "High", "due": "YYYY-MM-DD", "status": "Open", "notes": "string" }],
  "questions": ["suggested question for the issuer, only if a questions deadline may still be open"],
  "strategicNotes": "requirements to influence, competitor signals, teaming ideas for capability gaps",
  "usedInsightIds": ["R1"]
}`;

const PRIORITY_RANK: Record<RfiGapLogEntry["priority"], number> = { High: 0, Medium: 1, Low: 2 };

export function sortRfiGaps(gaps: RfiGapLogEntry[]): RfiGapLogEntry[] {
  return [...gaps].sort((a, b) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    || a.due.localeCompare(b.due)
    || a.id.localeCompare(b.id));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeGapType(value: unknown): RfiGapLogEntry["gapType"] {
  const raw = textOf(value).toLowerCase().replace(/[\s-]+/g, "_");
  return GAP_TYPE_ALIASES[raw] ?? "missing_information";
}

export function normalizePriority(value: unknown): RfiGapLogEntry["priority"] {
  const raw = textOf(value).toLowerCase();
  if (raw.startsWith("h")) return "High";
  if (raw.startsWith("l")) return "Low";
  return "Medium";
}

function normalizeStatus(value: unknown): RfiGapLogEntry["status"] {
  const raw = textOf(value).toLowerCase();
  if (raw.startsWith("res")) return "Resolved";
  if (raw.includes("progress")) return "In progress";
  return "Open";
}

function daysBefore(iso: string | null | undefined, days: number): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function normalizeGap(value: unknown, fallbackDue: string): RfiGapLogEntry | null {
  const row = asRecord(value);
  if (!row) return null;
  const description = textOf(row.description);
  const id = textOf(row.id).toUpperCase().replace(/\s+/g, "");
  if (!description || !/^GAP-\d{3}$/.test(id)) return null;
  return {
    id,
    location: textOf(row.location),
    gapType: normalizeGapType(row.gapType),
    description,
    owner: textOf(row.owner) || "Prime",
    priority: normalizePriority(row.priority),
    due: textOf(row.due) || fallbackDue,
    status: normalizeStatus(row.status),
    notes: textOf(row.notes),
  };
}

const PLACEHOLDER = /\[GAP-(\d{3})\s*\|\s*([^|\]]+?)\s*\|\s*([^\]]+?)\s*\]/g;

export function reconcileRfiPackage(
  raw: RfiResponsePackage,
  fallbackDue: string,
): RfiResponsePackage {
  const sections = raw.sections.map(section => ({ ...section, body: section.body.trim() }));
  const byId = new Map<string, RfiGapLogEntry>();
  for (const gap of raw.gaps) {
    if (!byId.has(gap.id)) byId.set(gap.id, gap);
  }

  let max = 0;
  for (const id of byId.keys()) {
    const n = Number(id.slice(4));
    if (n > max) max = n;
  }

  for (const section of sections) {
    for (const match of section.body.matchAll(PLACEHOLDER)) {
      const id = `GAP-${match[1]}`;
      const n = Number(match[1]);
      if (n > max) max = n;
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          location: section.title,
          gapType: "missing_information",
          description: match[3]!.trim(),
          owner: match[2]!.trim() || "Prime",
          priority: "Medium",
          due: fallbackDue,
          status: "Open",
          notes: "Added because the draft placeholder had no Gap Log row.",
        });
      }
    }
  }

  for (const gap of byId.values()) {
    const token = `[${gap.id}`;
    const present = sections.some(section => section.body.includes(token));
    if (present) continue;
    const target = sections.find(section =>
      gap.location.toLowerCase().includes(section.title.toLowerCase())
      || section.title.toLowerCase().includes(gap.location.toLowerCase()),
    ) ?? sections[sections.length - 1];
    if (!target) continue;
    const line = `[${gap.id} | ${gap.owner} | ${gap.description}]`;
    target.body = `${target.body.trim()}\n\n${line}`.trim();
  }

  return {
    ...raw,
    sections,
    gaps: sortRfiGaps([...byId.values()]),
  };
}

function nextGapId(n: number): string {
  return `GAP-${String(n).padStart(3, "0")}`;
}

function outlineSections(briefing: ResponseDraftBriefingType): { id: string; ref: string; title: string }[] {
  const listed = briefing.sections.length
    ? briefing.sections
    : [briefing.section];
  return listed.map(section => ({
    id: section.id,
    ref: section.ref || section.name,
    title: section.name,
  }));
}

export function fallbackRfiPackage(briefing: ResponseDraftBriefingType): RfiResponsePackage {
  const due = daysBefore(briefing.pursuit.dueDate, 3);
  const questions = briefing.pursuit.informationRequests ?? [];
  const unmapped = briefing.pursuit.unmappedRequirements ?? [];
  const constraints = briefing.pursuit.docSummary?.responseConstraints ?? [];
  const confirmed = briefing.partners.filter(partner => partner.confirmed);
  const outline = outlineSections(briefing);
  let n = 1;
  const gaps: RfiGapLogEntry[] = [];

  const push = (
    location: string,
    gapType: RfiGapLogEntry["gapType"],
    description: string,
    priority: RfiGapLogEntry["priority"],
    notes: string,
    owner = "Prime",
  ): string => {
    const id = nextGapId(n++);
    gaps.push({ id, location, gapType, description, owner, priority, due, status: "Open", notes });
    return `[${id} | ${owner} | ${description}]`;
  };

  const admin = push(
    "Company and team overview",
    "missing_information",
    "Provide DataBillity legal name, address, UEI, CAGE, NAICS, size, and socioeconomic status",
    "High",
    "Administrative identifiers are not in the grounding facts.",
  );
  const contact = push(
    "Points of contact",
    "missing_information",
    "Name the response point of contact, email, and phone",
    "High",
    "No confirmed point of contact is in the grounding facts.",
  );

  if (!briefing.pursuit.dueDate) {
    push(
      "Cover letter",
      "compliance_risk",
      "Confirm the response due date, time, and time zone",
      "High",
      "The packet has no due date.",
    );
  }
  if (!constraints.length) {
    push(
      "Cover letter",
      "compliance_risk",
      "Confirm page limit, file type, and submission method",
      "High",
      "No response-format rules were extracted.",
    );
  }

  const questionLines = questions.length
    ? questions.map((question, index) => {
      const placeholder = push(
        "Responses to specific questions",
        "missing_information",
        `Answer question ${index + 1} from verified company records`,
        "High",
        question,
      );
      return `${index + 1}. ${question}\n${placeholder}`;
    })
    : [push(
      "Responses to specific questions",
      "clarification",
      "Confirm the questions the issuer wants answered",
      "High",
      "No information requests were extracted from the RFI.",
    )];

  for (const item of unmapped) {
    push(
      "Understanding of the requirement",
      "capability_gap",
      `Decide how to address: ${item}`,
      "Medium",
      "No current team capability is mapped to this area.",
    );
  }

  const bodies = new Map<string, string>();
  const issuer = briefing.organization.name;
  const ref = briefing.pursuit.solicitationRef || briefing.pursuit.name;
  bodies.set("cover", [
    `${issuer} issued ${ref} to gather information, not to award a contract.`,
    briefing.pursuit.dueDate ? `A response is due ${briefing.pursuit.dueDate}.` : "",
    "This draft does not commit DataBillity or any partner to staffing, pricing, or teaming.",
    constraints.length ? `Format notes on file: ${constraints.join(" ")}` : "",
  ].filter(Boolean).join(" "));
  bodies.set("company", [
    `DataBillity would respond as Prime${confirmed.length ? ` with ${confirmed.map(partner => partner.name).join(", ")}` : ""}.`,
    "Company identifiers are not in the source packet.",
    admin,
  ].join(" "));
  bodies.set("understanding", [
    briefing.pursuit.docSummary?.objective?.[0]
      ? briefing.pursuit.docSummary.objective[0]
      : `${issuer} is researching a future requirement. The extracted packet does not yet support a fuller statement of need.`,
    unmapped.length
      ? "Areas with no mapped team capability are marked below for the reviewer."
      : "",
  ].filter(Boolean).join("\n\n"));
  bodies.set("questions", questionLines.join("\n\n"));
  bodies.set("experience", briefing.experience.length
    ? `${briefing.experience.slice(0, 4).map(item => item.name).join("; ")}. Expand only from the records on file.`
    : `No past-performance records were attached. Do not describe engagements that are not on file.\n\n${push(
      "Relevant experience",
      "missing_information",
      "Provide past performance the team can cite, with customer and dates",
      "Medium",
      "No experience records were in the grounding facts.",
    )}`);
  bodies.set("recommendations", "Recommendations for a future solicitation should wait until the reviewer confirms which gaps the team can close.");
  bodies.set("contacts", contact);

  const sections = outline.map(section => ({
    ...section,
    body: bodies.get(section.id) || `${section.title} is not drafted. The model was unavailable, so this section is a placeholder for the reviewer.`,
  }));

  const compliance: RfiComplianceRow[] = [
    ...questions.map((question, index) => ({
      requirement: question,
      rfiRef: `Q${index + 1}`,
      responseSection: "Responses to specific questions",
      owner: "Prime",
      status: "Open",
    })),
    ...constraints.map(rule => ({
      requirement: rule,
      rfiRef: "Format",
      responseSection: "Cover letter",
      owner: "Prime",
      status: "Open",
    })),
  ];

  const mapped = briefing.pursuit.mappedRequirements?.length ?? 0;
  const openHigh = gaps.filter(gap => gap.priority === "High").length;
  return reconcileRfiPackage({
    reviewerSummary: [
      `Model draft unavailable. This package is an honest shell for ${issuer} / ${ref}.`,
      briefing.pursuit.dueDate ? `Response due ${briefing.pursuit.dueDate}. Time zone and submission method are not confirmed.` : "Due date is not on file.",
      `Fit is not scored here. ${mapped} mapped area${mapped === 1 ? "" : "s"}, ${unmapped.length} unmapped.`,
      `${gaps.length} open gaps, ${openHigh} high, all owned by Prime until a reviewer assigns them.`,
      "Do not submit this shell. Resolve the Gap Log first.",
    ].join(" "),
    sections,
    compliance,
    gaps,
    questions: [],
    strategicNotes: unmapped.length
      ? `Unmapped areas to consider for teaming or a future clarification: ${unmapped.slice(0, 5).join("; ")}.`
      : "No unmapped requirements were extracted.",
    usedInsightIds: [],
  }, due);
}

function normalizePackage(value: unknown, fallbackDue: string): unknown {
  const row = asRecord(value);
  if (!row) return value;
  const sections = Array.isArray(row.sections)
    ? row.sections.flatMap(item => {
      const section = asRecord(item);
      if (!section) return [];
      const id = textOf(section.id);
      const title = textOf(section.title || section.name);
      if (!id || !title) return [];
      return [{
        id,
        ref: textOf(section.ref),
        title,
        body: textOf(section.body) || "No verified content was returned for this section.",
      }];
    })
    : row.sections;
  const gaps = Array.isArray(row.gaps)
    ? row.gaps.map(item => normalizeGap(item, fallbackDue)).filter((item): item is RfiGapLogEntry => Boolean(item))
    : [];
  const compliance = Array.isArray(row.compliance)
    ? row.compliance.map(item => {
      const entry = asRecord(item);
      if (!entry) return null;
      const requirement = textOf(entry.requirement);
      if (!requirement) return null;
      return {
        requirement,
        rfiRef: textOf(entry.rfiRef || entry.ref),
        responseSection: textOf(entry.responseSection || entry.section),
        owner: textOf(entry.owner) || "Prime",
        status: textOf(entry.status) || "Open",
      };
    }).filter((item): item is RfiComplianceRow => Boolean(item))
    : [];
  return {
    reviewerSummary: textOf(row.reviewerSummary) || "Reviewer summary was not returned. Check the draft and the Gap Log before submission.",
    sections,
    compliance,
    gaps,
    questions: Array.isArray(row.questions) ? row.questions.map(textOf).filter(Boolean) : [],
    strategicNotes: textOf(row.strategicNotes),
    usedInsightIds: Array.isArray(row.usedInsightIds) ? row.usedInsightIds.map(textOf).filter(Boolean) : [],
  };
}

export function sectionListForPrompt(briefing: ResponseDraftBriefingType): string {
  return outlineSections(briefing)
    .map(section => `- ${section.id} | ${section.ref} | ${section.title}`)
    .join("\n");
}

export interface RfiResponseDraft extends RfiResponsePackage {
  insights: ResponseGroundingFact[];
  modelVersion: string;
  provider: "claude" | "gemini";
  promptVersion: string;
  latencyMs: number;
  usedFallback: boolean;
}

export async function generateRfiResponsePackage(rawBriefing: unknown): Promise<RfiResponseDraft> {
  const briefing = ResponseDraftBriefing.parse(rawBriefing);
  const facts = collectResponseFacts(briefing);
  const fallbackDue = daysBefore(briefing.pursuit.dueDate, 3);
  const prompt = [
    buildResponseDraftPrompt(briefing, facts),
    "",
    "SECTIONS TO DRAFT (use these ids, refs, and titles exactly):",
    sectionListForPrompt(briefing),
  ].join("\n");

  let usedFallback = false;
  let parsed: RfiResponsePackage;
  let modelVersion = "fallback";
  let provider: "claude" | "gemini" = "claude";
  let latencyMs = 0;

  try {
    const result = await callModel({
      tier: "judgment",
      promptVersion: RFI_RESPONSE_PROMPT_VERSION,
      systemPrompt: RFI_PACKAGE_PROMPT,
      prompt,
      classification: "internal",
      redactionProfile: "response-draft-v1",
      maxTokens: 8000,
      temperature: 0.3,
      jsonMode: true,
      timeoutMs: 90_000,
    });
    modelVersion = result.modelVersion;
    provider = result.provider;
    latencyMs = result.latencyMs;
    parsed = RfiResponsePackageOutput.parse(normalizePackage(parseModelJson(result.content), fallbackDue));
  } catch (err) {
    if (err instanceof ModelGatewayError && err.code !== "empty_response" && err.code !== "keys_missing") {
      usedFallback = true;
      parsed = fallbackRfiPackage(briefing);
    } else if (err instanceof ModelGatewayError) {
      throw err;
    } else {
      usedFallback = true;
      parsed = fallbackRfiPackage(briefing);
    }
  }

  const reconciled = reconcileRfiPackage(parsed, fallbackDue);
  const byId = new Map(facts.map(fact => [fact.id, fact]));
  const insights = reconciled.usedInsightIds
    .map(id => byId.get(id))
    .filter((fact): fact is ResponseGroundingFact => Boolean(fact));

  return {
    ...reconciled,
    insights: insights.length ? insights : facts.slice(0, 6),
    modelVersion,
    provider,
    promptVersion: RFI_RESPONSE_PROMPT_VERSION,
    latencyMs,
    usedFallback,
  };
}

export function normalizeSectionGaps(value: unknown, fallbackDue: string): RfiGapLogEntry[] {
  const row = asRecord(value);
  const gaps = row && Array.isArray(row.gaps) ? row.gaps : [];
  return gaps
    .map(item => normalizeGap(item, fallbackDue))
    .filter((item): item is RfiGapLogEntry => Boolean(item));
}
