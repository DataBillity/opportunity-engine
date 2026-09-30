/**
 * Decision rules for an RFP Go/No-Go assessment.
 * The model proposes the packet; these rules set the score, decision, and confidence.
 */
import type {
  GoNoGoDecisionLabel,
  GoNoGoRecommendation,
  RfpGoNoGoAssessment,
  PursuitTriageView,
} from "@opportunity-engine/contracts";

export const GONOGO_GO_SCORE = 70;
export const GONOGO_CONDITIONAL_SCORE = 55;

export interface EnforcedGoNoGo {
  assessment: RfpGoNoGoAssessment;
  rec: "go" | "nogo" | "cond";
  adjustments: string[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatWeight(weight: number): string {
  return weight.toFixed(2).replace(/^0/, "");
}

function isCapabilityFactor(factor: string): boolean {
  return /capabilit|past performance/i.test(factor);
}

function isContractRiskFactor(factor: string): boolean {
  return /contract/i.test(factor) && /risk|delivery/i.test(factor);
}

function registeredName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^none registered$/i.test(trimmed)) return false;
  if (/^not found\b/i.test(trimmed)) return false;
  if (/^prime$/i.test(trimmed)) return false;
  return true;
}

function evidenceCoversGap(value: string): boolean {
  if (!registeredName(value)) return false;
  return !/\b(not found|no comparable|none|missing|unfilled|gap|does not|do not|don't)\b/i.test(value);
}

/** A registered Partner's record covers a capability gap the scorecard could not. */
export function partnerCoversCapabilityGap(assessment: RfpGoNoGoAssessment): boolean {
  if (assessment.teaming.some(row => evidenceCoversGap(row.registeredPartner))) return true;
  return assessment.issuerCriteria.some(row => evidenceCoversGap(row.teamEvidence));
}

function primeOwner(assessment: RfpGoNoGoAssessment): string {
  const decisionGap = assessment.gapLog.find(row => /go\/no-go|decision/i.test(row.item));
  if (decisionGap?.owner.trim()) return decisionGap.owner.trim();
  const named = assessment.recommendation.conditions.find(row => row.owner.trim() && !/^prime$/i.test(row.owner.trim()));
  if (named) return named.owner.trim();
  return assessment.gapLog.find(row => row.owner.trim())?.owner.trim() || "Prime";
}

function scorecardMath(rows: RfpGoNoGoAssessment["scorecard"]): { score: number; scoreMath: string; rows: RfpGoNoGoAssessment["scorecard"] } {
  const weightTotal = round2(rows.reduce((sum, row) => sum + row.weight, 0));
  const normalize = weightTotal > 0 && (weightTotal < 0.95 || weightTotal > 1.05);
  const used = normalize
    ? rows.map(row => ({ ...row, weight: row.weight / weightTotal }))
    : rows;
  const weighted = round2(used.reduce((sum, row) => sum + row.score * row.weight, 0));
  const score = Math.min(100, Math.max(0, Math.round(weighted * 20)));
  const parts = used.map(row => `(${row.score}x${formatWeight(row.weight)})`).join("+");
  const prefix = normalize ? `weights normalized from ${weightTotal.toFixed(2)}; ` : "";
  return {
    score,
    scoreMath: `${prefix}${parts} = ${weighted.toFixed(2)}; x20 = ${score}`,
    rows: used,
  };
}

function confidenceFor(assumed: number): RfpGoNoGoAssessment["recommendation"]["confidence"] {
  if (assumed <= 1) return "High";
  if (assumed <= 3) return "Medium";
  return "Low";
}

export function recFromDecision(decision: GoNoGoDecisionLabel): "go" | "nogo" | "cond" {
  if (decision === "Go") return "go";
  if (decision === "No-Go") return "nogo";
  return "cond";
}

function decide(input: {
  score: number;
  gates: RfpGoNoGoAssessment["gates"];
  capabilityScore: number | undefined;
  capabilityCovered: boolean;
  contractRiskScore: number | undefined;
}): GoNoGoDecisionLabel {
  const failed = input.gates.some(gate => gate.status === "Fail");
  const open = input.gates.some(gate => gate.status === "Curable" || gate.status === "Unknown");
  const allPass = input.gates.every(gate => gate.status === "Pass");
  if (failed) return "No-Go";
  if (input.capabilityScore === 1 && !input.capabilityCovered) return "No-Go";
  if (input.score < GONOGO_CONDITIONAL_SCORE) return "No-Go";
  if (input.score >= GONOGO_GO_SCORE && allPass && input.contractRiskScore !== 1) return "Go";
  if (input.score >= GONOGO_CONDITIONAL_SCORE || open || input.contractRiskScore === 1) return "Conditional Go";
  return "No-Go";
}

function withLegalCondition(recommendation: GoNoGoRecommendation, owner: string): GoNoGoRecommendation {
  if (recommendation.conditions.some(row => /legal|executive/i.test(row.condition))) return recommendation;
  return {
    ...recommendation,
    conditions: [
      {
        condition: "Legal and executive approval of the contract and delivery terms",
        owner,
        by: recommendation.decideBy,
      },
      ...recommendation.conditions,
    ],
  };
}

function conditionsFor(decision: GoNoGoDecisionLabel, recommendation: GoNoGoRecommendation, assessment: RfpGoNoGoAssessment): GoNoGoRecommendation["conditions"] {
  if (decision !== "Conditional Go") return [];
  if (recommendation.conditions.length) return recommendation.conditions;
  const owner = primeOwner(assessment);
  return assessment.gates
    .filter(gate => gate.status === "Curable" || gate.status === "Unknown")
    .map(gate => ({
      condition: gate.action || gate.requirement || gate.gate,
      owner,
      by: recommendation.decideBy,
    }))
    .filter(row => row.condition.trim().length > 0);
}

function enforceRecommendation(
  assessment: RfpGoNoGoAssessment,
  recommendation: GoNoGoRecommendation,
  gates: RfpGoNoGoAssessment["gates"],
  scorecard: RfpGoNoGoAssessment["scorecard"],
): { recommendation: GoNoGoRecommendation; scorecard: RfpGoNoGoAssessment["scorecard"]; adjustments: string[] } {
  const math = scorecardMath(scorecard);
  const capability = math.rows.find(row => isCapabilityFactor(row.factor));
  const contractRisk = math.rows.find(row => isContractRiskFactor(row.factor));
  const decision = decide({
    score: math.score,
    gates,
    capabilityScore: capability?.score,
    capabilityCovered: partnerCoversCapabilityGap(assessment),
    contractRiskScore: contractRisk?.score,
  });
  const assumed = math.rows.filter(row => row.basis === "assumed").length;
  const confidence = confidenceFor(assumed);
  let next: GoNoGoRecommendation = {
    ...recommendation,
    decision,
    score: math.score,
    scoreMath: math.scoreMath,
    confidence,
    conditions: conditionsFor(decision, recommendation, assessment),
  };
  if (decision === "Conditional Go" && contractRisk?.score === 1) {
    next = withLegalCondition(next, primeOwner(assessment));
  }
  const adjustments: string[] = [];
  if (recommendation.decision !== decision) {
    adjustments.push(`Decision set to ${decision} from the scorecard and gates.`);
  }
  if (recommendation.score !== math.score) {
    adjustments.push(`Score set to ${math.score} so it matches the weighted factor scores.`);
  }
  if (recommendation.confidence !== confidence) {
    adjustments.push(`Confidence set to ${confidence} from ${assumed} assumed factor${assumed === 1 ? "" : "s"}.`);
  }
  return { recommendation: next, scorecard: math.rows, adjustments };
}

/** Recompute score, decision, and confidence. Lot recommendations follow the same rules. */
export function enforceGoNoGoRules(assessment: RfpGoNoGoAssessment): EnforcedGoNoGo {
  const top = enforceRecommendation(assessment, assessment.recommendation, assessment.gates, assessment.scorecard);
  const lotAssessments = assessment.lotAssessments.map(lot => {
    const enforced = enforceRecommendation(
      { ...assessment, teaming: assessment.teaming, issuerCriteria: lot.issuerCriteria },
      lot.recommendation,
      lot.gates,
      lot.scorecard,
    );
    return { ...lot, recommendation: enforced.recommendation, scorecard: enforced.scorecard };
  });
  const adjustments = [...top.adjustments, ...assessment.adjustments.filter(item => !top.adjustments.includes(item))];
  return {
    assessment: {
      ...assessment,
      recommendation: top.recommendation,
      scorecard: top.scorecard,
      lotAssessments,
      adjustments,
    },
    rec: recFromDecision(top.recommendation.decision),
    adjustments,
  };
}

function rationaleLines(assessment: RfpGoNoGoAssessment): string[] {
  const sentences = assessment.recommendation.rationale
    .split(/(?<=[.!?])\s+/)
    .map(line => line.trim())
    .filter(Boolean);
  const lines = sentences.length ? sentences : [assessment.recommendation.rationale];
  if (assessment.recommendation.upside) lines.push(`Upside: ${assessment.recommendation.upside}`);
  return lines;
}

export function confidencePercent(confidence: RfpGoNoGoAssessment["recommendation"]["confidence"]): number {
  return { High: 85, Medium: 60, Low: 35 }[confidence];
}

export interface GoNoGoFields {
  assessment: RfpGoNoGoAssessment;
  score: number;
  rec: "go" | "nogo" | "cond";
  confidence: number;
  confidenceNote: string;
  rationale: string[];
  recRule: string;
}

export function goNoGoFields(enforced: EnforcedGoNoGo): GoNoGoFields {
  const { assessment, rec } = enforced;
  const assumed = assessment.scorecard.filter(row => row.basis === "assumed").length;
  return {
    assessment,
    score: assessment.recommendation.score,
    rec,
    confidence: confidencePercent(assessment.recommendation.confidence),
    confidenceNote: `${assessment.recommendation.confidence} confidence: ${assumed} of ${assessment.scorecard.length} scorecard factors are assumed. The bid team makes the final decision.`,
    rationale: rationaleLines(assessment),
    recRule: `${assessment.recommendation.decision} (${assessment.recommendation.score}/100). ${assessment.recommendation.scoreMath}`,
  };
}

/** Overlay a coverage triage with the enforced Go/No-Go recommendation. */
export function applyGoNoGoToTriage(triage: PursuitTriageView, enforced: EnforcedGoNoGo): PursuitTriageView {
  const fields = goNoGoFields(enforced);
  return {
    ...triage,
    score: fields.score,
    rec: fields.rec,
    confidence: fields.confidence,
    confidenceNote: fields.confidenceNote,
    rationale: fields.rationale,
    status: "Go/No-Go assessment complete",
    decisionAction: "Go/No-Go assessment generated from the RFP package, awaiting human confirmation",
    scoreBreakdown: triage.scoreBreakdown
      ? { ...triage.scoreBreakdown, recRule: fields.recRule }
      : undefined,
  };
}
