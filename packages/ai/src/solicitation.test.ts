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

  it("reads the summary prompt's output shape: issuer questions, named service rows, and string sections", () => {
    const extraction = parseExtraction({
      objective: ["Replace CaRes (§1.C)."],
      rfiSummary: {
        workType: "technical",
        services: [{ name: "Solution demonstration", type: "explicit", evidence: "§1.G", confidence: "" }],
        gaps: [],
      },
      issuerQuestions: [
        { question: "May respondents include a cover letter?", basis: "§1.F vs. Q49", evidence: "§1.F; Att. 3 Q49", type: "Conflict", priority: "high", timing: "At demonstration or future solicitation" },
        { question: "", basis: "empty" },
      ],
      responseSections: ["Part I: Company Information and Experience", "Part II: Solution", { ref: "Part III", title: "Integration", sectionId: "part-3" }],
    });

    expect(extraction.rfiSummary?.services[0]?.service).toBe("Solution demonstration");
    expect(extraction.rfiSummary?.issuerQuestions).toEqual([{
      question: "May respondents include a cover letter?",
      basis: "§1.F vs. Q49",
      evidence: "§1.F; Att. 3 Q49",
      type: "conflict",
      priority: "High",
      timing: "At demonstration or future solicitation",
    }]);
    expect(extraction.responseSections).toEqual([
      { ref: "Part I", title: "Company Information and Experience", sectionId: "part-i" },
      { ref: "Part II", title: "Solution", sectionId: "part-ii" },
      { ref: "Part III", title: "Integration", sectionId: "part-3" },
    ]);
  });

  it("lists every uploaded file in the request", () => {
    const prompt = buildSolicitationExtractPrompt({
      filename: "rfi.pdf", lane: "B", projectType: "rfi", organizationName: "CalVCB", documentText: "text",
      documentNames: ["rfi.pdf", "Attachment_1.docx"],
    });
    expect(prompt).toContain("Documents in this package: rfi.pdf; Attachment_1.docx");
    expect(prompt).toContain("issuerQuestions");
  });

  it("asks every project type for the structured summary, with RFP and SOW fields", () => {
    const base = { filename: "doc.txt", lane: "B" as const, organizationName: "Agency", documentText: "text" };
    const rfi = buildSolicitationExtractPrompt({ ...base, projectType: "rfi" });
    const rfp = buildSolicitationExtractPrompt({ ...base, projectType: "rfp" });
    const sow = buildSolicitationExtractPrompt({ ...base, projectType: "sow" });
    expect(rfi).toContain("rfiSummary");
    expect(rfi).not.toContain("evaluationCriteria");
    for (const prompt of [rfp, sow]) {
      expect(prompt).toContain("rfiSummary");
      expect(prompt).toContain("issuerQuestions");
      expect(prompt).toContain("evaluationCriteria");
      expect(prompt).toContain("commercialTerms");
    }
    expect(buildSolicitationExtractPrompt({ ...base, projectType: "rfp", pass: "structure" })).toContain("shall or must statement");
  });

  it("keeps evaluation criteria and commercial terms from an RFP or SOW summary", () => {
    const extraction = parseExtraction({
      objective: ["Replace the permitting system (§C.1)."],
      rfiSummary: {
        workType: "technical",
        services: [],
        gaps: [],
        evaluationCriteria: ["Technical approach, 40 points (M.2)", "", null],
        commercialTerms: ["Liquidated damages of $1,000 per day (§H.4)"],
      },
    });
    expect(extraction.rfiSummary?.evaluationCriteria).toEqual(["Technical approach, 40 points (M.2)"]);
    expect(extraction.rfiSummary?.commercialTerms).toEqual(["Liquidated damages of $1,000 per day (§H.4)"]);
  });
});
