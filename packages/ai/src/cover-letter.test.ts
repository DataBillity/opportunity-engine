import { describe, expect, it } from "vitest";
import type { ResponseDraftBriefing } from "@opportunity-engine/contracts";
import { buildCoverLetterPrompt, countWords, fallbackCoverLetter, COVER_LETTER_MAX_WORDS } from "./cover-letter";
import { buildResponseDraftPrompt, collectResponseFacts, renumberResolvedGapIds } from "./response-draft";

const briefing: ResponseDraftBriefing = {
  section: { id: "cover", name: "Cover letter" },
  sections: [],
  mode: "cover_letter",
  projectType: "rfp",
  existingGapIds: ["GAP-001", "GAP-002", "GAP-003"],
  resolvedGaps: [{ id: "GAP-002", description: "Confirm PMP certification date.", owner: "Prime", resolution: "Dana Whitfield, PMP since 2014." }],
  openGaps: [{ id: "GAP-003", description: "Provide a third past-performance reference.", owner: "Prime", priority: "High", location: "Past Performance" }],
  draftedSections: [
    { id: "tech", title: "Technical Approach", body: "We would migrate the claims platform in three phases. [GAP-003 | Prime | Provide a reference]" },
    { id: "past", title: "Past Performance", body: "Commonwealth Department of Labor claims migration, 2022–2024." },
  ],
  signatory: { name: "Bryan Lee", title: "CEO" },
  partners: [
    { name: "DataBillity", role: "Prime", covers: [], confirmed: true },
    { name: "Union Systems Group", role: "Subcontractor", covers: [], confirmed: true },
    { name: "Unconfirmed Co", role: "Subcontractor", covers: [], confirmed: false },
  ],
  organization: { name: "State Department of Labor" },
  pursuit: {
    id: "OPP-1",
    name: "UI Claims Modernization",
    typeLabel: "RFP",
    solicitationRef: "RFP-26-101",
    documents: [],
    docSummary: {
      objective: ["Replace the legacy unemployment claims system."],
      challenges: [],
      services: [],
      deliverables: [],
      responseConstraints: [],
    },
    informationRequests: [],
    capabilities: ["Claims & Adjudication Systems", "Legacy Modernization"],
    mappedRequirements: [],
    unmappedRequirements: [],
    gaps: [],
    rationale: [],
  },
  people: [],
  experience: [],
};

describe("regeneration facts", () => {
  it("turns resolved action items into facts and keeps open ids", () => {
    const facts = collectResponseFacts(briefing);
    const resolved = facts.find(fact => fact.text.startsWith("Resolved action item GAP-002"));
    expect(resolved?.id).toMatch(/^G\d+$/);
    expect(resolved?.text).toContain("Dana Whitfield, PMP since 2014.");
    expect(facts.some(fact => fact.text.startsWith("Open action item GAP-003"))).toBe(true);
    expect(buildResponseDraftPrompt(briefing, facts)).toContain("REGENERATION RULES");
  });

  it("renumbers gaps logged under a resolved id, including their placeholders", () => {
    const { gaps, bodies } = renumberResolvedGapIds(
      [{ id: "GAP-002" }, { id: "GAP-003" }],
      ["Text [GAP-002 | Prime | Again] and [GAP-003 | Prime | Keep]"],
      briefing,
    );
    expect(gaps.map(gap => gap.id)).toEqual(["GAP-004", "GAP-003"]);
    expect(bodies[0]).toBe("Text [GAP-004 | Prime | Again] and [GAP-003 | Prime | Keep]");
  });
});

describe("cover letter", () => {
  it("prompts with drafted sections, without gap placeholders", () => {
    const prompt = buildCoverLetterPrompt(briefing, collectResponseFacts(briefing, { includeSourceExcerpt: false }));
    expect(prompt).toContain("--- Technical Approach ---");
    expect(prompt).toContain("Signatory: Bryan Lee, CEO, DataBillity");
    expect(prompt).not.toContain("[GAP-003");
  });

  it("falls back to a one-page letter naming only confirmed teammates", () => {
    const letter = fallbackCoverLetter(briefing);
    expect(letter).toMatch(/^Dear State Department of Labor/);
    expect(letter).toContain("UI Claims Modernization (RFP-26-101)");
    expect(letter).toContain("Union Systems Group");
    expect(letter).not.toContain("Unconfirmed Co");
    expect(letter).toContain("Bryan Lee");
    expect(countWords(letter)).toBeLessThanOrEqual(COVER_LETTER_MAX_WORDS);
  });
});
