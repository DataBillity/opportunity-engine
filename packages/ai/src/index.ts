export {
  callModel,
  getAvailableProviders,
  describeMissingKeys,
  getAnthropicApiKey,
  getGeminiApiKey,
  ModelGatewayError,
} from "./gateway";
export type { GatewayCallInput, GatewayCallOutput, ModelGatewayCode } from "./gateway";
export {
  generateOutreachDraft,
  collectGroundingFacts,
  buildOutreachPrompt,
  OUTREACH_PROMPT_VERSION,
} from "./outreach";
export type { GroundingFact, OutreachDraft } from "./outreach";
export { parseModelJson } from "./json";
export {
  extractSolicitationWithModel,
  buildSolicitationExtractPrompt,
  SOLICITATION_EXTRACT_PROMPT_VERSION,
} from "./solicitation";
export {
  generateResponseDraft,
  collectResponseFacts,
  buildResponseDraftPrompt,
  renumberResolvedGapIds,
  RESPONSE_DRAFT_PROMPT_VERSION,
} from "./response-draft";
export type { ResponseGroundingFact, ResponseSectionDraft } from "./response-draft";
export {
  generateRfiResponsePackage,
  fallbackRfiPackage,
  reconcileRfiPackage,
  RFI_RESPONSE_PROMPT_VERSION,
} from "./rfi-response";
export type { RfiResponseDraft } from "./rfi-response";
export {
  generateCoverLetter,
  fallbackCoverLetter,
  buildCoverLetterPrompt,
  COVER_LETTER_MAX_WORDS,
  COVER_LETTER_PROMPT_VERSION,
} from "./cover-letter";
export {
  assessRfpGoNoGo,
  buildRfpGoNoGoUserPrompt,
  RFP_GONOGO_PROMPT,
  RFP_GONOGO_PROMPT_VERSION,
} from "./rfp-gonogo";
export type { RfpGoNoGoSources, RfpGoNoGoModelResult } from "./rfp-gonogo";
export type { CoverLetterDraft } from "./cover-letter";
