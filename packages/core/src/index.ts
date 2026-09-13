export { computeOpportunityAlignment } from "./scoring/opportunity-alignment";
export type { ScoringInputs, IntentSignal, AccountValue } from "./scoring/opportunity-alignment";
export {
  extractSolicitationHeuristic,
  mergeSolicitationExtractions,
  scorePursuitTriage,
  capSourceText,
} from "./scoring/pursuit-triage";
export type { OrgTriageContext } from "./scoring/pursuit-triage";
export {
  BILLITY_CAPABILITIES,
  ICP_VERTICALS,
  matchBillityCapabilities,
  inferIcpVertical,
  isIcpSector,
  mergeCapabilityMatches,
  commercialMotionOf,
} from "./scoring/billity-icp";
export type { CapabilityMatch, PublicSignal, BillityCapabilityId, IcpVerticalId, CommercialLane } from "./scoring/billity-icp";
export { computePairwiseScore, ENTITY_RESOLUTION_THRESHOLDS, normalizeLegalName } from "./entity-resolution";
export type { EntityCandidate, PairwiseScore } from "./entity-resolution";
export {
  parseLinkedInConnectionsCsv,
  evaluateLinkedInBatch,
  LINKEDIN_BATCH_THRESHOLDS,
  isQualifiedPipelineLead,
} from "./ingest/linkedin-connections";
export type {
  LinkedInConnectionRow,
  EvaluatedLead,
  ResolvedAccount,
  LinkedInBatchResult,
} from "./ingest/linkedin-connections";
export { buildDecisionRecord, computeRowHash } from "./decision/envelope";
export type { DecisionInput, DecisionOutput } from "./decision/envelope";
