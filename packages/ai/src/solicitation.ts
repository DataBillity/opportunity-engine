import {
  SolicitationExtraction,
  type SolicitationExtraction as SolicitationExtractionType,
  type ProjectType,
} from "@opportunity-engine/contracts";
import { callModel, ModelGatewayError } from "./gateway";
import { parseModelJson } from "./json";

export const SOLICITATION_EXTRACT_PROMPT_VERSION = "solicitation-extract-v1.2";

const RFP_SOW_PROMPT = `You extract facts from an RFP or Statement of Work for DataBillity bid triage.

Hard rules:
- Use only the document text. Do not invent agencies, dates, certifications, or requirements.
- Prefer numbered/lettered shall/must statements as requirements.
- Mark passFail true only when the text is mandatory, pass/fail, or a certification/ATO/bond gate.
- If a field is not present, use an empty string, empty array, or null.
- Return ONLY JSON matching the schema.`;

const RFI_PROMPT = `You extract facts from a Request for Information (RFI) for DataBillity pursuit triage.

An RFI is market research, not a bid. Score the opportunity on the work the issuer is trying to do, not on how they want the response formatted.

Hard rules:
- Use only the document text. Do not invent agencies, dates, certifications, or answers.
- objective: why they issued the RFI — the scope and outcome they are researching. Not the questions they ask vendors.
- challenges: problems in the current system or process they are trying to resolve.
- services: business and technology services a future solution would likely include.
- deliverables: systems, modules, or work products a future solution would likely produce. Not the RFI response itself.
- requirements: the questions the issuer asked vendors to answer, kept so a later response can address them. Do not put those questions in objective, challenges, services, or deliverables.
- responseConstraints: how to write the response (page limit, font, margins, file format, submission mechanics). Never put these in objective, services, deliverables, requirements, or constraints.
- constraints: eligibility or security gates that affect whether we can do the work. Not page count or formatting.
- Mark passFail true only for eligibility to respond (registration, NDA, mandatory form). Never for an unanswered information request or a page limit.
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
      objective: projectType === "rfi" ? ["why they issued the RFI and the outcome they want"] : ["..."],
      challenges: projectType === "rfi" ? ["current-state problems they are trying to resolve"] : ["..."],
      services: projectType === "rfi" ? ["business or technology services a future solution would likely include"] : ["..."],
      deliverables: projectType === "rfi" ? ["systems or work products a future solution would likely produce"] : ["..."],
      requirements: [{
        requirementText: reqHint,
        sectionRef: "optional",
        passFail: false,
        weight: 0,
      }],
      responseSections: [{ ref: "Vol I § 3.2", title: "Technical Approach", sectionId: "tech" }],
      responseConstraints: projectType === "rfi" ? ["page limit, font, margins, or submission format — not scored"] : [],
      constraints: ["eligibility or security gates only — not page limits"],
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
