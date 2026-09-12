/**
 * Opportunity Alignment Scoring (40/35/25)
 * PURE function — no I/O, no network, no DB imports.
 * SCORE-01, SCORE-07, SCORE-08
 */
import type { OpportunityAlignmentWeights, ScoreRunOutput } from "@opportunity-engine/contracts";

export interface ScoringInputs {
  capabilityMatchCount: number;
  totalCapabilitiesRequired: number;
  matchMaturity: number; // 0-1 average maturity of matched capabilities
  intentSignals: IntentSignal[];
  accountValue: AccountValue;
  isInbound: boolean;
}

export interface IntentSignal {
  type: "budget_confirmed" | "rfp_released" | "leadership_change" | "public_statement" | "job_posting" | "prior_relationship";
  confidence: number; // 0-1
  recency: number; // days since signal
}

export interface AccountValue {
  sector: string;
  sizeBand: string;
  priorRelationship: boolean;
  multiYearPotential: boolean;
  referenceAccountPotential: boolean;
}

const DEFAULT_WEIGHTS: OpportunityAlignmentWeights = {
  capabilityAlignment: 40,
  intentTiming: 35,
  accountValueFit: 25,
};

export function computeOpportunityAlignment(
  inputs: ScoringInputs,
  weights: OpportunityAlignmentWeights = DEFAULT_WEIGHTS,
): ScoreRunOutput {
  const capScore = computeCapabilityAlignment(inputs);
  const intentScore = computeIntentTiming(inputs.intentSignals);
  const valueScore = computeAccountValueFit(inputs.accountValue);

  const weighted =
    (capScore * weights.capabilityAlignment +
     intentScore * weights.intentTiming +
     valueScore * weights.accountValueFit) / 100;

  const inboundUplift = inputs.isInbound ? Math.min(10, intentScore * 0.15) : 0;
  const total = Math.round(Math.min(100, weighted + inboundUplift));

  return {
    total,
    capabilityAlignment: Math.round(capScore),
    intentTiming: Math.round(intentScore),
    accountValueFit: Math.round(valueScore),
    inboundIntentUplift: Math.round(inboundUplift),
  };
}

function computeCapabilityAlignment(inputs: ScoringInputs): number {
  if (inputs.totalCapabilitiesRequired === 0) return 50;
  const coverageRatio = inputs.capabilityMatchCount / inputs.totalCapabilitiesRequired;
  const maturityBonus = inputs.matchMaturity * 20;
  return Math.min(100, coverageRatio * 80 + maturityBonus);
}

function computeIntentTiming(signals: IntentSignal[]): number {
  if (signals.length === 0) return 30;
  const signalScores = signals.map(s => {
    const recencyDecay = Math.max(0, 1 - s.recency / 365);
    return s.confidence * recencyDecay * 100;
  });
  return Math.min(100, signalScores.reduce((a, b) => a + b, 0) / signals.length);
}

function computeAccountValueFit(value: AccountValue): number {
  let score = 40;
  if (value.priorRelationship) score += 25;
  if (value.multiYearPotential) score += 15;
  if (value.referenceAccountPotential) score += 10;
  if (["healthcare", "government", "public_transit", "financial_services"].includes(value.sector?.toLowerCase())) score += 10;
  return Math.min(100, score);
}
