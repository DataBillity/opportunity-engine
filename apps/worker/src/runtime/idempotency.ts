/**
 * Mechanism D — Idempotency and Dead-lettering (I8)
 * Every intake path computes a stable submission_key and inserts into
 * job_submission before doing any work. Unique-constraint violation
 * means already-processed; the handler returns the prior result.
 */

export interface IdempotencyResult {
  alreadyProcessed: boolean;
  priorResultRef?: string;
}

export function computeSubmissionKey(source: string, payload: unknown): string {
  const content = JSON.stringify({ source, payload });
  // In production, use crypto.createHash('sha256')
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `${source}:${Math.abs(hash).toString(36)}`;
}
