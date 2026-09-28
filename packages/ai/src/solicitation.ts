import {
  SolicitationExtraction,
  type SolicitationExtraction as SolicitationExtractionType,
  type ProjectType,
} from "@opportunity-engine/contracts";
import { callModel, ModelGatewayError } from "./gateway";
import { parseModelJson } from "./json";

export const SOLICITATION_EXTRACT_PROMPT_VERSION = "solicitation-extract-v1.6";

const RFP_SOW_PROMPT = `You extract facts from an RFP or Statement of Work for DataBillity bid triage.

Hard rules:
- Use only the document text. Do not invent agencies, dates, certifications, or requirements.
- Prefer numbered/lettered shall/must statements as requirements.
- Mark passFail true only when the text is mandatory, pass/fail, or a certification/ATO/bond gate.
- If a field is not present, use an empty string, empty array, or null.
- Return ONLY JSON matching the schema.`;

const RFI_SUMMARY_PROMPT = `You summarize the purpose behind a Request for Information (RFI) for a DataBillity bid team. The RFI may seek IT services and technical solutions, business and strategy consulting, or both. It may be a narrative document, a questionnaire, a short sources-sought notice, or a multi-attachment package. Don't expect fixed section names; find the content wherever it appears.

Every RFI asks for information, so "gather market information", "market research", "for planning purposes", or "inform a future solicitation" is never the objective. Identify what the issuer is trying to accomplish, why now, what it wants in place at the end, and what services that will take.

Hard rules:
- Use only the document text. Do not invent agencies, dates, volumes, standards, or answers. Cite section numbers, item numbers, or question numbers as evidence (for example "§1.D item 4", "Q7", "Att. 2").
- Follow the structure of the RFI in front of you. Include only what it supports.

objective (1–2 strings): one or two sentences in the form "[Action] the [system, process, or program] in order to [business outcome] for [who benefits]". Technical actions: replace, modernize, consolidate, implement, automate, migrate, integrate, stand up. Consulting actions: assess, plan, define a roadmap for, redesign, reorganize, govern, decide between, build the business case for. Take the business outcome (faster payments, less manual work, compliance, transparency, cost) from the issuer's own words, and cite sections in parentheses. If the sentence would fit any RFI from any agency, it is too generic; rewrite it. The objective holds only the business objective; the procurement objective (choosing COTS vs. custom, a vehicle, one vendor vs. several) goes in rfiSummary.procurementObjective and never in objective.

challenges: each problem the issuer states, keeping its own numbering and wording where possible ("1. Changes to letters require code and take months"). Background sections often describe problems without labeling them; watch for "manually", "external process", "workaround", "cannot", "only", "takes months", "hard coded".

services: only the services the RFI explicitly asks for or requests information about, as short names phrased as work or capabilities (for example "Recommend a solution approach", "Platform capabilities across the claims lifecycle", "Cost model and budgetary range with sizing assumptions", "Solution demonstration"). Not response chores such as "complete the worksheet".

deliverables: the target end state as short lines — what exists when this is done that doesn't exist today: the solution type (SaaS, COTS, MOTS, configurable platform, custom, managed service, or a combination), the business processes, programs, and user groups it must cover end to end, and the key qualities the issuer emphasizes (configurable, integrated, self-service, auditable, multilingual). For consulting work the end state may be a decision, roadmap, business case, operating model, governance structure, or an organization ready to procure or adopt; name it as concretely as the RFI allows. Never the RFI response itself.

rfiSummary:
- workType: "technical", "consulting", "both", or "other" (goods, construction, or staffing only). Many RFIs are both, e.g. a modernization that starts with an assessment and roadmap.
- objectiveConfidence: High when the RFI states the purpose; Medium when pieced together from background or questions; Low for thin notices.
- procurementObjective: the approach decision the issuer is making (COTS vs. MOTS vs. custom, one vendor vs. several, contract vehicle), with a section cite. Empty if not stated.
- challengeThemes: group the challenges into themes such as agility and change cost, missing functions, manual workarounds, integration, controls and audit, user experience, reporting. For each: theme, detail (a sentence with the item numbers in parentheses), evidence, and rootCause true for the one the RFI implies drives the rest (for example "changes require code"). At most one root cause.
- consequences: the outcomes the issuer names (delays, calls, escalations, errors, low visibility). These are what a response should promise to improve.
- endState: a short paragraph describing the target end state, including scale (users, offices, programs) when stated.
- endStateConstraints: hosting model, referenced standards or terms, budget signals (cost model requests), timeline.
- nextStep: the next procurement step if stated (demonstrations, expected RFP and vehicle).
- services: a table of explicit AND inferred services.
  - Explicit: what the RFI asks for or asks about, phrased as work or capabilities (not response chores); type "explicit", evidence = section or question cite, confidence empty.
  - Inferred: services work like this always needs even if unmentioned; type "inferred", evidence = the short reason with a cite, confidence High, Medium, or Low. Never present an inferred service as the issuer's requirement.
  - Always evaluate every item on the core list and include each one the work plausibly needs; a large public-sector modernization almost always needs project management aligned to the government's IT approval process and IV&V (usually Medium). Core list: project and program management (multi-phase, stage-gate approval); stakeholder engagement and communications (multiple divisions, partners, boards, the public); current-state assessment; business process analysis and redesign (workarounds, manual steps, "streamline"); organizational change management and training (large or distributed users); quality assurance and IV&V (large public projects); procurement and acquisition support (approach or vehicle not chosen).
  - Technical add-on when workType is technical or both: requirements and solution design; configuration and development (rules engines, workflows, correspondence, portals); data migration and conversion (any replacement, especially long-lived records or balances); integration and interfaces (named third parties, agencies, payment systems); security, privacy, and compliance (health, criminal justice, financial, PII, referenced standards); testing (payments, eligibility, legal determinations); accessibility and language services; reporting, analytics, and data management; hosting and infrastructure; operations, maintenance, and support.
  - Consulting add-on when workType is consulting or both: strategic planning and roadmap; alternatives analysis and feasibility; business case and cost-benefit; operating model and organization design; governance and policy; IT and data strategy; performance measurement (backlogs, turnaround, KPIs); readiness and implementation planning; approval and oversight documentation.
  - Include a service only when the RFI gives a reason for it. Make names specific to this RFI where you can ("Data migration from CaRes, including lifetime benefit balances").
  - Don't force IT services onto a consulting-only RFI, and don't skip the assessment and planning work at the front of a technical one.
- gaps: missing attachments (an attachment, worksheet, or standard that is referenced but not in the text — say the actual questions may be in it), unstated volumes that sizing depends on, ambiguities, and questions to ask the issuer. Say so rather than summarizing around a gap.

Thin RFIs and sources-sought notices: build the objective from the title, NAICS or product codes, any scope paragraph, the issuing office's mission, and the anticipated contract type. Don't invent a problem statement. Set objectiveConfidence Low and mark inferred services Low unless stated. Turn unknowns into gaps. A thin RFI gets a short summary, not a padded one.

Questionnaire-only RFIs: piece the purpose together from the questions. The topics with the most or most detailed questions show what the issuer cares about. Read what each question assumes ("migrating 20 years of case records" means a legacy system, a migration, and long retention). Treat cost, licensing, and timeline questions as budget and procurement-strategy signals. Cite question numbers as evidence. Note in gaps anything conspicuously not asked.

Issuer Q&A (for example "Response to Vendor Questions" or an addendum) holds the issuer's own clarifications. Use its answers as facts in the summary — user counts, named integrations, migration scope, hosting options, standards — cited like "Att. 3 Q7". Vendor questions answered "No preference" or "To be determined" are unknowns for gaps, not requirements. An attachment whose text is present is not missing.

Do not list the vendor questionnaire items here; another pass extracts them.
- If a field is not present, use an empty string, empty array, or null.
- Keep every string short. Return ONLY JSON matching the schema.`;

const RFI_STRUCTURE_PROMPT = `You extract the response structure of a Request for Information (RFI) for a DataBillity bid team.

Hard rules:
- Use only the document text.
- requirements: the questions and information requests vendors must answer in their response (the questionnaire or response worksheet, and any "describe" or "provide" requests in the RFI body), numbered and ordered as the RFI does. Shorten each to at most 25 words. sectionRef is the part, section, or question number. Skip form fields such as company name and address. Do not include questions that other vendors asked the issuer in a Q&A or addendum; those are clarifications, not questions for us.
- responseSections: if the RFI specifies headings, a questionnaire, or a template, copy that structure and numbering. If it does not, use exactly these sectionIds: cover (Cover letter), company (Company and team overview), understanding (Understanding of the requirement), questions (Responses to specific questions), experience (Relevant experience), recommendations (Recommendations for the future solicitation), contacts (Points of contact).
- responseConstraints: how to write and submit the response (page limit, font, margins, file type, naming, recipients, whether attachments or appendices are allowed, question deadline).
- constraints: eligibility or security gates that affect whether we can do the work. Not page count or formatting.
- Mark passFail true only for eligibility to respond (registration, NDA, mandatory form). Never for an information request or a page limit.
- If a field is not present, use an empty string, empty array, or null.
- Return ONLY JSON matching the schema.`;

type RfiPass = "summary" | "structure";

function systemPromptFor(projectType: ProjectType, pass: RfiPass = "summary"): string {
  if (projectType !== "rfi") return RFP_SOW_PROMPT;
  return pass === "structure" ? RFI_STRUCTURE_PROMPT : RFI_SUMMARY_PROMPT;
}

function laneLabel(projectType: ProjectType, lane: "B" | "C"): string {
  if (projectType === "rfi") return "Request for Information";
  if (projectType === "sow" || lane === "C") return "Private SOW";
  return "Government RFP";
}

export function buildSolicitationExtractPrompt(input: {
  filename: string;
  lane: "B" | "C";
  projectType?: ProjectType;
  organizationName: string;
  organizationIndustry?: string;
  documentText: string;
  pass?: RfiPass;
}): string {
  const projectType = input.projectType ?? (input.lane === "C" ? "sow" : "rfp");
  const header = [
    `Document file: ${input.filename}`,
    `Lane: ${laneLabel(projectType, input.lane)}`,
    `Project type: ${projectType.toUpperCase()}`,
    `Account: ${input.organizationName}${input.organizationIndustry ? ` (${input.organizationIndustry})` : ""}`,
    "",
    "DOCUMENT TEXT:",
    input.documentText,
    "",
    "Return JSON:",
  ];
  const metadata = {
    inferredName: "short project title",
    solicitationRef: projectType === "rfi" ? "RFI number or empty" : "RFP or SOW number or empty",
    dueDate: "YYYY-MM-DD or null",
    issuer: "issuing org or empty",
  };

  if (projectType !== "rfi") {
    return [...header, JSON.stringify({
      ...metadata,
      objective: ["..."],
      challenges: ["..."],
      services: ["..."],
      deliverables: ["..."],
      requirements: [{ requirementText: "...", sectionRef: "optional", passFail: false, weight: 0 }],
      responseSections: [{ ref: "Vol I § 3.2", title: "Technical Approach", sectionId: "tech" }],
      responseConstraints: [],
      constraints: ["eligibility or security gates only — not page limits"],
    })].join("\n");
  }

  if (input.pass === "structure") {
    return [...header, JSON.stringify({
      ...metadata,
      requirements: [{
        requirementText: "question or information request vendors must answer, at most 25 words",
        sectionRef: "part, section, or question number",
        passFail: false,
        weight: 0,
      }],
      responseSections: [
        { ref: "Cover", title: "Cover letter", sectionId: "cover" },
        { ref: "Questions", title: "Responses to specific questions", sectionId: "questions" },
      ],
      responseConstraints: ["page limit, font, margins, or submission format — not scored"],
      constraints: ["eligibility or security gates only — not page limits"],
    })].join("\n");
  }

  return [
    ...header,
    JSON.stringify({
      ...metadata,
      objective: ["[Action] the [system/process/program] in order to [business outcome] for [who benefits] (§ cites) — never 'gather information'"],
      challenges: ["each stated problem, keeping the RFI's numbering and wording"],
      services: ["explicitly requested services only"],
      deliverables: ["target end state: solution type, business scope, user groups, key qualities"],
      ...{
        rfiSummary: {
          workType: "technical | consulting | both | other",
          objectiveConfidence: "High | Medium | Low",
          procurementObjective: "approach decision with cite, or empty",
          challengeThemes: [{ theme: "Agility and change cost", detail: "sentence with item numbers", rootCause: true, evidence: "§1.D items 1, 4, 10" }],
          consequences: ["outcome the issuer names"],
          endState: "short paragraph",
          endStateConstraints: ["hosting, standards, budget signals, timeline"],
          nextStep: "next procurement step or empty",
          services: [
            { service: "explicitly requested service", type: "explicit", evidence: "§1.A", confidence: "" },
            { service: "service the work will require", type: "inferred", evidence: "short reason with cite", confidence: "High | Medium | Low" },
          ],
          gaps: ["missing attachment, unstated volume, ambiguity, or question for the issuer"],
        },
      },
    }),
  ].join("\n");
}

function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter(item => item !== null && item !== undefined).map(dropNulls);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== null)
        .map(([key, item]) => [key, dropNulls(item)]),
    );
  }
  return value;
}

const RESPONSE_CHORE = /\b(complete|fill (?:in|out)|submit|return)\b.*\b(worksheet|form|template|questionnaire|attachment)\b|^confirm compliance\b|\bcover letter\b/i;

function isResponseChore(value: unknown): boolean {
  return typeof value === "string" && RESPONSE_CHORE.test(value.trim());
}

function cleanRfiSummary(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return undefined;
  const summary = dropNulls(raw) as Record<string, unknown>;
  const rows = (key: string, field: string) =>
    Array.isArray(summary[key])
      ? (summary[key] as unknown[]).filter(row =>
        row && typeof row === "object" && typeof (row as Record<string, unknown>)[field] === "string"
        && ((row as Record<string, string>)[field] ?? "").trim().length > 0)
      : undefined;
  const strings = (key: string) =>
    Array.isArray(summary[key])
      ? (summary[key] as unknown[]).filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : undefined;
  return {
    ...summary,
    services: rows("services", "service")?.filter(row => !isResponseChore((row as Record<string, unknown>).service)),
    challengeThemes: rows("challengeThemes", "theme"),
    consequences: strings("consequences"),
    endStateConstraints: strings("endStateConstraints"),
    gaps: strings("gaps"),
  };
}

/** Parse the model payload; a malformed rfiSummary is dropped rather than failing the whole extraction. */
export function parseExtraction(parsed: unknown): SolicitationExtractionType {
  if (!parsed || typeof parsed !== "object") return SolicitationExtraction.parse(parsed);
  const record = { ...(parsed as Record<string, unknown>) };
  if ("rfiSummary" in record) {
    if (Array.isArray(record.services)) record.services = record.services.filter(item => !isResponseChore(item));
    const cleaned = cleanRfiSummary(record.rfiSummary);
    if (cleaned) record.rfiSummary = cleaned;
    else delete record.rfiSummary;
  }
  const attempt = SolicitationExtraction.safeParse(record);
  if (attempt.success) return attempt.data;
  if ("rfiSummary" in record) {
    delete record.rfiSummary;
    return SolicitationExtraction.parse(record);
  }
  throw attempt.error;
}

export async function extractSolicitationWithModel(input: {
  filename: string;
  lane: "B" | "C";
  projectType?: ProjectType;
  organizationName: string;
  organizationIndustry?: string;
  documentText: string;
}): Promise<{ extraction: SolicitationExtractionType; modelVersion: string; provider: "claude" | "gemini" }> {
  const projectType = input.projectType ?? (input.lane === "C" ? "sow" : "rfp");

  if (projectType !== "rfi") {
    const pass = await runPass({
      preferProvider: "gemini",
      systemPrompt: systemPromptFor(projectType),
      prompt: buildSolicitationExtractPrompt({ ...input, projectType }),
      maxTokens: 2500,
      timeoutMs: 60_000,
    });
    return { extraction: parseExtraction(pass.parsed), modelVersion: pass.modelVersion, provider: pass.provider };
  }

  // Two passes in parallel so a long questionnaire can't crowd the scope summary out of the token budget.
  const [summary, structure] = await Promise.allSettled([
    runPass({
      preferProvider: "claude",
      systemPrompt: systemPromptFor("rfi", "summary"),
      prompt: buildSolicitationExtractPrompt({ ...input, projectType, pass: "summary" }),
      maxTokens: 8000,
      timeoutMs: 90_000,
    }),
    runPass({
      preferProvider: "gemini",
      systemPrompt: systemPromptFor("rfi", "structure"),
      prompt: buildSolicitationExtractPrompt({ ...input, projectType, pass: "structure" }),
      maxTokens: 8000,
      timeoutMs: 90_000,
    }),
  ]);

  if (summary.status === "rejected" && structure.status === "rejected") {
    const reason = summary.reason instanceof Error ? summary.reason.message : String(summary.reason);
    throw summary.reason instanceof ModelGatewayError
      ? summary.reason
      : new ModelGatewayError(reason, "provider_error");
  }

  const summaryFields = summary.status === "fulfilled" ? summary.value.parsed : {};
  const structureFields = structure.status === "fulfilled" ? structure.value.parsed : {};
  const merged: Record<string, unknown> = {
    ...pick(structureFields, ["inferredName", "solicitationRef", "dueDate", "issuer"]),
    ...pickPresent(summaryFields, ["inferredName", "solicitationRef", "dueDate", "issuer"]),
    ...pick(summaryFields, ["objective", "challenges", "services", "deliverables", "rfiSummary"]),
    ...pick(structureFields, ["requirements", "responseSections", "responseConstraints", "constraints"]),
  };
  const lead = summary.status === "fulfilled" ? summary.value : (structure as PromiseFulfilledResult<PassResult>).value;
  return { extraction: parseExtraction(merged), modelVersion: lead.modelVersion, provider: lead.provider };
}

interface PassResult {
  parsed: Record<string, unknown>;
  modelVersion: string;
  provider: "claude" | "gemini";
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter(key => key in source).map(key => [key, source[key]]));
}

function pickPresent(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys
    .filter(key => source[key] !== undefined && source[key] !== null && source[key] !== "")
    .map(key => [key, source[key]]));
}

/** One model call. If the output can't be parsed, retry once with the other provider first. */
async function runPass(options: {
  preferProvider: "claude" | "gemini";
  systemPrompt: string;
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
}): Promise<PassResult> {
  const attempt = async (preferProvider: "claude" | "gemini"): Promise<PassResult> => {
    const result = await callModel({
      tier: preferProvider === "claude" ? "judgment" : "extraction",
      preferProvider,
      promptVersion: SOLICITATION_EXTRACT_PROMPT_VERSION,
      systemPrompt: options.systemPrompt,
      prompt: options.prompt,
      classification: "internal",
      redactionProfile: "solicitation-extract-v1",
      maxTokens: options.maxTokens,
      temperature: 0.1,
      jsonMode: true,
      timeoutMs: options.timeoutMs,
    });
    let parsed: unknown;
    try {
      parsed = parseModelJson(result.content);
    } catch {
      throw new ModelGatewayError(`${result.provider} returned solicitation JSON that could not be parsed`, "empty_response");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ModelGatewayError(`${result.provider} returned a non-object solicitation payload`, "empty_response");
    }
    const record = parsed as Record<string, unknown>;
    if (record.dueDate === "") record.dueDate = null;
    return { parsed: record, modelVersion: result.modelVersion, provider: result.provider };
  };

  try {
    return await attempt(options.preferProvider);
  } catch (err) {
    if (!(err instanceof ModelGatewayError) || err.code !== "empty_response") throw err;
    return attempt(options.preferProvider === "claude" ? "gemini" : "claude");
  }
}
