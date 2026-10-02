import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Mechanism C — The Single Model Gateway (I6, AIG-11)
 *
 * This is the ONE door to any model. Every call goes to Claude Sonnet 5.5.
 * Stable prefixes (the system prompt, and a caller-supplied document prefix)
 * are marked for a 1-hour prompt cache so later steps of the same job read
 * them back instead of paying full input price.
 *
 * Sonnet 5.5 bills thinking as output and rejects temperature. Up-front
 * thinking is off (`between_tools`) so the output budget stays on the answer.
 * Output is capped only by the model maximum.
 */

export interface GatewayCallInput {
  tier: "judgment" | "extraction";
  prompt: string;
  /**
   * Text placed before `prompt` with a cache breakpoint after it. Use this for
   * the part of the user message that is identical across calls (the RFP
   * package, the solicitation text). The dynamic task stays in `prompt`.
   */
  cachePrefix?: string;
  systemPrompt?: string;
  promptVersion: string;
  modelVersion?: string;
  graphVersion?: string;
  weightsVersion?: string;
  classification: "public" | "internal" | "confidential" | "regulated";
  redactionProfile: string;
  decisionId?: string;
  timeoutMs?: number;
  /**
   * Absolute epoch-ms deadline shared across every attempt in this call.
   * Each attempt's timeout is capped to the time remaining, so a slow
   * attempt cannot push the whole request past the host's function limit.
   */
  deadlineAt?: number;
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

const CLAUDE_MODEL = "claude-sonnet-5-5";
/** Sonnet 5.5 maximum output. Callers do not set a lower cap. */
const MAX_OUTPUT_TOKENS = 128_000;

const CLAUDE_INPUT_USD = 2 / 1_000_000;
const CLAUDE_OUTPUT_USD = 10 / 1_000_000;
const CLAUDE_CACHE_WRITE_5M_USD = 2.5 / 1_000_000;
const CLAUDE_CACHE_WRITE_1H_USD = 4 / 1_000_000;
const CLAUDE_CACHE_READ_USD = 0.2 / 1_000_000;

const CALL_TIMEOUT_MS = 45_000;
/** Do not start another attempt with less than this left before the deadline. */
const MIN_ATTEMPT_MS = 8_000;

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

/** Per-attempt timeout, capped by the shared deadline. Returns 0 when the budget is spent. */
function attemptTimeoutMs(input: GatewayCallInput): number {
  const requested = input.timeoutMs ?? CALL_TIMEOUT_MS;
  if (input.deadlineAt === undefined) return requested;
  const remaining = input.deadlineAt - Date.now();
  if (remaining < MIN_ATTEMPT_MS) return 0;
  return Math.min(requested, remaining);
}

const anthropicKeyStore = new AsyncLocalStorage<string>();

/**
 * Run model calls with an organization Claude key. Nested callModel() reads
 * this key instead of ANTHROPIC_API_KEY.
 */
export function runWithAnthropicKey<T>(apiKey: string, fn: () => Promise<T>): Promise<T> {
  const key = apiKey.trim();
  if (!key) return fn();
  return anthropicKeyStore.run(key, fn);
}

export function getAnthropicApiKey(): string {
  return (anthropicKeyStore.getStore() ?? process.env.ANTHROPIC_API_KEY ?? "").trim();
}

export function getAvailableProviders(): { claude: boolean } {
  return { claude: Boolean(getAnthropicApiKey()) };
}

export function describeMissingKeys(): string {
  return "Add ANTHROPIC_API_KEY (Claude) to the repo-root .env.local (or apps/web/.env.local), then restart the dev server.";
}

function cachedBlock(text: string): Record<string, unknown> {
  return {
    type: "text",
    text,
    cache_control: { type: "ephemeral", ttl: "1h" },
  };
}

function buildClaudeRequestBody(model: string, input: GatewayCallInput): Record<string, unknown> {
  const prefix = input.cachePrefix?.trim() ? input.cachePrefix : "";
  const prompt = input.prompt ?? "";
  const userContent = prefix
    ? [
      cachedBlock(prefix),
      ...(prompt.trim() ? [{ type: "text", text: prompt }] : []),
    ]
    : prompt;

  const body: Record<string, unknown> = {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: "user", content: userContent }],
    // No up-front thinking. Sonnet 5.5 rejects thinking.type disabled.
    thinking: { type: "between_tools" },
  };

  if (input.systemPrompt?.trim()) {
    body.system = [cachedBlock(input.systemPrompt)];
  }

  return body;
}

function costFromUsage(usage: ClaudeUsage | undefined): {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cached: boolean;
} {
  const uncached = usage?.input_tokens ?? 0;
  const read = usage?.cache_read_input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const fiveMinute = usage?.cache_creation?.ephemeral_5m_input_tokens;
  const oneHour = usage?.cache_creation?.ephemeral_1h_input_tokens;
  const wroteBreakdown = fiveMinute !== undefined || oneHour !== undefined;
  // Requests ask for a 1-hour cache. The aggregate field is that write when the breakdown is absent.
  const write5m = wroteBreakdown ? (fiveMinute ?? 0) : 0;
  const write1h = wroteBreakdown ? (oneHour ?? 0) : (usage?.cache_creation_input_tokens ?? 0);
  const inputTokens = uncached + write5m + write1h + read;
  const costUsd = uncached * CLAUDE_INPUT_USD
    + write5m * CLAUDE_CACHE_WRITE_5M_USD
    + write1h * CLAUDE_CACHE_WRITE_1H_USD
    + read * CLAUDE_CACHE_READ_USD
    + outputTokens * CLAUDE_OUTPUT_USD;
  return { inputTokens, outputTokens, costUsd, cached: read > 0 };
}

export async function callModel(input: GatewayCallInput): Promise<GatewayCallOutput> {
  const allowedRegions = APPROVED_REGIONS[input.classification];
  if (!allowedRegions) {
    throw new Error(`Unknown classification: ${input.classification}`);
  }

  if (!getAnthropicApiKey()) {
    throw new ModelGatewayError(describeMissingKeys(), "keys_missing");
  }

  return callClaude(input, allowedRegions[0] ?? "us");
}

async function callClaude(input: GatewayCallInput, region: string): Promise<GatewayCallOutput> {
  const apiKey = getAnthropicApiKey();
  const models = [...new Set([input.modelVersion, CLAUDE_MODEL].filter((model): model is string => Boolean(model)))];
  let lastError = "Claude call failed";

  for (const model of models) {
    const started = Date.now();
    const timeoutMs = attemptTimeoutMs(input);
    if (timeoutMs === 0) throw new Error(`${lastError} (time budget exhausted)`);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(buildClaudeRequestBody(model, input)),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const payload = await response.json() as {
        error?: { message?: string };
        content?: Array<{ type?: string; text?: string }>;
        usage?: ClaudeUsage;
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

      const usage = costFromUsage(payload.usage);
      return {
        content,
        modelVersion: model,
        provider: "claude",
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
        latencyMs: Date.now() - started,
        region,
        cached: usage.cached,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (err instanceof ModelGatewayError) throw err;
      if (isTimeoutError(err)) throw new Error(`Claude timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
  }

  throw new Error(lastError);
}
