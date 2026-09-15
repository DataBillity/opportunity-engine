/**
 * Mechanism C — The Single Model Gateway (I6, AIG-11)
 *
 * This is the ONE door to any model. The ESLint no-restricted-imports
 * rule enforces that @anthropic-ai/sdk and @google/genai are only
 * importable inside this package.
 *
 * Judgment tier → Claude. Extraction tier → Gemini.
 * Each call falls back to the other provider if the primary is missing
 * or fails, so a single configured key still produces a draft.
 */

export interface GatewayCallInput {
  tier: "judgment" | "extraction";
  prompt: string;
  systemPrompt?: string;
  promptVersion: string;
  modelVersion?: string;
  graphVersion?: string;
  weightsVersion?: string;
  classification: "public" | "internal" | "confidential" | "regulated";
  redactionProfile: string;
  decisionId?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}

export interface GatewayCallOutput {
  content: string;
  modelVersion: string;
  provider: "claude" | "gemini";
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  region: string;
  cached: boolean;
}

export type ModelGatewayCode = "keys_missing" | "provider_error" | "empty_response";

export class ModelGatewayError extends Error {
  constructor(
    message: string,
    public readonly code: ModelGatewayCode,
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }
}

const APPROVED_REGIONS: Record<string, string[]> = {
  public: ["us", "eu", "ca"],
  internal: ["us", "eu", "ca"],
  confidential: ["us", "ca"],
  regulated: ["ca"],
};

const CLAUDE_MODELS = ["claude-sonnet-5", "claude-sonnet-4-6"];
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];

const CLAUDE_INPUT_USD = 2 / 1_000_000;
const CLAUDE_OUTPUT_USD = 10 / 1_000_000;
const GEMINI_INPUT_USD = 0.15 / 1_000_000;
const GEMINI_OUTPUT_USD = 0.60 / 1_000_000;

const CALL_TIMEOUT_MS = 45_000;

export function getAnthropicApiKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim();
}

export function getGeminiApiKey(): string {
  return (process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY ?? "").trim();
}

export function getAvailableProviders(): { claude: boolean; gemini: boolean } {
  return {
    claude: Boolean(getAnthropicApiKey()),
    gemini: Boolean(getGeminiApiKey()),
  };
}

export function describeMissingKeys(): string {
  const available = getAvailableProviders();
  const missing: string[] = [];
  if (!available.claude) missing.push("ANTHROPIC_API_KEY (Claude)");
  if (!available.gemini) missing.push("GOOGLE_AI_API_KEY (Gemini)");
  if (missing.length === 2) {
    return `Add ${missing.join(" and ")} to the repo-root .env.local (or apps/web/.env.local), then restart the dev server.`;
  }
  return `Optional: add ${missing.join(" and ")} so the gateway can use both providers.`;
}

export async function callModel(input: GatewayCallInput): Promise<GatewayCallOutput> {
  const allowedRegions = APPROVED_REGIONS[input.classification];
  if (!allowedRegions) {
    throw new Error(`Unknown classification: ${input.classification}`);
  }

  const preferred: "claude" | "gemini" = input.tier === "judgment" ? "claude" : "gemini";
  const available = getAvailableProviders();
  const order: Array<"claude" | "gemini"> = preferred === "claude"
    ? ["claude", "gemini"]
    : ["gemini", "claude"];
  const usable = order.filter(provider => available[provider]);

  if (usable.length === 0) {
    throw new ModelGatewayError(describeMissingKeys(), "keys_missing");
  }

  const errors: string[] = [];
  for (const provider of usable) {
    try {
      const result = provider === "claude"
        ? await callClaude(input, allowedRegions[0] ?? "us")
        : await callGemini(input, allowedRegions[0] ?? "us");
      return result;
    } catch (err) {
      errors.push(`${provider}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new ModelGatewayError(
    `All configured providers failed. ${errors.join(" | ")}`,
    "provider_error",
  );
}

function usesClaudeSonnet5Api(model: string): boolean {
  return model === "claude-sonnet-5" || model.startsWith("claude-sonnet-5-");
}

function buildClaudeRequestBody(model: string, input: GatewayCallInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: input.maxTokens ?? 1200,
    system: input.systemPrompt || undefined,
    messages: [{ role: "user", content: input.prompt }],
  };

  if (usesClaudeSonnet5Api(model)) {
    // Sonnet 5 turns adaptive thinking on by default and rejects non-default
    // sampling params. Keep the existing no-thinking JSON path so outreach and
    // extraction stay within their current max_tokens budgets.
    body.thinking = { type: "disabled" };
  } else {
    body.temperature = input.temperature ?? 0.4;
  }

  return body;
}

async function callClaude(input: GatewayCallInput, region: string): Promise<GatewayCallOutput> {
  const apiKey = getAnthropicApiKey();
  const models = input.modelVersion ? [input.modelVersion, ...CLAUDE_MODELS] : CLAUDE_MODELS;
  const unique = [...new Set(models)];
  let lastError = "Claude call failed";

  for (const model of unique) {
    const started = Date.now();
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(buildClaudeRequestBody(model, input)),
        signal: AbortSignal.timeout(input.timeoutMs ?? CALL_TIMEOUT_MS),
      });

      const payload = await response.json() as {
        error?: { message?: string };
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      if (!response.ok) {
        lastError = payload.error?.message || `Claude HTTP ${response.status}`;
        if (response.status === 404) continue;
        throw new Error(lastError);
      }

      const content = (payload.content ?? [])
        .filter(part => part.type === "text" && part.text)
        .map(part => part.text)
        .join("\n")
        .trim();

      if (!content) throw new ModelGatewayError("Claude returned an empty response", "empty_response");

      const inputTokens = payload.usage?.input_tokens ?? 0;
      const outputTokens = payload.usage?.output_tokens ?? 0;
      return {
        content,
        modelVersion: model,
        provider: "claude",
        inputTokens,
        outputTokens,
        costUsd: inputTokens * CLAUDE_INPUT_USD + outputTokens * CLAUDE_OUTPUT_USD,
        latencyMs: Date.now() - started,
        region,
        cached: false,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (err instanceof ModelGatewayError) throw err;
    }
  }

  throw new Error(lastError);
}

async function callGemini(input: GatewayCallInput, region: string): Promise<GatewayCallOutput> {
  const apiKey = getGeminiApiKey();
  const models = input.modelVersion ? [input.modelVersion, ...GEMINI_MODELS] : GEMINI_MODELS;
  const unique = [...new Set(models)];
  let lastError = "Gemini call failed";

  for (const model of unique) {
    const started = Date.now();
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const generationConfig: Record<string, unknown> = {
        temperature: input.temperature ?? 0.4,
        maxOutputTokens: input.maxTokens ?? 1200,
      };
      if (input.jsonMode) generationConfig.responseMimeType = "application/json";

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          system_instruction: input.systemPrompt
            ? { parts: [{ text: input.systemPrompt }] }
            : undefined,
          contents: [{ role: "user", parts: [{ text: input.prompt }] }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(input.timeoutMs ?? CALL_TIMEOUT_MS),
      });

      const payload = await response.json() as {
        error?: { message?: string };
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };

      if (!response.ok) {
        lastError = payload.error?.message || `Gemini HTTP ${response.status}`;
        if (response.status === 404) continue;
        throw new Error(lastError);
      }

      const content = (payload.candidates ?? [])
        .flatMap(candidate => candidate.content?.parts ?? [])
        .map(part => part.text)
        .filter((text): text is string => Boolean(text))
        .join("\n")
        .trim();

      if (!content) throw new ModelGatewayError("Gemini returned an empty response", "empty_response");

      const inputTokens = payload.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = payload.usageMetadata?.candidatesTokenCount ?? 0;
      return {
        content,
        modelVersion: model,
        provider: "gemini",
        inputTokens,
        outputTokens,
        costUsd: inputTokens * GEMINI_INPUT_USD + outputTokens * GEMINI_OUTPUT_USD,
        latencyMs: Date.now() - started,
        region,
        cached: false,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (err instanceof ModelGatewayError) throw err;
    }
  }

  throw new Error(lastError);
}
