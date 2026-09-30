import { parseRfpGoNoGo, type RfpGoNoGoAssessment } from "@opportunity-engine/contracts";
import { callModel, ModelGatewayError } from "./gateway";
import { parseModelJson } from "./json";
import { RFP_GONOGO_PROMPT, RFP_GONOGO_PROMPT_VERSION } from "./rfp-gonogo-prompt";

export { RFP_GONOGO_PROMPT, RFP_GONOGO_PROMPT_VERSION } from "./rfp-gonogo-prompt";

export interface RfpGoNoGoSources {
  documentText: string;
  documentNames?: string[];
  primePartnerName?: string;
  capabilitiesText?: string;
  partnerRecordsText?: string;
  bidHistoryText?: string;
  reviewerInstructions?: string;
}

export function buildRfpGoNoGoUserPrompt(input: RfpGoNoGoSources): string {
  const names = input.documentNames?.filter(Boolean) ?? [];
  return [
    "=== RFP PACKAGE ===",
    names.length ? `Files: ${names.join("; ")}` : "Files: the document text below.",
    "Each file starts with a line \"===== DOCUMENT: file name =====\" when more than one file was uploaded.",
    "",
    input.documentText.trim(),
    "",
    "=== CAPABILITIES SOURCES ===",
    input.primePartnerName
      ? `Prime Partner (registered name): ${input.primePartnerName}`
      : "No Partner is registered as Prime. Use owner \"Prime\" with no company name.",
    input.capabilitiesText?.trim() || "None provided.",
    "",
    "=== PARTNER RECORDS ===",
    input.partnerRecordsText?.trim() || "None provided.",
    "",
    "=== BID HISTORY ===",
    input.bidHistoryText?.trim() || "None provided.",
    "",
    "=== REVIEWER INSTRUCTIONS ===",
    input.reviewerInstructions?.trim() || "None provided. Use the default scorecard weights and the 70 and 55 thresholds.",
    "",
    "Return JSON:",
  ].join("\n");
}

export interface RfpGoNoGoModelResult {
  assessment: RfpGoNoGoAssessment;
  modelVersion: string;
  provider: "claude" | "gemini";
}

/** One judgment-tier call. A parse failure retries once. */
export async function assessRfpGoNoGo(input: RfpGoNoGoSources): Promise<RfpGoNoGoModelResult> {
  const full = buildRfpGoNoGoUserPrompt(input);
  const marker = "\nReturn JSON:";
  const at = full.lastIndexOf(marker);
  const cachePrefix = at < 0 ? "" : full.slice(0, at);
  const prompt = at < 0 ? full : full.slice(at);
  const attempt = async (): Promise<RfpGoNoGoModelResult> => {
    const result = await callModel({
      tier: "judgment",
      promptVersion: RFP_GONOGO_PROMPT_VERSION,
      systemPrompt: RFP_GONOGO_PROMPT,
      cachePrefix,
      prompt,
      classification: "internal",
      redactionProfile: "solicitation-extract-v1",
      timeoutMs: 160_000,
    });
    let parsed: unknown;
    try {
      parsed = parseModelJson(result.content);
    } catch {
      throw new ModelGatewayError(`${result.provider} returned Go/No-Go JSON that could not be parsed`, "empty_response");
    }
    const assessment = parseRfpGoNoGo(parsed);
    if (!assessment) {
      throw new ModelGatewayError(`${result.provider} returned a Go/No-Go payload that did not match the schema`, "empty_response");
    }
    return { assessment, modelVersion: result.modelVersion, provider: result.provider };
  };

  try {
    return await attempt();
  } catch (err) {
    if (!(err instanceof ModelGatewayError) || err.code !== "empty_response") throw err;
    return attempt();
  }
}
