import {
  SolicitationExtraction,
  type SolicitationExtraction as SolicitationExtractionType,
  type ProjectType,
} from "@opportunity-engine/contracts";
import { callModel, ModelGatewayError } from "./gateway";
import { parseModelJson } from "./json";
import { RFI_SUMMARY_PROMPT } from "./rfi-summary-prompt";
import { bidStructurePrompt, RFP_SUMMARY_PROMPT, SOW_SUMMARY_PROMPT } from "./scope-summary-prompts";

export const SOLICITATION_EXTRACT_PROMPT_VERSION = "solicitation-extract-v2.2";

const RFI_STRUCTURE_PROMPT = `You extract the response structure of a Request for Information (RFI) for a DataBillity bid team.

Hard rules:
- Use only the document text. Each uploaded file starts with a line "===== DOCUMENT: file name =====".
- Ignore the cover page, table of contents, and page headers and footers.
- requirements: the questions and information requests vendors must answer in their response (the questionnaire or response worksheet, and any "describe" or "provide" requests in the RFI body), numbered and ordered as the RFI does. Shorten each to at most 25 words. sectionRef is the part, section, or question number. Skip form fields such as company name and address. The questions to answer come from the issuer's own response worksheet or questionnaire (usually an attachment titled "Response Worksheet") and the RFI body. Skip every document titled "Response to Vendor Questions", "Questions and Answers", or similar: those questions were asked by other vendors and answered by the issuer. They are clarifications, not questions for us, and never requirements or response sections.
- responseSections: if the RFI specifies headings, a questionnaire, or a template, copy that structure and numbering. If it does not, use exactly these sectionIds: cover (Cover letter), company (Company and team overview), understanding (Understanding of the requirement), questions (Responses to specific questions), experience (Relevant experience), recommendations (Recommendations for the future solicitation), contacts (Points of contact).
- responseConstraints: how to write and submit the response (page limit, font, margins, file type, naming, recipients, whether attachments or appendices are allowed, question deadline).
- constraints: eligibility or security gates that affect whether we can do the work. Not page count or formatting.
- Mark passFail true only for eligibility to respond (registration, NDA, mandatory form). Never for an information request or a page limit.
- If a field is not present, use an empty string, empty array, or null.
- Return ONLY JSON matching the schema.`;

type RfiPass = "summary" | "structure";

function systemPromptFor(projectType: ProjectType, pass: RfiPass = "summary"): string {
  if (projectType === "rfi") return pass === "structure" ? RFI_STRUCTURE_PROMPT : RFI_SUMMARY_PROMPT;
  if (pass === "structure") return bidStructurePrompt(projectType);
  return projectType === "sow" ? SOW_SUMMARY_PROMPT : RFP_SUMMARY_PROMPT;
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
  documentNames?: string[];
  pass?: RfiPass;
}): string {
  const projectType = input.projectType ?? (input.lane === "C" ? "sow" : "rfp");
  const header = [
    input.documentNames && input.documentNames.length > 1
      ? `Documents in this package: ${input.documentNames.join("; ")}`
      : `Document file: ${input.filename}`,
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

  const isRfi = projectType === "rfi";
  if (input.pass === "structure") {
    return [...header, JSON.stringify({
      ...metadata,
      requirements: [{
        requirementText: isRfi
          ? "question or information request vendors must answer, at most 25 words"
          : "shall or must statement, task, or deliverable, at most 25 words",
        sectionRef: "part, section, or question number",
        passFail: false,
        weight: 0,
      }],
      responseSections: isRfi
        ? [
          { ref: "Cover", title: "Cover letter", sectionId: "cover" },
          { ref: "Questions", title: "Responses to specific questions", sectionId: "questions" },
        ]
        : [{ ref: "Vol I § 3.2", title: "Technical Approach", sectionId: "tech" }],
      responseConstraints: ["page limit, font, margins, or submission format — not scored"],
      constraints: ["eligibility or security gates only — not page limits"],
    })].join("\n");
  }

  const source = isRfi ? "the RFI" : projectType === "sow" ? "the SOW" : "the solicitation";
  return [
    ...header,
    JSON.stringify({
      ...metadata,
      objective: ["[Action] the [system/process/program] in order to [business outcome] for [who benefits] (§ cites)"],
      challenges: [`every stated problem, numbered as ${source} numbers them, in your words`],
      services: ["explicit services only"],
      deliverables: [isRfi ? "target end state lines" : "named deliverables and outcomes"],
      rfiSummary: {
        workType: "technical | consulting | both | other",
        objectiveConfidence: "High | Medium | Low",
        procurementObjective: isRfi
          ? "acquisition decision with cite, or empty"
          : projectType === "sow" ? "engagement model and term with cite, or empty" : "contract type and award basis with cite, or empty",
        challengeThemes: [{ theme: "theme", detail: "sentence ending with item numbers", evidence: "cite", rootCause: false }],
        consequences: ["effect the issuer names"],
        endState: "paragraph",
        endStateConstraints: ["hosting, standards, budget signals, timeline, with cites"],
        nextStep: "next procurement step or empty",
        services: [{ service: "name", type: "explicit | inferred", evidence: "reason + cite", confidence: "High | Medium | Low, empty for explicit" }],
        gaps: ["action for the bid team"],
        ...(isRfi ? {} : {
          evaluationCriteria: ["factor, weight or relative importance, with cite"],
          commercialTerms: ["risky term in your words, the risk, and a cite"],
        }),
      },
      issuerQuestions: [{
        question: "...",
        basis: "...",
        evidence: "cites",
        type: "conflict | ambiguity | missing information | scope",
        priority: "High | Medium | Low",
        timing: isRfi ? "Before response | At demonstration or future solicitation" : "Before response | State as an assumption in the response",
      }],
      responseSections: [isRfi
        ? { ref: "Part I", title: "section title", sectionId: "part-1" }
        : { ref: "Vol I", title: "section title", sectionId: "tech" }],
      responseConstraints: ["submission rule"],
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
  if (Array.isArray(summary.services)) {
    summary.services = summary.services.map(row => {
      const item = row && typeof row === "object" ? row as Record<string, unknown> : null;
      return item && typeof item.service !== "string" && typeof item.name === "string"
        ? { ...item, service: item.name }
        : row;
    });
  }
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
    issuerQuestions: rows("issuerQuestions", "question"),
    evaluationCriteria: strings("evaluationCriteria"),
    commercialTerms: strings("commercialTerms"),
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Models sometimes return sections as "Part I: Solution" strings instead of objects. */
function normalizeResponseSections(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.flatMap(item => {
    if (typeof item === "string") {
      const text = item.trim();
      if (!text) return [];
      const split = text.match(/^([^:]{1,40}):\s*(.+)$/);
      const ref = split ? split[1]!.trim() : text;
      const title = split ? split[2]!.trim() : text;
      return [{ ref, title, sectionId: slugify(ref) || slugify(title) }];
    }
    if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      if (!title) return [];
      return [{ ...row, ref: typeof row.ref === "string" ? row.ref : "", title }];
    }
    return [];
  });
}

/** Parse the model payload; a malformed rfiSummary is dropped rather than failing the whole extraction. */
export function parseExtraction(parsed: unknown): SolicitationExtractionType {
  if (!parsed || typeof parsed !== "object") return SolicitationExtraction.parse(parsed);
  const record = { ...(parsed as Record<string, unknown>) };
  if ("responseSections" in record) record.responseSections = normalizeResponseSections(record.responseSections);
  if ("issuerQuestions" in record) {
    if (record.rfiSummary && typeof record.rfiSummary === "object") {
      record.rfiSummary = { ...(record.rfiSummary as Record<string, unknown>), issuerQuestions: record.issuerQuestions };
    }
    delete record.issuerQuestions;
  }
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
  documentNames?: string[];
}): Promise<ModelExtractionResult> {
  const projectType = input.projectType ?? (input.lane === "C" ? "sow" : "rfp");

  // Two passes in parallel so a long questionnaire or requirement list can't crowd the scope summary out of the token budget.
  const [summary, structure] = await Promise.allSettled([
    runPass({
      preferProvider: "claude",
      systemPrompt: systemPromptFor(projectType, "summary"),
      prompt: buildSolicitationExtractPrompt({ ...input, projectType, pass: "summary" }),
      maxTokens: 12000,
      timeoutMs: 130_000,
    }),
    runPass({
      preferProvider: "gemini",
      systemPrompt: systemPromptFor(projectType, "structure"),
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
    ...pick(summaryFields, ["objective", "challenges", "services", "deliverables", "rfiSummary", "issuerQuestions"]),
    ...pick(structureFields, ["requirements", "constraints"]),
    ...pickPresent(structureFields, ["responseSections", "responseConstraints"]),
    ...pickNonEmptyLists(summaryFields, ["responseSections", "responseConstraints"]),
  };
  const lead = summary.status === "fulfilled" ? summary.value : (structure as PromiseFulfilledResult<PassResult>).value;
  return {
    extraction: parseExtraction(merged),
    modelVersion: lead.modelVersion,
    provider: lead.provider,
    summaryFromModel: summary.status === "fulfilled",
    structureModel: structure.status === "fulfilled"
      ? `${structure.value.provider} / ${structure.value.modelVersion}`
      : undefined,
    summaryError: summary.status === "rejected"
      ? (summary.reason instanceof Error ? summary.reason.message : String(summary.reason))
      : undefined,
  };
}

export interface ModelExtractionResult {
  extraction: SolicitationExtractionType;
  modelVersion: string;
  provider: "claude" | "gemini";
  /** False when the summary pass failed and only the structure pass returned. */
  summaryFromModel: boolean;
  summaryError?: string;
  /** The model that read the requirements and response sections; undefined when that pass failed and the text parser filled in. */
  structureModel?: string;
}

function pickNonEmptyLists(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys
    .filter(key => Array.isArray(source[key]) && (source[key] as unknown[]).length > 0)
    .map(key => [key, source[key]]));
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
