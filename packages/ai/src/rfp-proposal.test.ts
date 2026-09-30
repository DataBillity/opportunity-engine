import { describe, expect, it } from "vitest";
import { parseRfpProposal, parseRfpProposalPart } from "@opportunity-engine/contracts";
import { buildRfpProposalUserPrompt } from "./rfp-proposal";
import { RFP_DRAFTING_PROMPT } from "./rfp-proposal-prompt";

describe("RFP drafting prompt", () => {
  it("carries the proposal-writer instructions", () => {
    expect(RFP_DRAFTING_PROMPT).toContain("You are a senior proposal writer");
    expect(RFP_DRAFTING_PROMPT).toContain("Priorities, in order: compliant, responsive to every criterion, persuasive.");
    expect(RFP_DRAFTING_PROMPT).toContain("**[GAP-### | Owner | Description]**");
    expect(RFP_DRAFTING_PROMPT).toContain("Return ONLY JSON matching the schema.");
  });

  it("includes a worked example the proposal schema accepts", () => {
    const start = RFP_DRAFTING_PROMPT.indexOf("{\n  \"structure\"");
    const end = RFP_DRAFTING_PROMPT.indexOf("\n}\n\n=== OUTPUT ===");
    const parsed = parseRfpProposal(JSON.parse(RFP_DRAFTING_PROMPT.slice(start, end + 2)));
    expect(parsed?.structure.basis).toBe("prescribed");
    expect(parsed?.structure.volumes[0]?.sectionIds).toHaveLength(11);
    expect(parsed?.sections.map(section => [section.id, section.pageBudget])).toEqual([["1b", 6], ["3a", 5]]);
    expect(parsed?.sections[1]?.content).toContain("### (ii) Top five risks and challenges\n\n");
    expect(parsed?.forms.map(form => form.form)).toEqual(["Proposal Form 3", "Proposal Form 6", "Proposal Form 1B"]);
    expect(parsed?.forms[1]?.completedBy).toEqual(["Summit Tech", "Bay Analytics"]);
    expect(parsed?.gapLog.map(gap => gap.type)).toEqual(["missing_information", "signature", "decision_needed"]);
    expect(parsed?.consistencyChecks.map(check => check.result)).toEqual(["pending", "pending", "pass"]);
    expect(parsed?.issuerQuestions[0]?.type).toBe("ambiguity");
  });
});

describe("parseRfpProposalPart", () => {
  it("reads a partial reply and normalizes loose values", () => {
    const part = parseRfpProposalPart({
      proposal: {
        sections: [{ title: "Technical Approach", pageBudget: "Outside budget (assumed)", content: "Text" }],
        gapLog: [{ id: "gap 7", description: "Rates", type: "Decision Needed", priority: "high" }, { description: "" }],
      },
    });
    expect(part.sections[0]).toMatchObject({ id: "technical-approach", heading: "Technical Approach", pageBudget: null });
    expect(part.gapLog).toEqual([expect.objectContaining({ id: "GAP-007", type: "decision_needed", priority: "High" })]);
    expect(part.forms).toEqual([]);
  });
});

describe("buildRfpProposalUserPrompt", () => {
  const sources = {
    documentText: "===== DOCUMENT: rfp.pdf =====\n§4.1 Technical Proposal.",
    documentNames: ["rfp.pdf"],
    primePartnerName: "Summit Tech",
    today: "2026-07-10",
  };

  it("asks the plan step for the plan fields only", () => {
    const prompt = buildRfpProposalUserPrompt({ step: "plan", sources, nextGapNumber: 4 });
    expect(prompt).toContain("Prime Partner (registered name): Summit Tech");
    expect(prompt).toContain("=== GO/NO-GO ASSESSMENT ===\nNone provided.");
    expect(prompt).toContain("Return JSON with only these fields: structure, winThemes, sections, submissionChecklist, issuerQuestions, gapLog.");
    expect(prompt).toContain("Number them from GAP-004.");
    expect(prompt).not.toContain("=== PROPOSAL PLAN ===");
  });

  it("gives the sections step the plan, its section ids, and drafts to revise", () => {
    const plan = parseRfpProposalPart({
      sections: [
        { id: "1a", heading: "1(a) Prior Experience", pageBudget: 3, brief: "Answer (i)-(iii)" },
        { id: "1b", heading: "1(b) Reference Projects", pageBudget: 6 },
      ],
    });
    const prompt = buildRfpProposalUserPrompt({
      step: "sections",
      sources,
      plan,
      sectionIds: ["1b"],
      existingDrafts: { "1b": "Earlier text", "1a": "Not requested" },
    });
    expect(prompt).toContain("=== PROPOSAL PLAN ===");
    expect(prompt).toContain("\"brief\": \"Answer (i)-(iii)\"");
    expect(prompt).toContain("- 1b: 1(b) Reference Projects (6 pages)");
    expect(prompt).not.toContain("- 1a: 1(a) Prior Experience");
    expect(prompt).toContain("--- 1b ---\nEarlier text");
    expect(prompt).not.toContain("Not requested");
  });
});
