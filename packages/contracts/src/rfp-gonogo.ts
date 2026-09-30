/**
 * RFP Go/No-Go assessment. The model returns this shape; parsing drops rows it cannot use.
 */
import { z } from "zod";

const text = z.preprocess(
  value => (value == null ? "" : typeof value === "string" ? value.trim() : String(value)),
  z.string(),
);

const scoreValue = z.preprocess(value => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}, z.number().int().min(0).max(100));

const factorScore = z.preprocess(value => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 2;
  return Math.min(5, Math.max(1, Math.round(n)));
}, z.number().int().min(1).max(5));

const weight = z.preprocess(value => {
  if (typeof value === "string" && value.trim().endsWith("%")) {
    const n = Number(value.replace("%", ""));
    return Number.isFinite(n) ? n / 100 : 0;
  }
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 1 ? n / 100 : n;
}, z.number().min(0).max(1));

export const GoNoGoDecisionLabel = z.preprocess(value => {
  const raw = typeof value === "string" ? value.toLowerCase().replace(/[_-]+/g, " ") : "";
  if (/\bno\b|nogo/.test(raw)) return "No-Go";
  if (raw.includes("cond")) return "Conditional Go";
  if (raw === "go" || raw.startsWith("go ")) return "Go";
  return "Conditional Go";
}, z.enum(["Go", "Conditional Go", "No-Go"]));

export const GoNoGoConfidenceLabel = z.preprocess(value => {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (raw.startsWith("h")) return "High";
  if (raw.startsWith("l")) return "Low";
  return "Medium";
}, z.enum(["High", "Medium", "Low"]));

const GateStatus = z.preprocess(value => {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (raw.startsWith("pass")) return "Pass";
  if (raw.startsWith("cur")) return "Curable";
  if (raw.startsWith("fail")) return "Fail";
  return "Unknown";
}, z.enum(["Pass", "Curable", "Unknown", "Fail"]));

const ScoreBasis = z.preprocess(value => {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (raw.includes("assum")) return "assumed";
  if (raw.includes("source")) return "sources";
  return "RFP";
}, z.enum(["sources", "RFP", "assumed"]));

const Priority = z.preprocess(value => {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (raw.startsWith("h")) return "High";
  if (raw.startsWith("l")) return "Low";
  return "Medium";
}, z.enum(["High", "Medium", "Low"]));

const QuestionType = z.preprocess(value => {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (raw.includes("conflict")) return "conflict";
  if (raw.includes("missing")) return "missing information";
  if (raw.includes("scope")) return "scope";
  return "ambiguity";
}, z.enum(["conflict", "ambiguity", "missing information", "scope"]));

const WorkType = z.preprocess(value => {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (raw.includes("both") || (raw.includes("tech") && raw.includes("consult"))) return "both";
  if (raw.includes("consult") || raw.includes("strategy")) return "consulting";
  if (/\btech|\bit\b|system|solution/.test(raw)) return "technical";
  return "other";
}, z.enum(["technical", "consulting", "both", "other"]));

const points = z.preprocess(value => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value.trim();
  return "";
}, z.string());

function rows<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(value => {
    if (!Array.isArray(value)) return [];
    return value.flatMap(item => {
      const parsed = schema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  }, z.array(schema)).default([]);
}

export const GoNoGoCondition = z.object({
  condition: text,
  owner: text,
  by: text,
}).refine(row => row.condition.length > 0);

export const GoNoGoRecommendation = z.preprocess(value => {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    decision: "Conditional Go",
    score: 0,
    scoreMath: "",
    confidence: "Low",
    rationale: "",
    conditions: [],
    decideBy: "",
    upside: "",
    ...Object.fromEntries(Object.entries(source).filter(([, item]) => item != null)),
  };
}, z.object({
  decision: GoNoGoDecisionLabel,
  score: scoreValue,
  scoreMath: text,
  confidence: GoNoGoConfidenceLabel,
  rationale: text,
  conditions: rows(GoNoGoCondition),
  decideBy: text,
  upside: text,
}));

export const GoNoGoKeyDate = z.object({
  event: text,
  date: text,
  source: text,
}).refine(row => row.event.length > 0 || row.date.length > 0);

const opportunityShape = {
  issuer: text,
  title: text,
  number: text,
  objective: text,
  workType: WorkType,
  scope: z.preprocess(
    value => (Array.isArray(value) ? value.map(item => (typeof item === "string" ? item.trim() : "")).filter(Boolean) : []),
    z.array(z.string()),
  ),
  term: text,
  value: text,
  pricingModel: text,
  funding: text,
  keyDates: rows(GoNoGoKeyDate),
  incumbent: text,
  evaluationMethod: text,
  structure: text,
};

const opportunityDefaults: Record<keyof typeof opportunityShape, unknown> = {
  issuer: "",
  title: "",
  number: "",
  objective: "",
  workType: "other",
  scope: [],
  term: "",
  value: "",
  pricingModel: "",
  funding: "",
  keyDates: [],
  incumbent: "",
  evaluationMethod: "",
  structure: "",
};

export const GoNoGoOpportunity = z.preprocess(value => {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return { ...opportunityDefaults, ...Object.fromEntries(Object.entries(source).filter(([, item]) => item != null)) };
}, z.object(opportunityShape)).default(opportunityDefaults);

export const GoNoGoDocument = z.object({
  document: text,
  role: text,
  notes: text,
}).refine(row => row.document.length > 0);

export const GoNoGoGate = z.object({
  gate: text,
  requirement: text,
  evidence: text,
  status: GateStatus,
  action: text,
}).refine(row => row.gate.length > 0);

export const GoNoGoCriterion = z.object({
  criterion: text,
  points: points,
  whatWins: text,
  teamEvidence: text,
  estimatedPoints: text,
  howToImprove: text,
}).refine(row => row.criterion.length > 0);

export const GoNoGoScoreRow = z.object({
  factor: text,
  weight: weight,
  score: factorScore,
  evidence: text,
  basis: ScoreBasis,
}).refine(row => row.factor.length > 0);

export const GoNoGoRisk = z.object({
  area: text,
  risk: text,
  evidence: text,
  severity: Priority,
  mitigation: text,
}).refine(row => row.risk.length > 0);

export const GoNoGoTeaming = z.object({
  need: text,
  whyItMatters: text,
  evidence: text,
  registeredPartner: text,
  action: text,
}).refine(row => row.need.length > 0);

export const GoNoGoGap = z.object({
  id: text,
  item: text,
  type: text,
  owner: text,
  priority: Priority,
  due: text,
  evidence: text,
}).refine(row => row.item.length > 0);

export const GoNoGoQuestion = z.object({
  question: text,
  basis: text,
  evidence: text,
  type: QuestionType,
  priority: Priority,
  timing: text,
}).refine(row => row.question.length > 0);

export const GoNoGoLotAssessment = z.object({
  lot: text,
  recommendation: GoNoGoRecommendation,
  gates: rows(GoNoGoGate),
  issuerCriteria: rows(GoNoGoCriterion),
  scorecard: rows(GoNoGoScoreRow),
}).refine(row => row.lot.length > 0);

const stringList = z.preprocess(
  value => (Array.isArray(value) ? value.map(item => (typeof item === "string" ? item.trim() : "")).filter(Boolean) : []),
  z.array(z.string()),
).default([]);

export const RfpGoNoGoAssessment = z.object({
  recommendation: GoNoGoRecommendation,
  opportunity: GoNoGoOpportunity.default({}),
  documentMap: rows(GoNoGoDocument),
  gates: rows(GoNoGoGate),
  issuerCriteria: rows(GoNoGoCriterion),
  scorecard: rows(GoNoGoScoreRow),
  risks: rows(GoNoGoRisk),
  teaming: rows(GoNoGoTeaming),
  gapLog: rows(GoNoGoGap),
  issuerQuestions: rows(GoNoGoQuestion),
  lotAssessments: rows(GoNoGoLotAssessment),
  submissionRequirements: stringList,
  adjustments: stringList,
});

export type GoNoGoDecisionLabel = z.infer<typeof GoNoGoDecisionLabel>;
export type GoNoGoConfidenceLabel = z.infer<typeof GoNoGoConfidenceLabel>;
export type GoNoGoRecommendation = z.infer<typeof GoNoGoRecommendation>;
export type GoNoGoOpportunity = z.infer<typeof GoNoGoOpportunity>;
export type GoNoGoGate = z.infer<typeof GoNoGoGate>;
export type GoNoGoScoreRow = z.infer<typeof GoNoGoScoreRow>;
export type RfpGoNoGoAssessment = z.infer<typeof RfpGoNoGoAssessment>;

function unwrapAssessment(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const record = raw as Record<string, unknown>;
  if (record.recommendation && typeof record.recommendation === "object") return record;
  for (const key of ["assessment", "goNoGo", "result"]) {
    const nested = record[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested;
  }
  return record;
}

/** Parse a model payload. Returns null when the recommendation or scorecard is missing. */
export function parseRfpGoNoGo(raw: unknown): RfpGoNoGoAssessment | null {
  const parsed = RfpGoNoGoAssessment.safeParse(unwrapAssessment(raw));
  if (!parsed.success) return null;
  if (!parsed.data.scorecard.length || !parsed.data.recommendation.rationale) return null;
  return parsed.data;
}
