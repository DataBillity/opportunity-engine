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
import {
  buildResponseDraftPrompt,
  collectResponseFacts,
  renumberResolvedGapIds,
  type ResponseGroundingFact,
} from "./response-draft";

export const RFI_RESPONSE_PROMPT_VERSION = "rfi-response-v1.4";

/** Total wall-clock budget for a package draft; the route allows 300s. */
const PACKAGE_BUDGET_MS = 270_000;
/** Longest a single provider gets, so the other provider can still run if the first is slow. */
const PACKAGE_ATTEMPT_MS = 150_000;

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
  signature: "signature",
};

export const RFI_SECTION_PROMPT = `You write one section of a DataBillity (Billity AI) response to a Request for Information. DataBillity is the Prime. A human reviewer approves and submits every response.

An RFI is market research, not a solicitation and not a binding offer. Inform the issuer, help shape a future requirement, and position the team. Do not write a proposal full of commitments, and do not write a brochure.

Hard rules:
- Cite only facts listed under GROUNDING FACTS. If a fact is not listed, do not use it.
- Answer only what the issuer's response worksheet or questionnaire asks for this section. Vendor questions and the issuer's answers (a Q&A or "Response to Vendor Questions" document) are clarifications: use the answers as facts, never answer those questions.
- Never fabricate past performance, clients, contract numbers, certifications, personnel, metrics, identifiers (UEI, CAGE, NAICS, size, socioeconomic status), or partner capabilities.
- Company details (address, phone, point of contact, year founded, headcount, EIN, UEI) come from the company record facts. Log a gap only for details not listed there.
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
1. Compliance: issuer, notice number, title, due date and time zone, question deadline, submission method, format rules, every numbered question the issuer asks vendors to answer (the response worksheet or questionnaire), required administrative data, and acquisition signals (NAICS, set-aside, vehicle, period, budget, incumbent) when the facts include them.
2. Need: the problem, why now, what the issuer seems unsure about, and constraints. Build this from the objective, challenge themes, consequences, and target end state facts, so the draft shows what the issuer is trying to achieve, not only what it asked.
3. Fit: for each area, Strong (direct past performance), Partial (related or partner-only), or Gap. Do not make the respond/pass call. Note which confirmed partner covers which area, and flag requirements that look written for a competitor.
4. Draft sections that mirror the RFI's headings and numbering. If SECTIONS TO DRAFT lists a structure, use those ids, refs, and titles exactly. Response format facts are binding: when they say the issuer's worksheet is the response, or that appendices, attachments, or supplemental materials are not allowed, add no cover letter or material outside those sections and keep the whole response within the page limit. Where format rules conflict, follow the most restrictive reading and log a compliance_risk gap.
5. For every answer: first sentence answers the question; the rest supports it with specific methods, tools, standards, and outcomes from the facts. Use the issuer's words. Add customer-focused insight (risks, ambiguities, better approaches, acquisition recommendations) without exceeding the ask.
6. Gaps: anything missing, unverified, or undecided becomes a placeholder in the draft and one Gap Log row.
7. Administrative information for the Prime and each confirmed partner: name, address, identifiers, size and socioeconomic status, NAICS, vehicles, and point of contact. Fill these from the company record facts. Only items not listed there are gaps owned by that company.
8. Self-check: every question is answered or logged; every placeholder has one Gap Log row and vice versa; format limits are respected; no fabricated claims; tone is plain and customer-focused.

Placeholder format, in the draft body: [GAP-### | Owner | Short action]
Examples: [GAP-003 | Prime | Confirm current CMMI appraisal level and date]
Number gaps in the order they appear. Owner is "Prime", or "Partner: Name" only when that partner is confirmed on the team. Unconfirmed partners are named in notes, and the owner stays Prime.
Capability gaps are owned by Prime, with a note on whether a partner could close them.

Gap types: missing_information, unverified_claim, capability_gap, partner_input, decision_needed, clarification, compliance_risk.
Priority: High (blocks submission or compliance), Medium (weakens the response), Low (nice to have).
Set due a few days before the RFI deadline when a deadline is known. Status is Open.

Writing guardrails:
- The questions to answer are the facts labeled "Question to answer" and the issuer's response worksheet or questionnaire. Vendor questions and the issuer's answers (a document titled "Response to Vendor Questions", or a Q&A) are clarifications: use the answers as facts, never answer those questions, and never add a section, compliance row, or gap for that document.
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
  "questions": ["question for the issuer: start from the 'Question for the issuer' facts, keep their wording and timing, and add others only when the facts raise them"],
  "strategicNotes": "requirements to influence, competitor signals, teaming ideas for capability gaps",
  "usedInsightIds": ["R1"]
}`;

const BID_GAP_RULES = `Placeholder format, in the draft body: [GAP-### | Owner | Short action]
Examples: [GAP-004 | Prime | Confirm the program manager's PMP certification date]
Number gaps in the order they appear, after the highest EXISTING GAP id if one is listed. Owner is "Prime", or "Partner: Name" only when that partner is confirmed on the team. Unconfirmed partners are named in notes, and the owner stays Prime.
Capability gaps are owned by Prime, with a note on whether a partner could close them.
Gap types: missing_information, unverified_claim, capability_gap, partner_input, decision_needed, clarification, compliance_risk.
Priority: High (blocks submission, compliance, or a pass/fail gate), Medium (weakens the score or the price), Low (nice to have).
Set due a few days before the response deadline when it is known. Status is Open.`;

const BID_GUARDRAILS = `Writing guardrails:
- Requirements to address are the facts labeled "Requirement to address" and the solicitation's own instructions. Vendor questions and the issuer's answers (a Q&A document) are clarifications: use the answers as facts, never answer those questions, and never add a section for that document.
- Cite only GROUNDING FACTS. Never invent past performance, clients, contract numbers, certifications, people, rates, prices, metrics, or identifiers.
- Commit only to what the facts show the team can deliver. Where delivery depends on something unverified (staffing, a partner, a certification, a price), write the commitment with a placeholder instead of asserting it.
- Past performance and key personnel name only engagements and people in the facts. Attribute partner experience to that partner.
- Never invent a price, rate, or hours. Describe the pricing approach and put figures behind placeholders.
- Inferred services are our reading, not the issuer's requirement. Propose them as recommendations or state them as assumptions, never as requirements the issuer wrote.
- If the team cannot meet a requirement, log a capability gap. Do not obscure it.
- Use the issuer's terminology. Plain language, active voice, short paragraphs. No "world-class", "best-in-breed", "cutting-edge", "synergies".
- If the facts are thin, say so in the reviewer summary and use placeholders instead of invented coverage.`;

const BID_PACKAGE_OUTPUT = `Return ONLY JSON with this shape:
{
  "reviewerSummary": "half a page at most: due date, time, time zone, submission method, fit against the evaluation criteria, open gaps by owner and priority, decisions needed. Flag missing inputs at the top.",
  "compliance": [{ "requirement": "requirement or instruction, shortened", "rfiRef": "solicitation section or paragraph", "responseSection": "section title", "owner": "Prime", "status": "Addressed or Open" }],
  "sections": [{ "id": "tech", "ref": "Vol I", "title": "Technical approach", "body": "prose with [GAP-### | Owner | Description] inline" }],
  "gaps": [{ "id": "GAP-001", "location": "section title and solicitation reference", "gapType": "missing_information", "description": "string", "owner": "Prime", "priority": "High", "due": "YYYY-MM-DD", "status": "Open", "notes": "string" }],
  "questions": ["question for the issuer: start from the 'Question for the issuer' facts, keep their wording and timing, and add others only when the facts raise them"],
  "strategicNotes": "win themes, competitor signals, teaming ideas for capability gaps, and contract terms to negotiate",
  "usedInsightIds": ["R1"]
}`;

export const RFP_PACKAGE_PROMPT = `You draft a complete proposal in response to a Request for Proposal for DataBillity (Billity AI) as Prime. A human reviewer approves and submits it. Return a complete, compliant first draft that scores well against the stated evaluation criteria and shows what you assumed, what you could not verify, and who must supply what is missing.

A proposal is an offer the issuer can accept. It must be compliant first (every instruction and requirement addressed where the evaluators expect it), responsive second (answers what each evaluation factor asks), and persuasive third (clear win themes backed by proof).

Work in this order, then return the package below:
1. Compliance: issuer, solicitation number, title, due date and time zone, questions deadline, submission method, volume and page limits, required forms, and every requirement and instruction in the facts. Build the compliance array so each requirement maps to the section that answers it.
2. Need: the problem, why now, and what success looks like to the issuer. Build this from the objective, challenge themes, consequences, target end state, and constraint facts.
3. Win themes: two to four themes that tie the issuer's challenges and evaluation criteria to what the team can prove from the facts. Each theme needs proof (a cited engagement, person, or capability) or a gap.
4. Fit: for each requirement area, Strong (direct past performance), Partial (related or partner-only), or Gap. Do not make the go/no-go call. Note which confirmed partner covers which area.
5. Draft sections that mirror the prescribed volumes and sections in order, with their numbering. If SECTIONS TO DRAFT lists a structure, use those ids, refs, and titles exactly and return a body for every one. Format facts are binding: stay inside page limits, add nothing the instructions exclude, and where rules conflict follow the most restrictive reading and log a compliance_risk gap.
6. For every section: the first sentence answers what the section's evaluation factor asks. Address each mapped requirement explicitly in the issuer's words, then show how (method, tools, standards, staffing) and the benefit to the issuer, with proof from the facts. Weight the words toward the most important evaluation factors.
7. Key personnel, past performance, and price: only from the facts. Missing résumés, references, certifications, or figures become gaps owned by the company that must supply them.
8. Gaps: anything missing, unverified, or undecided becomes a placeholder in the draft and one Gap Log row. Pass/fail gates that are not proven in the facts are High.
9. Self-check: every requirement appears in compliance with a response section; every evaluation factor is addressed; every placeholder has one Gap Log row and vice versa; limits are respected; no fabricated claims.

${BID_GAP_RULES}

${BID_GUARDRAILS}
- If the questions deadline has passed, turn open questions into stated assumptions in the draft and list them in questions with that note.
- Commercial terms that carry risk (liquidated damages, uncapped liability, IP ownership) go in strategicNotes and, when they need a decision before submission, a decision_needed gap.

${BID_PACKAGE_OUTPUT}`;

export const SOW_PACKAGE_PROMPT = `You draft a complete response to a client's Statement of Work for DataBillity (Billity AI) as Prime. A human reviewer approves and sends it. Return a complete first draft that the client could accept as the basis for the engagement, and that protects DataBillity's scope and price by stating what you assumed, what you could not verify, and who must supply what is missing.

A SOW response confirms that we understand the need, explains how we will deliver each task and deliverable, defines acceptance, names the team, sets the schedule, prices the work, and draws a clear scope boundary with assumptions and exclusions.

Work in this order, then return the package below:
1. Compliance: client, SOW title and reference, response due date, format or submission rules, and every task, deliverable, and acceptance criterion in the facts. Build the compliance array so each maps to the section that answers it.
2. Need: the client's problem, why now, and the outcome they want. Build this from the objective, challenge themes, consequences, and end state facts.
3. Fit: for each task area, Strong, Partial, or Gap, and which confirmed partner covers what. Do not make the go/no-go call.
4. Draft sections that follow any structure the client prescribes. If SECTIONS TO DRAFT lists a structure, use those ids, refs, and titles exactly and return a body for every one.
5. For every task and deliverable: say what we will do, how, what the client receives, and how acceptance works, in the client's words, with proof from the facts.
6. Scope boundary: inferred services the SOW omits are either offered as optional recommendations or listed as exclusions; state every assumption the price depends on (volumes, client responsibilities, access, environments, turnaround times). Put these in the assumptions section when one exists.
7. Team, schedule, and price: only from the facts. Missing names, rates, or figures become gaps.
8. Commercial terms: for each risky term in the facts (payment, acceptance, IP, liability, indemnity, warranty, termination, change control), note a proposed position in strategicNotes and log a decision_needed gap when it must be settled before sending.
9. Self-check: every task and deliverable appears in compliance with a response section; every placeholder has one Gap Log row and vice versa; no fabricated claims.

${BID_GAP_RULES}

${BID_GUARDRAILS}

${BID_PACKAGE_OUTPUT}`;

export function bidSectionPrompt(projectType: "rfp" | "sow"): string {
  const kind = projectType === "sow" ? "a client's Statement of Work" : "a Request for Proposal";
  return `You write one section of a DataBillity (Billity AI) response to ${kind}. DataBillity is the Prime. A human reviewer approves and submits every response.

Hard rules:
- Cite only facts listed under GROUNDING FACTS. If a fact is not listed, do not use it.
- The first sentence answers what the section is for (the evaluation factor or task it addresses). The rest addresses each relevant requirement in the issuer's words, with method, benefit, and proof from the facts.
- Write prose for the named section only. No cover letter, no other sections, no HTML, no markdown headings.
- Stay inside any page, font, or file limit in the facts. 220-420 words unless a limit or thin facts require less.
- If something is missing, unverified, or a decision only a human can make, insert a placeholder: [GAP-### | Owner | Short action].

${BID_GAP_RULES}

${BID_GUARDRAILS}

Return ONLY JSON:
{
  "body": "section prose with [GAP-### | Owner | Description] placeholders inline",
  "usedInsightIds": ["R1"],
  "gaps": [{ "id": "GAP-001", "location": "section name and reference", "gapType": "missing_information", "description": "what is needed", "owner": "Prime", "priority": "High", "due": "YYYY-MM-DD", "status": "Open", "notes": "source or fallback" }]
}
Every placeholder in body has exactly one gaps entry with the same id, and every gaps entry appears in body.`;
}

export function packagePromptFor(projectType: "rfi" | "rfp" | "sow"): string {
  return { rfi: RFI_PACKAGE_PROMPT, rfp: RFP_PACKAGE_PROMPT, sow: SOW_PACKAGE_PROMPT }[projectType];
}

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

function resolvePrimeLabel(partners: ResponseDraftBriefingType["partners"]): string {
  const prime = partners.find(p => p.role === "Prime" || p.role === "prime");
  return prime?.name ?? "Prime";
}

export function fallbackRfiPackage(briefing: ResponseDraftBriefingType): RfiResponsePackage {
  const projectType = briefing.projectType ?? "rfi";
  if (projectType !== "rfi") return fallbackBidPackage(briefing, projectType);
  const due = daysBefore(briefing.pursuit.dueDate, 3);
  const questions = briefing.pursuit.informationRequests ?? [];
  const unmapped = briefing.pursuit.unmappedRequirements ?? [];
  const constraints = briefing.pursuit.docSummary?.responseConstraints ?? [];
  const confirmed = briefing.partners.filter(partner => partner.confirmed);
  const outline = outlineSections(briefing);
  const primeLabel = resolvePrimeLabel(briefing.partners);
  let n = 1;
  const gaps: RfiGapLogEntry[] = [];

  const push = (
    location: string,
    gapType: RfiGapLogEntry["gapType"],
    description: string,
    priority: RfiGapLogEntry["priority"],
    notes: string,
    owner = primeLabel,
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
    briefing.pursuit.docSummary?.rfiSummary?.procurementObjective ?? "",
    briefing.pursuit.docSummary?.rfiSummary?.endState ?? "",
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
      owner: primeLabel,
      status: "Open",
    })),
    ...constraints.map(rule => ({
      requirement: rule,
      rfiRef: "Format",
      responseSection: "Cover letter",
      owner: primeLabel,
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
      `${gaps.length} open gaps, ${openHigh} high, all owned by ${primeLabel} until a reviewer assigns them.`,
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

function fallbackBidPackage(briefing: ResponseDraftBriefingType, projectType: "rfp" | "sow"): RfiResponsePackage {
  const due = daysBefore(briefing.pursuit.dueDate, 3);
  const requirements = briefing.pursuit.informationRequests ?? [];
  const unmapped = briefing.pursuit.unmappedRequirements ?? [];
  const constraints = briefing.pursuit.docSummary?.responseConstraints ?? [];
  const summary = briefing.pursuit.docSummary?.rfiSummary;
  const confirmed = briefing.partners.filter(partner => partner.confirmed);
  const outline = outlineSections(briefing);
  const issuer = briefing.organization.name;
  const ref = briefing.pursuit.solicitationRef || briefing.pursuit.name;
  const kind = projectType === "sow" ? "SOW response" : "proposal";
  const primeLabel = resolvePrimeLabel(briefing.partners);
  let n = 1;
  const gaps: RfiGapLogEntry[] = [];
  const push = (
    location: string,
    gapType: RfiGapLogEntry["gapType"],
    description: string,
    priority: RfiGapLogEntry["priority"],
    notes: string,
  ): string => {
    const id = nextGapId(n++);
    gaps.push({ id, location, gapType, description, owner: primeLabel, priority, due, status: "Open", notes });
    return `[${id} | ${primeLabel} | ${description}]`;
  };

  if (!briefing.pursuit.dueDate) {
    push("Reviewer summary", "compliance_risk", "Confirm the response due date, time, and time zone", "High", "The packet has no due date.");
  }
  if (!constraints.length) {
    push("Reviewer summary", "compliance_risk", "Confirm page limits, file type, and submission method", "High", "No response-format rules were extracted.");
  }
  for (const item of unmapped) {
    push("Compliance", "capability_gap", `Decide how to address: ${item}`, "Medium", "No current team capability is mapped to this requirement.");
  }

  const need = [
    briefing.pursuit.docSummary?.objective?.[0] ?? `${issuer} has not stated an objective the packet could extract.`,
    summary?.endState ?? "",
  ].filter(Boolean).join("\n\n");
  const sections = outline.map(section => {
    const lines = [need];
    const text = `${section.id} ${section.title}`.toLowerCase();
    if (/past|experience/.test(text)) {
      lines.push(briefing.experience.length
        ? `Records on file: ${briefing.experience.slice(0, 4).map(item => item.name).join("; ")}. Expand only from these.`
        : push(section.title, "missing_information", "Provide past performance the team can cite, with customer, dates, and references", "High", "No experience records were in the grounding facts."));
    } else if (/pers|team|staff/.test(text)) {
      lines.push(push(section.title, "missing_information", "Name key personnel and attach résumés", "High", "No assigned personnel were in the grounding facts."));
      if (confirmed.length) lines.push(`Confirmed partners: ${confirmed.map(partner => partner.name).join(", ")}.`);
    } else if (/price|pricing|cost/.test(text)) {
      lines.push(push(section.title, "decision_needed", "Build the price from approved rates and the scope assumptions", "High", "No pricing figures are in the grounding facts."));
    } else if (/assum|exclu/.test(text)) {
      const inferred = (summary?.services ?? []).filter(item => item.type === "inferred").map(item => item.service);
      lines.push(inferred.length
        ? `Work the SOW does not name, to include as options or exclusions: ${inferred.join("; ")}.`
        : push(section.title, "decision_needed", "List the assumptions and exclusions the price depends on", "High", "No inferred scope was extracted."));
    }
    lines.push(`${section.title} is not drafted. The model was unavailable, so this section is a placeholder for the reviewer.`);
    return { ...section, body: lines.join("\n\n") };
  });

  const compliance: RfiComplianceRow[] = [
    ...requirements.map((requirement, index) => ({
      requirement,
      rfiRef: `R${index + 1}`,
      responseSection: outline[0]?.title ?? "Response",
      owner: primeLabel,
      status: "Open",
    })),
    ...constraints.map(rule => ({ requirement: rule, rfiRef: "Format", responseSection: "All sections", owner: primeLabel, status: "Open" })),
  ];

  const openHigh = gaps.filter(gap => gap.priority === "High").length;
  return reconcileRfiPackage({
    reviewerSummary: [
      `Model draft unavailable. This ${kind} is an honest shell for ${issuer} / ${ref}.`,
      briefing.pursuit.dueDate ? `Response due ${briefing.pursuit.dueDate}. Time zone and submission method are not confirmed.` : "Due date is not on file.",
      `${requirements.length} requirement${requirements.length === 1 ? "" : "s"} on file, ${unmapped.length} unmapped.`,
      `${gaps.length} open gaps, ${openHigh} high, all owned by ${primeLabel} until a reviewer assigns them.`,
      "Do not submit this shell. Resolve the Gap Log first.",
    ].join(" "),
    sections,
    compliance,
    gaps,
    questions: (summary?.issuerQuestions ?? []).map(item => item.question),
    strategicNotes: [
      ...(summary?.commercialTerms ?? []).map(item => `Term to negotiate: ${item}`),
      unmapped.length ? `Unmapped requirements to consider for teaming: ${unmapped.slice(0, 5).join("; ")}.` : "",
    ].filter(Boolean).join("\n"),
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
  const projectType = briefing.projectType ?? "rfi";
  const facts = collectResponseFacts(briefing, { includeSourceExcerpt: projectType === "rfi" || !briefing.pursuit.docSummary?.rfiSummary });
  const fallbackDue = daysBefore(briefing.pursuit.dueDate, 3);
  const prompt = [
    buildResponseDraftPrompt(briefing, facts),
    "",
    "SECTIONS TO DRAFT (use these ids, refs, and titles exactly, and return a body for every one of them):",
    sectionListForPrompt(briefing),
    "The single 'Section to draft' line above is not a limit. This is a complete package.",
  ].join("\n");

  let usedFallback = false;
  let parsed: RfiResponsePackage;
  let modelVersion = "fallback";
  let provider: "claude" | "gemini" = "claude";
  let latencyMs = 0;

  // The route is capped at 300s (maxDuration). Every attempt, across both providers, shares
  // this deadline so the request always ends with JSON (a draft or the honest shell) instead
  // of the host's plain-text timeout page.
  const deadlineAt = Date.now() + PACKAGE_BUDGET_MS;

  const draftWith = async (preferProvider: "claude" | "gemini") => {
    const result = await callModel({
      tier: "judgment",
      preferProvider,
      promptVersion: RFI_RESPONSE_PROMPT_VERSION,
      systemPrompt: packagePromptFor(projectType),
      prompt,
      classification: "internal",
      redactionProfile: "response-draft-v1",
      maxTokens: 14000,
      temperature: 0.3,
      jsonMode: true,
      timeoutMs: PACKAGE_ATTEMPT_MS,
      deadlineAt,
    });
    modelVersion = result.modelVersion;
    provider = result.provider;
    latencyMs = result.latencyMs;
    return RfiResponsePackageOutput.parse(normalizePackage(parseModelJson(result.content), fallbackDue));
  };

  try {
    try {
      parsed = await draftWith("claude");
    } catch (err) {
      if (err instanceof ModelGatewayError) throw err;
      parsed = await draftWith(provider === "claude" ? "gemini" : "claude");
    }
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

  const draftReconciled = reconcileRfiPackage(parsed, fallbackDue);
  const closed = renumberResolvedGapIds(
    draftReconciled.gaps,
    draftReconciled.sections.map(section => section.body),
    briefing,
  );
  const reconciled: RfiResponsePackage = {
    ...draftReconciled,
    sections: draftReconciled.sections.map((section, i) => ({ ...section, body: closed.bodies[i]! })),
    gaps: sortRfiGaps(closed.gaps),
  };
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
