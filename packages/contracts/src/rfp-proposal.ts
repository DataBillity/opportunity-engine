/**
 * RFP proposal draft. The model returns parts of this shape in several calls; parsing drops rows it cannot use.
 */
import { z } from "zod";
import { GoNoGoQuestion } from "./rfp-gonogo";

const text = z.preprocess(
  value => (value == null ? "" : typeof value === "string" ? value.trim() : String(value)),
  z.string(),
);

const stringList = z.preprocess(
  value => {
    if (typeof value === "string") return value.trim() ? [value.trim()] : [];
    return Array.isArray(value)
      ? value.map(item => (typeof item === "string" ? item.trim() : typeof item === "number" ? String(item) : "")).filter(Boolean)
      : [];
  },
  z.array(z.string()),
).default([]);

function rows<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(value => {
    if (!Array.isArray(value)) return [];
    return value.flatMap(item => {
      const parsed = schema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  }, z.array(schema)).default([]);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const points = z.preprocess(value => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value.trim();
  return "";
}, z.string());

/** Pages as a number; text such as "Outside budget (assumed)" has no budget. */
const pageBudget = z.preprocess(value => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const match = value.match(/\d+(?:\.\d+)?/);
    if (match && !/outside|excluded|not counted/i.test(value)) return Number(match[0]);
  }
  return null;
}, z.number().nonnegative().nullable());

export const ProposalStructureBasis = z.preprocess(value => {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (raw.includes("prescrib")) return "prescribed";
  if (raw.includes("criteri")) return "criteria";
  return "standard";
}, z.enum(["prescribed", "criteria", "standard"]));

export const ProposalGapType = z.preprocess(value => {
  const raw = typeof value === "string" ? value.toLowerCase().replace(/[_-]+/g, " ") : "";
  if (raw.includes("sign")) return "signature";
  if (raw.includes("unverif")) return "unverified_claim";
  if (raw.includes("capab")) return "capability_gap";
  if (raw.includes("partner")) return "partner_input";
  if (raw.includes("decision")) return "decision_needed";
  if (raw.includes("complian")) return "compliance_risk";
  if (raw.includes("clarif") || raw.includes("issuer")) return "clarification";
  return "missing_information";
}, z.enum([
  "missing_information",
  "unverified_claim",
  "capability_gap",
  "partner_input",
  "decision_needed",
  "signature",
  "compliance_risk",
  "clarification",
]));

const Priority = z.preprocess(value => {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (raw.startsWith("h")) return "High";
  if (raw.startsWith("l")) return "Low";
  return "Medium";
}, z.enum(["High", "Medium", "Low"]));

const CheckResult = z.preprocess(value => {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (raw.startsWith("pass")) return "pass";
  if (raw.startsWith("fail")) return "fail";
  return "pending";
}, z.enum(["pass", "fail", "pending"]));

/** "gap-4", "GAP 004" and "GAP-004" are the same id. Anything else is left blank for the platform to number. */
const gapId = z.preprocess(value => {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  const match = raw.match(/^GAP[\s-]*(\d{1,4})$/);
  return match ? `GAP-${match[1]!.padStart(3, "0")}` : "";
}, z.string());

export const ProposalVolume = z.object({
  volume: text,
  file: text,
  pageLimit: text,
  countsTowardLimit: stringList,
  excludedFromLimit: stringList,
  sectionIds: stringList,
}).refine(row => row.volume.length > 0);

const structureDefaults = { basis: "standard", rationale: "", volumes: [] };

export const ProposalStructure = z.preprocess(value => ({
  ...structureDefaults,
  ...Object.fromEntries(Object.entries(record(value)).filter(([, item]) => item != null)),
}), z.object({
  basis: ProposalStructureBasis,
  rationale: text,
  volumes: rows(ProposalVolume),
}));

export const ProposalWinTheme = z.object({
  theme: text,
  customerNeed: text,
  discriminator: text,
  proof: text,
}).refine(row => row.theme.length > 0);

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export const ProposalSection = z.preprocess(value => {
  const source = record(value);
  const heading = [source.heading, source.title, source.name].find(item => typeof item === "string" && item.trim());
  const id = typeof source.id === "string" && source.id.trim()
    ? source.id.trim()
    : typeof heading === "string" ? slug(heading) : "";
  return { ...source, id, heading: heading ?? "" };
}, z.object({
  id: text,
  heading: text,
  rfpRef: text,
  criterion: text,
  points,
  pageBudget,
  /** What the section must answer, written by the planning call for the drafting call. */
  brief: text,
  content: text,
}).refine(row => row.id.length > 0));

export const ProposalFormField = z.object({
  field: text,
  value: text,
}).refine(row => row.field.length > 0);

export const ProposalForm = z.object({
  form: text,
  name: text,
  completedBy: stringList,
  placement: text,
  fields: rows(ProposalFormField),
  notes: text,
}).refine(row => row.form.length > 0 || row.name.length > 0);

export const ProposalGap = z.object({
  id: gapId,
  location: text,
  type: ProposalGapType,
  description: text,
  owner: text,
  priority: Priority,
  due: text,
  notes: text,
}).refine(row => row.description.length > 0);

export const ProposalComplianceRow = z.object({
  requirement: text,
  cite: text,
  answeredIn: text,
  criterion: text,
  owner: text,
  status: text,
}).refine(row => row.requirement.length > 0);

export const ProposalConsistencyCheck = z.object({
  check: text,
  result: CheckResult,
  detail: text,
  /** "platform" rows are computed after drafting; "model" rows come from the review call. */
  source: z.preprocess(value => (value === "platform" ? "platform" : "model"), z.enum(["model", "platform"])),
}).refine(row => row.check.length > 0);

export const RfpProposal = z.object({
  structure: ProposalStructure.default(structureDefaults),
  winThemes: rows(ProposalWinTheme),
  sections: rows(ProposalSection),
  forms: rows(ProposalForm),
  gapLog: rows(ProposalGap),
  complianceMatrix: rows(ProposalComplianceRow),
  consistencyChecks: rows(ProposalConsistencyCheck),
  submissionChecklist: stringList,
  issuerQuestions: rows(GoNoGoQuestion),
});

export type ProposalStructureBasis = z.infer<typeof ProposalStructureBasis>;
export type ProposalGapType = z.infer<typeof ProposalGapType>;
export type ProposalVolume = z.infer<typeof ProposalVolume>;
export type ProposalStructure = z.infer<typeof ProposalStructure>;
export type ProposalWinTheme = z.infer<typeof ProposalWinTheme>;
export type ProposalSection = z.infer<typeof ProposalSection>;
export type ProposalForm = z.infer<typeof ProposalForm>;
export type ProposalFormField = z.infer<typeof ProposalFormField>;
export type ProposalGap = z.infer<typeof ProposalGap>;
export type ProposalComplianceRow = z.infer<typeof ProposalComplianceRow>;
export type ProposalConsistencyCheck = z.infer<typeof ProposalConsistencyCheck>;
export type RfpProposal = z.infer<typeof RfpProposal>;

export interface RfpProposalMeta {
  generatedAt: string;
  provider: string;
  modelVersion: string;
  promptVersion: string;
  /** Steps that failed or were cut short, in plain language. */
  warnings: string[];
}

export type RfpProposalRecord = RfpProposal & { meta: RfpProposalMeta };

function unwrap(raw: unknown): unknown {
  const source = record(raw);
  if (Object.keys(source).some(key => key in RfpProposal.shape)) return source;
  for (const key of ["proposal", "draft", "result", "response"]) {
    const nested = record(source[key]);
    if (Object.keys(nested).length) return nested;
  }
  return source;
}

/** Parse any part of a proposal. Missing fields come back empty. */
export function parseRfpProposalPart(raw: unknown): RfpProposal {
  const parsed = RfpProposal.safeParse(unwrap(raw));
  return parsed.success ? parsed.data : RfpProposal.parse({});
}

/** Parse a whole proposal. Returns null when it has no sections. */
export function parseRfpProposal(raw: unknown): RfpProposal | null {
  const parsed = RfpProposal.safeParse(unwrap(raw));
  if (!parsed.success || !parsed.data.sections.length) return null;
  return parsed.data;
}
