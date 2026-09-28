import { describe, expect, it } from "vitest";
import { extractSolicitationHeuristic, mergeSolicitationExtractions } from "./pursuit-triage";
import { inferRfiServices, mergeRfiSummaries, themeRfiChallenges } from "./rfi-summary";

const claimsRfi = `STATE OF CALIFORNIA
VICTIM COMPENSATION BOARD
REQUEST FOR INFORMATION (RFI) 26-001
COMPENSATION AND RESTITUTION SYSTEM MODERNIZATION

This RFI is issued for information and planning purposes only. The Board is conducting market research to gather information from vendors.

SECTION 1. INTRODUCTION AND OVERVIEW

A. Purpose
The Board is seeking information regarding solutions that could replace its current Compensation and Restitution System (CaRes). The Board is interested in learning whether a COTS, MOTS, configurable COTS, or a custom-developed solution best meets its needs. Vendors are asked to complete Attachment 1, Response Worksheet.

B. Background
The Board provides financial assistance to victims of violent crime for medical bills, mental health treatment, and lost income. Benefits may be paid over the life of the claimant, subject to lifetime limits. The Board works with county offices throughout the state and partners with a third-party bill adjudication vendor, the Department of Justice, law enforcement agencies, and the courts. Payments are issued as state warrants. CaRes supports approximately 300 users.

C. Project Vision
The Board envisions a single, highly configurable system that manages the full lifecycle of claims, compensation, and restitution, including a rules engine for automatic payment, appeals, and correspondence. The solution should provide self-service for claimants and providers.

D. Current Challenges
1. Any change to system functionality requires code changes and can take months to implement.
2. There is no adjustments module to process returned funds; staff track adjustments in external spreadsheets.
3. There is no appeals workflow; appeals are tracked manually outside the system.
4. The system does not track which user performed which action at each stage of a claim.
5. The online application is not integrated with CaRes and must be re-keyed.
6. Reports are hard coded, and new reports require developer time.
These limitations result in increased phone calls and escalations, limited visibility into claim status, slower approvals and payments, and manual recordkeeping.

E. Standards
Solutions must comply with the security and accessibility standards listed in Attachment 2. Any contract will be subject to the Cloud Computing Special Provisions or the Non-Cloud General Provisions.

F. Cost Information
The Board requests a non-binding estimated cost model and budgetary range.

G. Demonstrations
The Board may invite selected respondents to provide a solution demonstration in October 2026.

SECTION 2. RESPONSE INSTRUCTIONS
Responses must not exceed 20 pages. Use 12-point font with one-inch margins. Submit responses in PDF format by email.`;

describe("heuristic RFI scope summary", () => {
  const extraction = extractSolicitationHeuristic(claimsRfi, "rfi-26-001.txt", "rfi");
  const summary = extraction.rfiSummary!;

  it("builds a structured summary for RFIs only", () => {
    expect(summary).toBeDefined();
    expect(extractSolicitationHeuristic(claimsRfi, "rfp.txt", "rfp").rfiSummary).toBeUndefined();
  });

  it("classifies the work and captures the procurement objective separately", () => {
    expect(summary.workType).not.toBe("other");
    expect(summary.procurementObjective).toMatch(/COTS|custom/);
  });

  it("groups challenges into themes and names a root cause and consequences", () => {
    expect(summary.challengeThemes.length).toBeGreaterThan(1);
    expect(summary.challengeThemes.length).toBeLessThan(extraction.challenges.length);
    expect(summary.challengeThemes.filter(theme => theme.rootCause)).toHaveLength(1);
    expect(summary.challengeThemes.find(theme => theme.rootCause)?.theme).toBe("Agility and change cost");
    expect(summary.consequences.join(" ")).toMatch(/phone calls/i);
    expect(summary.consequences.join(" ")).toMatch(/slower approvals/i);
  });

  it("describes a target end state and constraints, not the RFI response", () => {
    expect(summary.endState).toMatch(/configurable system/i);
    expect(summary.endStateConstraints.join(" ")).toMatch(/cloud|standards/i);
    expect(summary.nextStep).toMatch(/demonstration/i);
  });

  it("infers services with evidence and confidence, and never presents them as explicit without a question", () => {
    const byName = new Map(summary.services.map(item => [item.service, item]));
    const migration = byName.get("Data migration and conversion");
    expect(migration?.type).toBe("inferred");
    expect(migration?.confidence).toBe("High");
    expect(byName.get("Integration and interfaces")?.evidence).toMatch(/Department of Justice|courts|vendor|warrants/i);
    expect(byName.get("Business process analysis and redesign")).toBeDefined();
    for (const item of summary.services.filter(service => service.type === "inferred")) {
      expect(item.evidence.length).toBeGreaterThan(0);
      expect(item.confidence).toBeDefined();
    }
  });

  it("flags missing attachments and unstated volumes as gaps", () => {
    expect(summary.gaps.some(gap => /Attachment 1/.test(gap))).toBe(true);
    expect(summary.gaps.some(gap => /Attachment 2/.test(gap))).toBe(true);
    expect(summary.gaps.some(gap => /Volumes/.test(gap))).toBe(true);
  });

  it("keeps response instructions separate from the scope summary", () => {
    expect(extraction.responseConstraints.join(" ")).toMatch(/20 pages|12-point/);
    expect(summary.endStateConstraints.join(" ")).not.toMatch(/12-point|20 pages/);
  });
});

describe("RFI services", () => {
  it("marks a service explicit when the issuer asks about it", () => {
    const services = inferRfiServices(
      "The agency plans to replace its legacy licensing system with a configurable platform.",
      ["Describe your approach to migrating 20 years of license records from the legacy system."],
    );
    const migration = services.find(item => item.service === "Data migration and conversion");
    expect(migration?.type).toBe("explicit");
    expect(migration?.evidence).toMatch(/migrating 20 years/);
  });

  it("does not force technical services onto a consulting-only RFI", () => {
    const services = inferRfiServices(
      "The department seeks a consultant to assess current operations and define a five-year roadmap and business case to secure funding. Governance and decision rights are unclear.",
    );
    expect(services.some(item => item.service === "Strategic planning and roadmap")).toBe(true);
    expect(services.some(item => item.service === "Business case and cost-benefit analysis")).toBe(true);
    expect(services.some(item => item.service === "Hosting and infrastructure")).toBe(false);
  });
});

describe("challenge themes", () => {
  it("keeps item references so a reviewer can trace each theme", () => {
    const themes = themeRfiChallenges([
      "Changes require code changes and take months.",
      "Appeals are tracked manually outside the system.",
      "Reports are hard coded.",
    ]);
    expect(themes[0]).toMatchObject({ theme: "Agility and change cost", rootCause: true, evidence: "Items 1, 3" });
    expect(themes.find(theme => theme.theme === "Manual workarounds")?.evidence).toBe("Item 2");
  });
});

describe("merging model and heuristic summaries", () => {
  const heuristic = extractSolicitationHeuristic(claimsRfi, "rfi.txt", "rfi");
  const modelOverlay = {
    objective: ["Replace CaRes with a configurable claims platform so victims are paid faster."],
    rfiSummary: {
      workType: "technical" as const,
      procurementObjective: "Decide between COTS, MOTS, and custom (§1.A).",
      challengeThemes: [],
      consequences: [],
      endState: "",
      endStateConstraints: [],
      nextStep: "",
      services: [{ service: "Solution demonstration", type: "explicit" as const, evidence: "§1.G", confidence: undefined }],
      gaps: [],
      issuerQuestions: [],
    },
  };

  it("prefers the model and fills empty fields from the heuristic", () => {
    const merged = mergeSolicitationExtractions(heuristic, modelOverlay);
    expect(merged.rfiSummary?.procurementObjective).toBe("Decide between COTS, MOTS, and custom (§1.A).");
    expect(merged.rfiSummary?.services).toHaveLength(1);
    expect(merged.rfiSummary?.challengeThemes.length).toBeGreaterThan(0);
    expect(merged.rfiSummary?.endState).toMatch(/configurable/);
    expect(mergeRfiSummaries(undefined, heuristic.rfiSummary)).toBe(heuristic.rfiSummary);
  });

  it("keeps the model's scope fields as returned when the model wrote the summary", () => {
    const merged = mergeSolicitationExtractions(heuristic, modelOverlay, { trustOverlayScope: true });
    expect(merged.objective).toEqual(modelOverlay.objective);
    expect(merged.challenges).toEqual([]);
    expect(merged.rfiSummary?.challengeThemes).toEqual([]);
    expect(merged.rfiSummary?.endState).toBe("");
    expect(merged.requirements).toEqual(heuristic.requirements);
  });
});
