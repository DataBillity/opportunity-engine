export { computeOpportunityAlignment, computeCapabilityAlignment } from "./scoring/opportunity-alignment";
export { reassessPursuit, gapForRequirement, PARTNER_COVERAGE_NODE } from "./scoring/reassess";
export type {
  ReassessInput,
  ReassessResult,
  ReassessRequirement,
  ReassessGap,
  ReassessCapability,
  ReassessPartner,
  ReassessBreakdown,
  RequirementChange,
} from "./scoring/reassess";
export type { ScoringInputs, IntentSignal, AccountValue } from "./scoring/opportunity-alignment";
export {
  extractSolicitationHeuristic,
  mergeSolicitationExtractions,
  sanitizeRfiObjective,
  scorePursuitTriage,
  capSourceText,
  recommendFromCoverage,
} from "./scoring/pursuit-triage";
export type { OrgTriageContext } from "./scoring/pursuit-triage";
export {
  combineSolicitationDocuments,
  isQuestionAnswerDocument,
  normalizeSolicitationText,
  omitQuestionAnswerDocuments,
  orderSolicitationDocuments,
  splitLabeledDocuments,
} from "./scoring/document-text";
export {
  buildHeuristicRfiSummary,
  inferRfiServices,
  mergeRfiSummaries,
  themeRfiChallenges,
} from "./scoring/rfi-summary";
export {
  BID_REC_THRESHOLDS,
  RFI_REC_THRESHOLDS,
  laneForProjectType,
  projectTypeFromLane,
  projectTypeLabel,
  projectTypeLongLabel,
  recDecisionLabel,
  recShortLabel,
  isRfiDocument,
  resolveProjectType,
  thresholdsFor,
  RFI_OUTLINE_SECTIONS,
  RFP_OUTLINE_SECTIONS,
  SOW_OUTLINE_SECTIONS,
  outlineSectionsFor,
} from "./scoring/project-type";
export type { ProjectType } from "./scoring/project-type";
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
