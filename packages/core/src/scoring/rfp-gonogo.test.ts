import { describe, expect, it } from "vitest";
import { parseRfpGoNoGo } from "@opportunity-engine/contracts";
import { enforceGoNoGoRules, partnerCoversCapabilityGap } from "./rfp-gonogo";

const scorecard = [
  { factor: "Strategic fit", weight: 0.15, score: 4, evidence: "Core data platform work", basis: "RFP" },
  { factor: "Capability and past performance", weight: 0.25, score: 3, evidence: "Assumes comparable work", basis: "assumed" },
  { factor: "Competitive position", weight: 0.15, score: 2, evidence: "No relationship shown", basis: "assumed" },
  { factor: "Staffing and Partner readiness", weight: 0.1, score: 3, evidence: "Partners not identified", basis: "assumed" },
  { factor: "Commercial attractiveness", weight: 0.15, score: 3, evidence: "Modest scope", basis: "RFP" },
  { factor: "Contract and delivery risk", weight: 0.1, score: 2, evidence: "No liability cap", basis: "RFP" },
  { factor: "Proposal effort and feasibility", weight: 0.1, score: 3, evidence: "30 pages", basis: "RFP" },
];

function packet(overrides: Record<string, unknown> = {}) {
  return parseRfpGoNoGo({
    recommendation: {
      decision: "Go",
      score: 99,
      scoreMath: "unchecked",
      confidence: "High",
      rationale: "The work fits. The contract does not. Three factors are assumed.",
      conditions: [],
      decideBy: "2026-07-13",
      upside: "Clearing the contract would raise the score.",
    },
    opportunity: { issuer: "VTA", title: "Data warehouse", number: "S26027", objective: "Stand up a warehouse for VTA." },
    gates: [
      { gate: "Portal registration", requirement: "Register to propose", evidence: "§1.5", status: "Curable", action: "Register" },
      { gate: "SBE participation", requirement: "2.77% goal", evidence: "§2.6.2", status: "Unknown", action: "Identify an SBE" },
    ],
    scorecard,
    teaming: [{ need: "Certified SBE", whyItMatters: "Gate", evidence: "§2.6.2", registeredPartner: "None registered", action: "Find one" }],
    issuerCriteria: [{ criterion: "Qualifications", points: 30, whatWins: "Comparable work", teamEvidence: "Not found in sources", estimatedPoints: "15-22", howToImprove: "Add a reference" }],
    ...overrides,
  });
}

describe("RFP Go/No-Go rules", () => {
  it("scores the worked example and keeps Conditional Go when gates are open", () => {
    const parsed = packet();
    expect(parsed).not.toBeNull();
    const { assessment, rec } = enforceGoNoGoRules(parsed!);
    expect(assessment.recommendation.score).toBe(58);
    expect(assessment.recommendation.scoreMath).toBe("(4x.15)+(3x.25)+(2x.15)+(3x.10)+(3x.15)+(2x.10)+(3x.10) = 2.90; x20 = 58");
    expect(assessment.recommendation.decision).toBe("Conditional Go");
    expect(assessment.recommendation.confidence).toBe("Medium");
    expect(rec).toBe("cond");
    expect(assessment.recommendation.conditions.map(row => row.condition)).toEqual(["Register", "Identify an SBE"]);
    expect(assessment.adjustments.some(line => line.startsWith("Confidence set to Medium"))).toBe(true);
    expect(partnerCoversCapabilityGap(assessment)).toBe(false);
  });

  it("returns Go only at 70 or higher when every gate passes", () => {
    const parsed = packet({
      gates: [{ gate: "Portal", requirement: "Registered", evidence: "records", status: "Pass", action: "" }],
      scorecard: scorecard.map(row => ({ ...row, score: 4, basis: "sources" })),
      recommendation: {
        decision: "No-Go",
        score: 10,
        confidence: "Low",
        rationale: "Strong fit and every gate is already met.",
        conditions: [{ condition: "Leftover", owner: "Summit Tech", by: "2026-07-13" }],
        decideBy: "2026-07-13",
        upside: "",
      },
    });
    const { assessment, rec } = enforceGoNoGoRules(parsed!);
    expect(assessment.recommendation.score).toBe(80);
    expect(assessment.recommendation.decision).toBe("Go");
    expect(assessment.recommendation.confidence).toBe("High");
    expect(assessment.recommendation.conditions).toEqual([]);
    expect(rec).toBe("go");
  });

  it("makes any failed gate No-Go", () => {
    const parsed = packet({
      gates: [{ gate: "Vehicle", requirement: "Hold the IDIQ", evidence: "Section L", status: "Fail", action: "Cannot cure" }],
      scorecard: scorecard.map(row => ({ ...row, score: 5, basis: "RFP" })),
    });
    const { assessment, rec } = enforceGoNoGoRules(parsed!);
    expect(assessment.recommendation.score).toBe(100);
    expect(assessment.recommendation.decision).toBe("No-Go");
    expect(rec).toBe("nogo");
  });

  it("keeps a high score at Conditional Go while a gate is unknown", () => {
    const parsed = packet({
      gates: [{ gate: "Insurance", requirement: "Cyber $1M", evidence: "Ex. 9", status: "Unknown", action: "Confirm coverage" }],
      scorecard: scorecard.map(row => ({ ...row, score: 4, basis: "RFP" })),
    });
    expect(enforceGoNoGoRules(parsed!).assessment.recommendation.decision).toBe("Conditional Go");
  });

  it("is No-Go below 55 even when a gate is curable", () => {
    const parsed = packet({
      scorecard: scorecard.map(row => ({ ...row, score: 2, basis: "RFP" })),
    });
    const { assessment } = enforceGoNoGoRules(parsed!);
    expect(assessment.recommendation.score).toBe(40);
    expect(assessment.recommendation.decision).toBe("No-Go");
  });

  it("caps a contract-risk score of 1 at Conditional Go and requires approval", () => {
    const parsed = packet({
      gates: [{ gate: "Submission", requirement: "Portal only", evidence: "§2.12", status: "Pass", action: "" }],
      scorecard: scorecard.map(row => ({
        ...row,
        score: row.factor === "Contract and delivery risk" ? 1 : 5,
        basis: "RFP",
      })),
    });
    const { assessment } = enforceGoNoGoRules(parsed!);
    expect(assessment.recommendation.score).toBe(92);
    expect(assessment.recommendation.decision).toBe("Conditional Go");
    expect(assessment.recommendation.conditions[0]?.condition).toMatch(/Legal and executive approval/);
  });

  it("is No-Go when capability scores 1 and no registered Partner covers it", () => {
    const parsed = packet({
      gates: [{ gate: "Submission", requirement: "Portal only", evidence: "§2.12", status: "Pass", action: "" }],
      scorecard: scorecard.map(row => ({
        ...row,
        score: row.factor.startsWith("Capability") ? 1 : 5,
        basis: "sources",
      })),
    });
    expect(enforceGoNoGoRules(parsed!).assessment.recommendation.decision).toBe("No-Go");
  });

  it("lets a registered Partner cover a capability score of 1", () => {
    const parsed = packet({
      gates: [{ gate: "Submission", requirement: "Portal only", evidence: "§2.12", status: "Pass", action: "" }],
      scorecard: scorecard.map(row => ({
        ...row,
        score: row.factor.startsWith("Capability") ? 1 : 5,
        basis: "sources",
      })),
      teaming: [{ need: "Transit data", whyItMatters: "Qualifications", evidence: "§3.1.2", registeredPartner: "Harbor Analytics", action: "Confirm" }],
    });
    const enforced = enforceGoNoGoRules(parsed!);
    expect(partnerCoversCapabilityGap(enforced.assessment)).toBe(true);
    expect(enforced.assessment.recommendation.decision).toBe("Go");
  });

  it("normalizes percent weights and drops empty questions", () => {
    const parsed = parseRfpGoNoGo({
      recommendation: { rationale: "Enough to score.", decision: "conditional go" },
      scorecard: [{ factor: "Strategic fit", weight: "15%", score: "5", evidence: "Core", basis: "rfp" }],
      issuerQuestions: [{ question: "", basis: "empty" }, { question: "Which date applies?", type: "Conflict", priority: "high" }],
    });
    expect(parsed?.scorecard[0]?.weight).toBe(0.15);
    expect(parsed?.scorecard[0]?.basis).toBe("RFP");
    expect(parsed?.issuerQuestions).toHaveLength(1);
    expect(parsed?.issuerQuestions[0]?.type).toBe("conflict");
    expect(parsed?.opportunity.issuer).toBe("");
  });
});
