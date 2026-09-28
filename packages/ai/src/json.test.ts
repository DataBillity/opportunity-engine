import { describe, expect, it } from "vitest";
import { closeTruncatedJson, parseModelJson } from "./json";

describe("parseModelJson", () => {
  it("reads fenced JSON", () => {
    expect(parseModelJson("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });

  it("keeps the complete fields when output is cut off at the token limit", () => {
    const truncated = "```json\n{\"objective\":[\"Replace CaRes\"],\"rfiSummary\":{\"gaps\":[\"Volumes\"]},\"requirements\":[{\"requirementText\":\"Describe your solution\",\"passFail\":false},{\"requirementText\":\"Describe fun";
    const parsed = parseModelJson(truncated) as { objective: string[]; rfiSummary: { gaps: string[] }; requirements: unknown[] };
    expect(parsed.objective).toEqual(["Replace CaRes"]);
    expect(parsed.rfiSummary.gaps).toEqual(["Volumes"]);
    expect(parsed.requirements).toHaveLength(1);
  });

  it("does not treat braces or commas inside strings as structure", () => {
    expect(JSON.parse(closeTruncatedJson("{\"a\":\"x, {y}\",\"b\":[1,2") ?? "")).toEqual({ a: "x, {y}", b: [1] });
  });
});
