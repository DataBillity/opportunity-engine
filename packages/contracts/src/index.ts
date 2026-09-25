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

export const ProjectType = z.enum(["rfp", "rfi", "sow"]);

export const PursuitInput = z.object({
  organizationId: z.string().optional(),
  organizationName: z.string().optional(),
  lane: z.enum(["B", "C"]),
  projectType: ProjectType.optional(),
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
  name: z.string().min(1),
  title: z.string().optional(),
  email: z.string().optional(),
});

export const OutreachPursuitBrief = z.object({
  id: z.string(),
  name: z.string().min(1),
  typeLabel: z.string(),
  solicitationRef: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  rec: z.string().optional(),
  status: z.string().optional(),
  closed: z.boolean().optional(),
  docSummary: z.object({
    objective: z.array(z.string()).default([]),
    challenges: z.array(z.string()).default([]),
    services: z.array(z.string()).default([]),
    deliverables: z.array(z.string()).default([]),
    responseConstraints: z.array(z.string()).default([]),
  }).optional(),
  informationRequests: z.array(z.string()).default([]),
  rationale: z.array(z.string()).default([]),
  mappedRequirements: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
});

export const OutreachBriefing = z.object({
  senderName: z.string().min(1),
  senderTitle: z.string().optional(),
  senderCompany: z.string().default("DataBillity"),
  organization: z.object({
    id: z.string(),
    name: z.string().min(1),
    industry: z.string().optional(),
    channel: z.string().optional(),
    summary: z.string().optional(),
    whyGoodFit: z.string().optional(),
    score: z.number().min(0).max(100).optional(),
    scoreFactors: z.array(z.string()).default([]),
    notes: z.array(z.string()).default([]),
    contact: OutreachContact.optional(),
  }),
  pursuit: OutreachPursuitBrief.nullable().optional(),
});

export const OutreachDraftOutput = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  usedInsightIds: z.array(z.string()).default([]),
});

export const ResponseDraftPerson = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  roles: z.array(z.string()).default([]),
  expertise: z.string().optional(),
  technologies: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  assignedRole: z.string().optional(),
  resumeText: z.string().optional(),
});

export const ResponseDraftExperience = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  technologies: z.array(z.string()).default([]),
  services: z.array(z.string()).default([]),
  summary: z.string().optional(),
});

export const ResponseDraftBriefing = z.object({
  section: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    ref: z.string().optional(),
  }),
  instructions: z.string().optional(),
  existingDraft: z.string().optional(),
  organization: z.object({
    name: z.string().min(1),
    industry: z.string().optional(),
    summary: z.string().optional(),
  }),
  pursuit: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    typeLabel: z.string(),
    solicitationRef: z.string().optional(),
    dueDate: z.string().nullable().optional(),
    rec: z.string().optional(),
    documents: z.array(z.string()).default([]),
    docSummary: z.object({
      objective: z.array(z.string()).default([]),
      challenges: z.array(z.string()).default([]),
      services: z.array(z.string()).default([]),
      deliverables: z.array(z.string()).default([]),
      responseConstraints: z.array(z.string()).default([]),
    }).optional(),
    informationRequests: z.array(z.string()).default([]),
    capabilities: z.array(z.string()).default([]),
    mappedRequirements: z.array(z.string()).default([]),
    unmappedRequirements: z.array(z.string()).default([]),
    gaps: z.array(z.string()).default([]),
    rationale: z.array(z.string()).default([]),
    sourceExcerpt: z.string().optional(),
  }),
  people: z.array(ResponseDraftPerson).default([]),
  experience: z.array(ResponseDraftExperience).default([]),
});

export const ResponseDraftOutput = z.object({
  body: z.string().min(1),
  usedInsightIds: z.array(z.string()).default([]),
});

export const SolicitationRequirement = z.object({
  requirementText: z.string().min(1),
  sectionRef: z.string().optional(),
  passFail: z.boolean().default(false),
  weight: z.number().min(0).max(100).optional(),
});

export const SolicitationExtraction = z.object({
  inferredName: z.string().default(""),
  solicitationRef: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  issuer: z.string().optional(),
  objective: z.array(z.string()).default([]),
  challenges: z.array(z.string()).default([]),
  services: z.array(z.string()).default([]),
  deliverables: z.array(z.string()).default([]),
  requirements: z.array(SolicitationRequirement).default([]),
  responseConstraints: z.array(z.string()).default([]),
  responseSections: z.array(z.object({
    ref: z.string(),
    title: z.string(),
    sectionId: z.string().optional(),
  })).default([]),
  constraints: z.array(z.string()).default([]),
});

export const PursuitDocumentMeta = z.object({
  name: z.string().min(1),
  kind: z.enum(["solicitation", "sow", "addendum", "other"]),
  mime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  extractedChars: z.number().int().nonnegative(),
  parseStatus: z.enum(["extracted", "empty", "unsupported"]),
});

export const PursuitScoreBreakdown = z.object({
  projectType: ProjectType,
  capabilityAlignment: z.number().min(0).max(100),
  intentTiming: z.number().min(0).max(100),
  accountValueFit: z.number().min(0).max(100),
  inboundIntentUplift: z.number().min(0).max(100),
  coveragePct: z.number().min(0).max(100),
  mappedCount: z.number().int().nonnegative(),
  totalRequirements: z.number().int().nonnegative(),
  documentOverlapCount: z.number().int().nonnegative(),
  goScoreFloor: z.number(),
  goCoverageFloor: z.number(),
  condScoreFloor: z.number(),
  condCoverageFloor: z.number(),
  passFailBlocked: z.boolean(),
  recRule: z.string(),
  detectedFromDocument: z.boolean().default(false),
  typeOverridden: z.boolean().default(false),
});

export const PursuitTriageView = z.object({
  score: z.number().min(0).max(100),
  rec: z.enum(["go", "nogo", "cond", "pending"]),
  confidence: z.number().min(0).max(100),
  confidenceNote: z.string().optional(),
  projectType: ProjectType.default("rfp"),
  scoreBreakdown: PursuitScoreBreakdown.optional(),
  status: z.string(),
  rationale: z.array(z.string()),
  reqmap: z.array(z.object({
    req: z.string(),
    status: z.enum(["mapped", "unmapped"]),
    node: z.string().nullable(),
    evidence: z.string(),
  })),
  gaps: z.array(z.object({
    id: z.string(),
    title: z.string(),
    crit: z.string(),
    demand: z.string(),
    closure: z.string(),
  })),
  rfund: z.object({
    lane: z.string(),
    tier: z.string(),
    score: z.number().min(0).max(100),
    note: z.string(),
  }),
  complianceMatrix: z.array(z.object({
    ref: z.string(),
    title: z.string(),
    sectionId: z.string(),
  })).default([]),
  decisionAction: z.string(),
  modelVersion: z.string(),
  provider: z.enum(["claude", "gemini", "heuristic"]),
});

export const PursuitIngestResult = z.object({
  documents: z.array(PursuitDocumentMeta),
  extraction: SolicitationExtraction,
  triage: PursuitTriageView,
  sourceText: z.string(),
  sourceTextTruncated: z.boolean(),
  usedModel: z.boolean(),
  warning: z.string().optional(),
});

export type OpportunityAlignmentWeights = z.infer<typeof OpportunityAlignmentWeights>;
export type ScoreRunOutput = z.infer<typeof ScoreRunOutput>;
export type TriageRunOutput = z.infer<typeof TriageRunOutput>;
export type ProjectType = z.infer<typeof ProjectType>;
export type LeadInput = z.infer<typeof LeadInput>;
export type PursuitInput = z.infer<typeof PursuitInput>;
export type PursuitScoreBreakdown = z.infer<typeof PursuitScoreBreakdown>;
export type OutreachBriefing = z.infer<typeof OutreachBriefing>;
export type OutreachPursuitBrief = z.infer<typeof OutreachPursuitBrief>;
export type OutreachDraftOutput = z.infer<typeof OutreachDraftOutput>;
export type ResponseDraftPerson = z.infer<typeof ResponseDraftPerson>;
export type ResponseDraftExperience = z.infer<typeof ResponseDraftExperience>;
export type ResponseDraftBriefing = z.infer<typeof ResponseDraftBriefing>;
export type ResponseDraftOutput = z.infer<typeof ResponseDraftOutput>;
export type SolicitationRequirement = z.infer<typeof SolicitationRequirement>;
export type SolicitationExtraction = z.infer<typeof SolicitationExtraction>;
export type PursuitDocumentMeta = z.infer<typeof PursuitDocumentMeta>;
export type PursuitTriageView = z.infer<typeof PursuitTriageView>;
export type PursuitIngestResult = z.infer<typeof PursuitIngestResult>;
