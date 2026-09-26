import { describe, expect, it } from "vitest";
import type { ResponseDraftBriefing } from "@opportunity-engine/contracts";
import { fallbackRfiPackage, reconcileRfiPackage } from "./rfi-response";

const briefing: ResponseDraftBriefing = {
  section: { id: "cover", name: "Cover letter", ref: "Cover" },
  sections: [
    { id: "cover", name: "Cover letter", ref: "Cover" },
    { id: "company", name: "Company and team overview", ref: "Company" },
    { id: "understanding", name: "Understanding of the requirement", ref: "Understanding" },
    { id: "questions", name: "Responses to specific questions", ref: "Questions" },
    { id: "experience", name: "Relevant experience", ref: "Experience" },
    { id: "recommendations", name: "Recommendations for the future solicitation", ref: "Recommendations" },
    { id: "contacts", name: "Points of contact", ref: "Contacts" },
  ],
  mode: "package",
  projectType: "rfi",
  existingGapIds: [],
  partners: [{ name: "Acme Analytics", role: "Subcontractor", covers: [], confirmed: false }],
  organization: { name: "Example Agency" },
  pursuit: {
    id: "OPP-1",
    name: "Claims platform RFI",
    typeLabel: "RFI",
    solicitationRef: "RFI-26-014",
    dueDate: "2026-10-15",
    documents: [],
    docSummary: {
      objective: ["Learn how vendors would replace the claims platform."],
      challenges: [],
      services: [],
      deliverables: [],
      responseConstraints: ["Responses are limited to 10 pages."],
    },
    informationRequests: ["Describe your approach to claims migration."],
    capabilities: [],
    mappedRequirements: ["Claims migration — CAP-0018"],
    unmappedRequirements: ["FedRAMP High authorization"],
    gaps: [],
    rationale: [],
  },
  people: [],
  experience: [],
};

describe("fallbackRfiPackage", () => {
  it("logs a placeholder for every gap and does not invent coverage", () => {
    const packet = fallbackRfiPackage(briefing);
    const prose = packet.sections.map(section => section.body).join("\n");
    expect(prose).not.toMatch(/world-class|CMMI Level|we will staff/i);
    expect(packet.gaps.length).toBeGreaterThan(0);
    for (const gap of packet.gaps) {
      expect(prose).toContain(`[${gap.id} |`);
    }
    expect(prose).toContain("Describe your approach to claims migration.");
    expect(packet.gaps.some(gap => gap.gapType === "capability_gap" && /FedRAMP High/.test(gap.description))).toBe(true);
    expect(packet.gaps.every(gap => gap.owner === "Prime")).toBe(true);
    expect(packet.reviewerSummary).toMatch(/Do not submit/);
  });
});

describe("reconcileRfiPackage", () => {
  it("adds a gap row for a placeholder the model left out of the log", () => {
    const packet = reconcileRfiPackage({
      reviewerSummary: "Due 2026-10-15. Fit is partial.",
      sections: [{
        id: "questions",
        ref: "Q1",
        title: "Responses to specific questions",
        body: "We would propose a phased migration.\n\n[GAP-004 | Prime | Confirm the migration window]",
      }],
      compliance: [],
      gaps: [],
      questions: [],
      strategicNotes: "",
      usedInsightIds: [],
    }, "2026-10-12");
    expect(packet.gaps).toEqual([
      expect.objectContaining({ id: "GAP-004", owner: "Prime", description: "Confirm the migration window" }),
    ]);
  });
});
