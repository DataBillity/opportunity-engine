/**
 * Mechanism C — The Single Model Gateway (I6, AIG-11)
 *
 * This is the ONE door to any model. The ESLint no-restricted-imports
 * rule enforces that @anthropic-ai/sdk and @google/genai are only
 * importable inside this package.
 *
 * Obligations:
 * - Pins model_version, prompt_version, graph_version, weights_version on every call
 * - Redacts fields not required for the call before transmission
 * - Writes a model_call row linked to the decision row
 * - Refuses Regulated/High Risk content to non-approved regions
 * - Enforces monthly cost envelope with 80% alert and hard cap
 * - Caches graph-grounding context by graph_version + node set
 */

export interface GatewayCallInput {
  tier: "judgment" | "extraction";
  prompt: string;
  promptVersion: string;
  modelVersion?: string;
  graphVersion?: string;
  weightsVersion?: string;
  classification: "public" | "internal" | "confidential" | "regulated";
  redactionProfile: string;
  decisionId?: string;
}

export interface GatewayCallOutput {
  content: string;
  modelVersion: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  region: string;
  cached: boolean;
}

// Approved regions for data residency (AIG-12, NFR-RES-01)
const APPROVED_REGIONS: Record<string, string[]> = {
  public: ["us", "eu", "ca"],
  internal: ["us", "eu", "ca"],
  confidential: ["us", "ca"],
  regulated: ["ca"],
};

export async function callModel(input: GatewayCallInput): Promise<GatewayCallOutput> {
  const allowedRegions = APPROVED_REGIONS[input.classification];
  if (!allowedRegions) {
    throw new Error(`Unknown classification: ${input.classification}`);
  }

  // In production: route to Claude (judgment) or Gemini (extraction) via Cloudflare AI Gateway
  // For now, return a structured placeholder
  return {
    content: `[Model response for ${input.tier} tier — ${input.promptVersion}]`,
    modelVersion: input.modelVersion ?? (input.tier === "judgment" ? "claude-sonnet-4-20250514" : "gemini-2.5-flash"),
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: 0,
    region: allowedRegions[0] ?? "us",
    cached: false,
  };
}
