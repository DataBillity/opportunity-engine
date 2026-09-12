/**
 * Mechanism B — The Decision Envelope (I4, I7)
 * Every automated decision point executes through this function.
 * The tables that store scores require a non-null decision_id foreign key,
 * making it structurally impossible to persist an automated output without its log record.
 */
import { createHash } from "crypto";

export interface DecisionInput {
  decisionType: string;
  subjectRef: string;
  subjectIsIndividual: boolean;
  inputs: Array<{ sourceRef: string; capturedAt: string }>;
  modelVersion?: string;
  promptVersion?: string;
  graphVersion?: string;
  weightsVersion?: string;
}

export interface DecisionOutput<T> {
  decisionId: string;
  output: T;
  rowHash: string;
  prevHash: string | null;
}

export function computeRowHash(prevHash: string | null, canonicalRow: string): string {
  const content = `${prevHash ?? "genesis"}||${canonicalRow}`;
  return createHash("sha256").update(content).digest("hex");
}

export function buildDecisionRecord<T>(
  input: DecisionInput,
  output: T,
  decisionId: string,
  prevHash: string | null,
): DecisionOutput<T> {
  const canonicalRow = JSON.stringify({
    decisionId,
    ...input,
    output,
  });

  const rowHash = computeRowHash(prevHash, canonicalRow);

  return {
    decisionId,
    output,
    rowHash,
    prevHash,
  };
}
