import { describe, expect, it } from "vitest";
import { extractSolicitationHeuristic, sanitizeRfiObjective, scorePursuitTriage } from "./pursuit-triage";
import { isRfiDocument, recDecisionLabel, resolveProjectType } from "./project-type";
import type { SolicitationExtraction } from "@opportunity-engine/contracts";

const infoRequests: SolicitationExtraction["requirements"] = [
  { requirementText: "Provide information on your organizational structure and years in business.", passFail: false },
  { requirementText: "Provide information on staffing levels and geographic coverage for this work.", passFail: false },
  { requirementText: "Provide information on your approach to data platform modernization.", passFail: false },
  { requirementText: "Provide information on points of contact and the preferred follow-up process.", passFail: false },
  { requirementText: "Provide information on relevant public-sector experience from the last five years.", passFail: false },
  { requirementText: "Provide information on how you would staff a subsequent implementation phase.", passFail: false },
  { requirementText: "Provide information on partnership models you use with other vendors.", passFail: false },
];

const overlapText = [
  "Request for Information from a government agency.",
  "This RFI seeks information only and will not result in an award.",
  "The agency is exploring a multi-year phased modernization of its customer data platform,",
  "including AI agents, personalization, consent-first identity, and analytics dashboards.",
  "Board-approved budget is funded for discovery. Responses due October 15, 2026.",
].join(" ");

const rfpOverlapText = [
  "Request for Proposal from a government agency.",
  "The contractor shall deliver a multi-year phased modernization of the customer data platform,",
  "including AI agents, personalization, consent-first identity, and analytics dashboards.",
  "Board-approved budget is funded. Proposals due October 15, 2026.",
].join(" ");

const org = {
  name: "Example Transit Authority",
  industry: "Public Transit",
  channel: "inbound_rfi",
};

function emptyExtraction(requirements = infoRequests): SolicitationExtraction {
  return {
    inferredName: "Capability market scan",
    solicitationRef: "RFI-26-014",
    dueDate: "2026-10-15",
    issuer: "Example Transit Authority",
    objective: ["Gather vendor information ahead of a possible later solicitation."],
    challenges: ["The current customer data platform cannot support identity resolution or consent."],
    services: ["Customer data platform with identity resolution, personalization, consent, and analytics dashboards."],
    deliverables: [],
    requirements,
    responseSections: [],
    responseConstraints: ["Responses must be no more than 10 pages, single spaced in 12-point font."],
    constraints: [],
  };
}

const modernizationRfi = [
  "Introduction and Overview",
  "The California Victim Compensation Board (CalVCB) is issuing this Request for Information to conduct market research and gather information from vendors. This RFI is for planning purposes only and will not result in an award.",
  "Project Purpose and Background",
  "CalVCB intends to modernize its aging claims management system to replace the legacy mainframe application that supports victim compensation claims processing.",
  "Current Challenges",
  "1. The current system is a 25-year-old legacy platform that cannot support online claims intake.",
  "2. Manual adjudication workflows create backlogs and delay payments to victims.",
  "Project Vision",
  "The desired solution is a configurable, cloud-based claims platform with automated workflows, a claimant portal, and integrated payment processing.",
  "Response Instructions",
  "Responses must be no more than 10 pages, single spaced in 12-point font.",
].join("\n");

describe("extractSolicitationHeuristic", () => {
  it("uses the RFI response outline when the notice has no prescribed headings", () => {
    const extraction = extractSolicitationHeuristic(overlapText, "Agency_RFI_2026.pdf", "rfi");
    expect(extraction.responseSections.map(section => section.sectionId)).toEqual([
      "cover",
      "company",
      "understanding",
      "questions",
      "experience",
      "recommendations",
      "contacts",
    ]);
  });

  it("derives an end-objective for an RFI instead of restating 'gather information'", () => {
    const extraction = extractSolicitationHeuristic(modernizationRfi, "26-001_CalVCB_RFI.pdf", "rfi");
    const objectiveText = extraction.objective.join(" ").toLowerCase();
    expect(extraction.objective.length).toBeGreaterThan(0);
    expect(objectiveText).not.toMatch(/gather(ing)? information|market research|planning purposes|will not result in an award/);
    expect(objectiveText).toMatch(/moderniz|replace|claims|platform/);
  });

  it("still infers an objective when the RFI only frames itself as market research", () => {
    const extraction = extractSolicitationHeuristic(overlapText, "Agency_RFI_2026.pdf", "rfi");
    const objectiveText = extraction.objective.join(" ").toLowerCase();
    expect(extraction.objective.length).toBeGreaterThan(0);
    expect(objectiveText).not.toMatch(/^\s*(this rfi|gather|market research)/);
    expect(objectiveText).toMatch(/moderniz|data platform|customer data/);
  });
});

describe("sanitizeRfiObjective", () => {
  it("drops pure market-research boilerplate but keeps substantive scope", () => {
    const cleaned = sanitizeRfiObjective([
      "The purpose of this RFI is to gather information from the vendor community.",
      "This is market research for planning purposes only.",
      "The agency intends to modernize its legacy claims management system.",
    ]);
    expect(cleaned).toEqual([
      "The agency intends to modernize its legacy claims management system.",
    ]);
  });

  it("keeps a blended sentence that pairs the research framing with real scope", () => {
    const cleaned = sanitizeRfiObjective([
      "The agency is conducting market research to inform a modernization of its payment platform.",
    ]);
    expect(cleaned).toHaveLength(1);
  });
});

describe("resolveProjectType", () => {
  it("overrides an RFP selection when the document is an RFI", () => {
    const resolved = resolveProjectType({
      selected: "rfp",
      lane: "B",
      text: overlapText,
      filename: "Agency_RFI_2026.pdf",
    });
    expect(resolved.projectType).toBe("rfi");
    expect(resolved.overridden).toBe(true);
    expect(isRfiDocument(overlapText, "Agency_RFI_2026.pdf")).toBe(true);
  });
});

describe("scorePursuitTriage", () => {
  it("does not give an RFP an inflated Go-looking score when 0 of 7 requirements map", () => {
    const result = scorePursuitTriage({
      extraction: emptyExtraction(),
      sourceText: rfpOverlapText,
      lane: "B",
      projectType: "rfp",
      filename: "Agency_RFP_2026.pdf",
      org,
      provider: "claude",
      modelVersion: "test",
    });

    expect(result.scoreBreakdown?.mappedCount).toBe(0);
    expect(result.scoreBreakdown?.totalRequirements).toBe(7);
    expect(result.scoreBreakdown?.documentOverlapCount).toBeGreaterThan(0);
    expect(result.rec).toBe("nogo");
    expect(result.score).toBeLessThan(75);
    expect(result.confidence).toBe(50);
    expect(result.rationale.some(line => /overlap/i.test(line))).toBe(true);
    expect(result.rationale.some(line => /not a Go cutoff/i.test(line))).toBe(true);
  });

  it("treats an RFI as Respond/Pass on topical fit, not as a bid that already provided information", () => {
    const result = scorePursuitTriage({
      extraction: emptyExtraction(),
      sourceText: overlapText,
      lane: "B",
      projectType: "rfi",
      filename: "Agency_RFI_2026.pdf",
      org,
      provider: "claude",
      modelVersion: "test",
    });

    expect(result.projectType).toBe("rfi");
    expect(result.rec).not.toBe("nogo");
    expect(recDecisionLabel(result.rec, "rfi")).toMatch(/Respond/);
    expect(result.reqmap.every(row => /scope topic|page limits/i.test(row.evidence))).toBe(true);
    expect(result.rationale.some(line => /RFI lens/i.test(line))).toBe(true);
    expect(result.confidenceNote).toMatch(/not the opportunity score/i);
  });

  it("auto-detects an RFI uploaded as an RFP", () => {
    const result = scorePursuitTriage({
      extraction: emptyExtraction(),
      sourceText: overlapText,
      lane: "B",
      projectType: "rfp",
      filename: "Agency_RFI_2026.pdf",
      org,
      provider: "claude",
      modelVersion: "test",
    });
    expect(result.projectType).toBe("rfi");
    expect(result.scoreBreakdown?.typeOverridden).toBe(true);
    expect(result.rationale[0]).toMatch(/reads as an RFI/i);
  });

  it("recommends Go only when bid coverage and score both clear the 75% / 68 gates", () => {
    const mappedReqs = [
      { requirementText: "The contractor shall implement a customer data platform with identity resolution.", passFail: false },
      { requirementText: "The contractor shall deliver a hyper-personalized recommendation engine.", passFail: false },
      { requirementText: "The contractor shall operate a consent-first preference center and clean room.", passFail: false },
      { requirementText: "The contractor shall provide analytics dashboards in Tableau or Power BI.", passFail: false },
    ];
    const text = [
      "Request for Proposal. Funded multi-year government modernization.",
      "Customer data platform, identity resolution, personalization, consent, and Power BI analytics are required.",
    ].join(" ");
    const result = scorePursuitTriage({
      extraction: emptyExtraction(mappedReqs),
      sourceText: text,
      lane: "B",
      projectType: "rfp",
      filename: "rfp.txt",
      org,
      provider: "claude",
      modelVersion: "test",
    });
    expect(result.scoreBreakdown?.coveragePct).toBeGreaterThanOrEqual(75);
    expect(result.score).toBeGreaterThanOrEqual(68);
    expect(result.rec).toBe("go");
  });
});
