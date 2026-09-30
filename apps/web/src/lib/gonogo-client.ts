import { parseRfpGoNoGo } from "@opportunity-engine/contracts";
import { enforceGoNoGoRules, goNoGoFields, type GoNoGoFields } from "@opportunity-engine/core";

export class GoNoGoRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoNoGoRequestError";
  }
}

export async function requestGoNoGoAssessment(input: {
  sourceText: string;
  documentNames: string[];
  organizationName: string;
  teamPartnerIds: string[];
}): Promise<GoNoGoFields> {
  const response = await fetch("/api/projects/gonogo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const json: { error?: unknown; assessment?: unknown } = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new GoNoGoRequestError(typeof json.error === "string" ? json.error : `Assessment failed (${response.status})`);
  }
  const assessment = parseRfpGoNoGo(json.assessment);
  if (!assessment) throw new GoNoGoRequestError("Assessment returned an invalid packet");
  return goNoGoFields(enforceGoNoGoRules(assessment));
}
