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

export type OpportunityAlignmentWeights = z.infer<typeof OpportunityAlignmentWeights>;
export type ScoreRunOutput = z.infer<typeof ScoreRunOutput>;
export type TriageRunOutput = z.infer<typeof TriageRunOutput>;
export type LeadInput = z.infer<typeof LeadInput>;
export type PursuitInput = z.infer<typeof PursuitInput>;
