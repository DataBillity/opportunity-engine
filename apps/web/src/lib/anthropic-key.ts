const MIN_KEY_LENGTH = 20;

/** Confirm the key is accepted by Anthropic before it is stored. The key is not logged. */
export async function assertAnthropicKey(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key.startsWith("sk-ant-") || key.length < MIN_KEY_LENGTH) {
    throw new Error("Enter a Claude API key from Anthropic. It starts with sk-ant-.");
  }

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      method: "GET",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("Could not reach Anthropic to check that Claude API key. Try again.");
  }

  if (!response.ok) {
    throw new Error("Anthropic rejected that Claude API key. Check the key and try again.");
  }
}

export function lastFour(apiKey: string): string {
  const key = apiKey.trim();
  return key.slice(-4);
}
