import { describe, expect, it } from "vitest";
import { parseRfpGoNoGo } from "@opportunity-engine/contracts";
import { buildRfpGoNoGoUserPrompt } from "./rfp-gonogo";
import { RFP_GONOGO_PROMPT } from "./rfp-gonogo-prompt";

describe("RFP Go/No-Go prompt", () => {
  it("carries the capture-manager instructions and the worked example", () => {
    expect(RFP_GONOGO_PROMPT).toContain("You are a senior capture manager");
    expect(RFP_GONOGO_PROMPT).toContain("Uniform Contract Format");
    expect(RFP_GONOGO_PROMPT).toContain("Score an unevidenced factor 2, not 3");
    expect(RFP_GONOGO_PROMPT).toContain("any Fail gate means No-Go");
    expect(RFP_GONOGO_PROMPT).toContain("Summit Tech");
    expect(RFP_GONOGO_PROMPT).toContain("lotAssessments");
    expect(RFP_GONOGO_PROMPT).toContain("Return ONLY JSON matching the schema.");
  });

  it("includes a worked example the assessment schema accepts", () => {
    const start = RFP_GONOGO_PROMPT.indexOf("{\n  \"recommendation\"");
    const end = RFP_GONOGO_PROMPT.indexOf("\n}\n\n=== OUTPUT ===");
    const parsed = parseRfpGoNoGo(JSON.parse(RFP_GONOGO_PROMPT.slice(start, end + 2)));
    expect(parsed?.recommendation.score).toBe(58);
    expect(parsed?.recommendation.decision).toBe("Conditional Go");
    expect(parsed?.scorecard).toHaveLength(7);
    expect(parsed?.gates.map(gate => gate.status)).toEqual(["Curable", "Unknown", "Unknown", "Unknown"]);
    expect(parsed?.issuerQuestions).toHaveLength(5);
    expect(parsed?.lotAssessments).toEqual([]);
  });

  it("names the Prime and leaves missing sources empty", () => {
    const prompt = buildRfpGoNoGoUserPrompt({
      documentText: "===== DOCUMENT: rfp.pdf =====\nSection M awards on best value.",
      documentNames: ["rfp.pdf", "sow.docx"],
      primePartnerName: "Summit Tech",
    });
    expect(prompt).toContain("Files: rfp.pdf; sow.docx");
    expect(prompt).toContain("Prime Partner (registered name): Summit Tech");
    expect(prompt).toContain("=== PARTNER RECORDS ===\nNone provided.");
    expect(prompt).toContain("Use the default scorecard weights");
  });
});
