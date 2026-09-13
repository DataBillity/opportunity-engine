import {
  SolicitationExtraction,
  type SolicitationExtraction as SolicitationExtractionType,
} from "@opportunity-engine/contracts";
import { callModel, ModelGatewayError } from "./gateway";
import { parseModelJson } from "./json";

export const SOLICITATION_EXTRACT_PROMPT_VERSION = "solicitation-extract-v1.0";

const SYSTEM_PROMPT = `You extract facts from an RFP or Statement of Work for DataBillity bid triage.

Hard rules:
- Use only the document text. Do not invent agencies, dates, certifications, or requirements.
- Prefer numbered/lettered shall/must statements as requirements.
- Mark passFail true only when the text is mandatory, pass/fail, or a certification/ATO/bond gate.
- If a field is not present, use an empty string, empty array, or null.
- Return ONLY JSON matching the schema.`;

export function buildSolicitationExtractPrompt(input: {
  filename: string;
  lane: "B" | "C";
  organizationName: string;
  organizationIndustry?: string;
  documentText: string;
}): string {
  const laneLabel = input.lane === "B" ? "Government RFP" : "Private SOW";
  return [
    `Document file: ${input.filename}`,
    `Lane: ${laneLabel}`,
    `Account: ${input.organizationName}${input.organizationIndustry ? ` (${input.organizationIndustry})` : ""}`,
    "",
    "DOCUMENT TEXT:",
    input.documentText,
    "",
    "Return JSON:",
    JSON.stringify({
      inferredName: "short project title",
      solicitationRef: "RFP or SOW number or empty",
      dueDate: "YYYY-MM-DD or null",
      issuer: "issuing org or empty",
      objective: ["..."],
      services: ["..."],
      deliverables: ["..."],
      requirements: [{
        requirementText: "...",
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
  organizationName: string;
  organizationIndustry?: string;
  documentText: string;
}): Promise<{ extraction: SolicitationExtractionType; modelVersion: string; provider: "claude" | "gemini" }> {
  const result = await callModel({
    tier: "extraction",
    promptVersion: SOLICITATION_EXTRACT_PROMPT_VERSION,
    systemPrompt: SYSTEM_PROMPT,
    prompt: buildSolicitationExtractPrompt(input),
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
