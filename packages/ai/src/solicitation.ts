import {
  SolicitationExtraction,
  type SolicitationExtraction as SolicitationExtractionType,
  type ProjectType,
} from "@opportunity-engine/contracts";
import { callModel, ModelGatewayError } from "./gateway";
import { parseModelJson } from "./json";

export const SOLICITATION_EXTRACT_PROMPT_VERSION = "solicitation-extract-v1.1";

const RFP_SOW_PROMPT = `You extract facts from an RFP or Statement of Work for DataBillity bid triage.

Hard rules:
- Use only the document text. Do not invent agencies, dates, certifications, or requirements.
- Prefer numbered/lettered shall/must statements as requirements.
- Mark passFail true only when the text is mandatory, pass/fail, or a certification/ATO/bond gate.
- If a field is not present, use an empty string, empty array, or null.
- Return ONLY JSON matching the schema.`;

const RFI_PROMPT = `You extract facts from a Request for Information (RFI) for DataBillity pursuit triage.

An RFI is market research, not a bid. The issuer is asking for information. DataBillity has not answered yet.

Hard rules:
- Use only the document text. Do not invent agencies, dates, certifications, or answers.
- Extract the questions / information requests the issuer asked vendors to address.
- Do not treat "provide information" or "please describe" as bid shall-statements that have already been fulfilled.
- Mark passFail true only for eligibility to respond (registration, NDA, mandatory form). Never for an unanswered information request.
- If a field is not present, use an empty string, empty array, or null.
- Return ONLY JSON matching the schema.`;

function systemPromptFor(projectType: ProjectType): string {
  return projectType === "rfi" ? RFI_PROMPT : RFP_SOW_PROMPT;
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
}): string {
  const projectType = input.projectType ?? (input.lane === "C" ? "sow" : "rfp");
  const refHint = projectType === "rfi" ? "RFI number or empty" : "RFP or SOW number or empty";
  const reqHint = projectType === "rfi"
    ? "information request or question the issuer asked — not an answer we have already provided"
    : "...";
  return [
    `Document file: ${input.filename}`,
    `Lane: ${laneLabel(projectType, input.lane)}`,
    `Project type: ${projectType.toUpperCase()}`,
    `Account: ${input.organizationName}${input.organizationIndustry ? ` (${input.organizationIndustry})` : ""}`,
    "",
    "DOCUMENT TEXT:",
    input.documentText,
    "",
    "Return JSON:",
    JSON.stringify({
      inferredName: "short project title",
      solicitationRef: refHint,
      dueDate: "YYYY-MM-DD or null",
      issuer: "issuing org or empty",
      objective: ["..."],
      services: ["..."],
      deliverables: projectType === "rfi" ? ["requested information topics"] : ["..."],
      requirements: [{
        requirementText: reqHint,
        sectionRef: "optional",
        passFail: false,
        weight: 0,
      }],
      responseSections: [{ ref: "Vol I § 3.2", title: "Technical Approach", sectionId: "tech" }],
      constraints: ["hard constraints only"],
    }),
  ].join("\n");
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
  const result = await callModel({
    tier: "extraction",
    promptVersion: SOLICITATION_EXTRACT_PROMPT_VERSION,
    systemPrompt: systemPromptFor(projectType),
    prompt: buildSolicitationExtractPrompt({ ...input, projectType }),
    classification: "internal",
    redactionProfile: "solicitation-extract-v1",
    maxTokens: 2500,
    temperature: 0.1,
    jsonMode: true,
    timeoutMs: 60_000,
  });

  let parsed: unknown;
  try {
    parsed = parseModelJson(result.content);
  } catch {
    throw new ModelGatewayError("Model returned solicitation JSON that could not be parsed", "empty_response");
  }

  if (parsed && typeof parsed === "object" && "dueDate" in parsed && (parsed as { dueDate?: unknown }).dueDate === "") {
    (parsed as { dueDate: null }).dueDate = null;
  }

  const extraction = SolicitationExtraction.parse(parsed);
  return {
    extraction,
    modelVersion: result.modelVersion,
    provider: result.provider,
  };
}
