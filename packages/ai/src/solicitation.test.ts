import { describe, expect, it } from "vitest";
import { buildSolicitationExtractPrompt, parseExtraction } from "./solicitation";

describe("RFI extraction parsing", () => {
  it("normalizes the model's RFI summary and drops rows it can't use", () => {
    const extraction = parseExtraction({
      objective: ["Replace CaRes with a configurable claims platform (§1.C)."],
      services: ["Complete Attachment 1, Response Worksheet (§1.A)", "Provide a non-binding cost model (§1.F)"],
      rfiSummary: {
        workType: "Both technical and consulting",
        objectiveConfidence: "high",
        procurementObjective: null,
        challengeThemes: [
          { theme: "Agility", detail: "Changes require code (items 1, 4).", rootCause: "true", evidence: "§1.D" },
          { theme: "", detail: "no theme" },
        ],
        consequences: ["More calls", null, ""],
        services: [
          { service: "Complete Response Worksheet (Attachment 1)", type: "explicit", evidence: "§1.A" },
          { service: "Solution demonstration", type: "Explicit", evidence: "§1.G", confidence: "" },
          { service: "Data migration from CaRes", type: "inferred", evidence: "Lifetime balances", confidence: "HIGH" },
          { service: "", type: "inferred" },
          null,
        ],
        gaps: ["Attachment 1 missing"],
      },
    });

    expect(extraction.services).toEqual(["Provide a non-binding cost model (§1.F)"]);
    const summary = extraction.rfiSummary!;
    expect(summary.workType).toBe("both");
    expect(summary.objectiveConfidence).toBe("High");
    expect(summary.procurementObjective).toBe("");
    expect(summary.challengeThemes).toHaveLength(1);
    expect(summary.challengeThemes[0]?.rootCause).toBe(true);
    expect(summary.consequences).toEqual(["More calls"]);
    expect(summary.services.map(item => [item.type, item.confidence])).toEqual([["explicit", undefined], ["inferred", "High"]]);
  });

  it("keeps the rest of the extraction when the RFI summary is unusable", () => {
    const extraction = parseExtraction({
      objective: ["Modernize permitting."],
      rfiSummary: "not an object",
    });
    expect(extraction.objective).toEqual(["Modernize permitting."]);
    expect(extraction.rfiSummary).toBeUndefined();
  });

  it("asks RFIs for the structured summary and leaves RFPs unchanged", () => {
    const base = { filename: "doc.txt", lane: "B" as const, organizationName: "Agency", documentText: "text" };
    expect(buildSolicitationExtractPrompt({ ...base, projectType: "rfi" })).toContain("rfiSummary");
    expect(buildSolicitationExtractPrompt({ ...base, projectType: "rfp" })).not.toContain("rfiSummary");
  });
});
