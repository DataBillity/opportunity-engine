export { computeOpportunityAlignment } from "./scoring/opportunity-alignment";
export type { ScoringInputs, IntentSignal, AccountValue } from "./scoring/opportunity-alignment";
export { computePairwiseScore, ENTITY_RESOLUTION_THRESHOLDS } from "./entity-resolution";
export type { EntityCandidate, PairwiseScore } from "./entity-resolution";
export { buildDecisionRecord, computeRowHash } from "./decision/envelope";
export type { DecisionInput, DecisionOutput } from "./decision/envelope";
