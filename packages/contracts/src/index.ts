/**
 * Shared zod contracts — web ↔ worker
 * Every intake boundary and every model output is parsed, not trusted.
 */
import { z } from "zod";

// Scoring weights (40/35/25 for Opportunity Alignment)
export const OpportunityAlignmentWeights = z.object({
  capabilityAlignment: z.number().default(40),
  intentTiming: z.number().default(35),
  accountValueFit: z.number().default(25),
});

export const ScoreRunOutput = z.object({
  total: z.number().min(0).max(100),
  capabilityAlignment: z.number().min(0).max(100),
  intentTiming: z.number().min(0).max(100),
  accountValueFit: z.number().min(0).max(100),
  inboundIntentUplift: z.number().optional(),
  evidenceRefs: z.array(z.string()).optional(),
});

export const TriageOutcome = z.enum(["go", "no_go", "go_with_conditions"]);

export const TriageRunOutput = z.object({
  totalScore: z.number().min(0).max(100),
  outcome: TriageOutcome,
  conditions: z.string().optional(),
  rationale: z.string(),
  requirements: z.array(z.object({
    requirementText: z.string(),
    sectionRef: z.string().optional(),
    weight: z.number().optional(),
    mappedNodeId: z.string().nullable(),
    mappedVia: z.enum(["consortium", "partner", "unmapped"]),
    confidence: z.number().optional(),
  })),
});

export const LeadInput = z.object({
  organizationName: z.string().min(1),
  industry: z.string().optional(),
  channel: z.enum([
    "outbound", "web_form", "email", "referral", "event",
    "partner", "inbound_rfi", "bulk_list",
  ]),
  contactName: z.string().optional(),
  contactTitle: z.string().optional(),
  contactEmail: z.string().email().optional(),
  context: z.string().optional(),
});

export const PursuitInput = z.object({
  organizationId: z.string().optional(),
  organizationName: z.string().optional(),
  lane: z.enum(["B", "C"]),
  name: z.string().min(1),
  solicitationRef: z.string().optional(),
  scopeSummary: z.string().optional(),
});

export const DecisionEnvelopeInput = z.object({
  decisionType: z.string(),
  subjectRef: z.string(),
  subjectIsIndividual: z.boolean().default(false),
  inputs: z.array(z.object({
    sourceRef: z.string(),
    capturedAt: z.string(),
  })),
});

export const OutreachContact = z.object({
  name: z.string().min(1).max(200),
  title: z.string().max(200).optional(),
  email: z.string().max(320).optional(),
});

export const OutreachPursuitBrief = z.object({
  id: z.string().max(80),
  name: z.string().min(1).max(300),
  typeLabel: z.string().max(80),
  solicitationRef: z.string().max(120).optional(),
  dueDate: z.string().max(40).nullable().optional(),
  rec: z.string().max(40).optional(),
  status: z.string().max(200).optional(),
  closed: z.boolean().optional(),
  docSummary: z.object({
    objective: z.array(z.string().max(500)).max(8),
    services: z.array(z.string().max(500)).max(8),
    deliverables: z.array(z.string().max(500)).max(8),
  }).optional(),
  rationale: z.array(z.string().max(500)).max(8).default([]),
  mappedRequirements: z.array(z.string().max(400)).max(8).default([]),
  gaps: z.array(z.string().max(400)).max(8).default([]),
});

export const OutreachBriefing = z.object({
  senderName: z.string().min(1).max(120),
  senderTitle: z.string().max(120).optional(),
  senderCompany: z.string().max(120).default("DataBillity"),
  organization: z.object({
    id: z.string().max(80),
    name: z.string().min(1).max(300),
    industry: z.string().max(200).optional(),
    channel: z.string().max(80).optional(),
    summary: z.string().max(2000).optional(),
    whyGoodFit: z.string().max(1000).optional(),
    score: z.number().min(0).max(100).optional(),
    scoreFactors: z.array(z.string().max(500)).max(8).default([]),
    notes: z.array(z.string().max(800)).max(6).default([]),
    contact: OutreachContact.optional(),
  }),
  pursuit: OutreachPursuitBrief.nullable().optional(),
});

export const OutreachDraftOutput = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  usedInsightIds: z.array(z.string().max(12)).max(16).default([]),
});

export const SolicitationRequirement = z.object({
  requirementText: z.string().min(1).max(600),
  sectionRef: z.string().max(80).optional(),
  passFail: z.boolean().default(false),
  weight: z.number().min(0).max(100).optional(),
});

export const SolicitationExtraction = z.object({
  inferredName: z.string().max(300).default(""),
  solicitationRef: z.string().max(120).optional(),
  dueDate: z.string().max(40).nullable().optional(),
  issuer: z.string().max(200).optional(),
  objective: z.array(z.string().max(500)).max(8).default([]),
  services: z.array(z.string().max(500)).max(8).default([]),
  deliverables: z.array(z.string().max(500)).max(8).default([]),
  requirements: z.array(SolicitationRequirement).max(24).default([]),
  responseSections: z.array(z.object({
    ref: z.string().max(80),
    title: z.string().max(160),
    sectionId: z.string().max(40).optional(),
  })).max(12).default([]),
  constraints: z.array(z.string().max(400)).max(12).default([]),
});

export const PursuitDocumentMeta = z.object({
  name: z.string().min(1).max(260),
  kind: z.enum(["solicitation", "sow", "addendum", "other"]),
  mime: z.string().max(120),
  sizeBytes: z.number().int().nonnegative(),
  extractedChars: z.number().int().nonnegative(),
  parseStatus: z.enum(["extracted", "empty", "unsupported"]),
});

export const PursuitTriageView = z.object({
  score: z.number().min(0).max(100),
  rec: z.enum(["go", "nogo", "cond", "pending"]),
  confidence: z.number().min(0).max(100),
  status: z.string().max(200),
  rationale: z.array(z.string().max(500)).max(10),
  reqmap: z.array(z.object({
    req: z.string().max(600),
    status: z.enum(["mapped", "unmapped"]),
    node: z.string().max(200).nullable(),
    evidence: z.string().max(400),
  })).max(24),
  gaps: z.array(z.object({
    id: z.string().max(40),
    title: z.string().max(300),
    crit: z.string().max(120),
    demand: z.string().max(200),
    closure: z.string().max(200),
  })).max(16),
  rfund: z.object({
    lane: z.string().max(8),
    tier: z.string().max(40),
    score: z.number().min(0).max(100),
    note: z.string().max(500),
  }),
  complianceMatrix: z.array(z.object({
    ref: z.string().max(80),
    title: z.string().max(160),
    sectionId: z.string().max(40),
  })).max(12).default([]),
  decisionAction: z.string().max(300),
  modelVersion: z.string().max(120),
  provider: z.enum(["claude", "gemini", "heuristic"]),
});

export const PursuitIngestResult = z.object({
  documents: z.array(PursuitDocumentMeta).max(5),
  extraction: SolicitationExtraction,
  triage: PursuitTriageView,
  sourceText: z.string().max(40000),
  sourceTextTruncated: z.boolean(),
  usedModel: z.boolean(),
  warning: z.string().max(400).optional(),
});

export type OpportunityAlignmentWeights = z.infer<typeof OpportunityAlignmentWeights>;
export type ScoreRunOutput = z.infer<typeof ScoreRunOutput>;
export type TriageRunOutput = z.infer<typeof TriageRunOutput>;
export type LeadInput = z.infer<typeof LeadInput>;
export type PursuitInput = z.infer<typeof PursuitInput>;
export type OutreachBriefing = z.infer<typeof OutreachBriefing>;
export type OutreachPursuitBrief = z.infer<typeof OutreachPursuitBrief>;
export type OutreachDraftOutput = z.infer<typeof OutreachDraftOutput>;
export type SolicitationRequirement = z.infer<typeof SolicitationRequirement>;
export type SolicitationExtraction = z.infer<typeof SolicitationExtraction>;
export type PursuitDocumentMeta = z.infer<typeof PursuitDocumentMeta>;
export type PursuitTriageView = z.infer<typeof PursuitTriageView>;
export type PursuitIngestResult = z.infer<typeof PursuitIngestResult>;
