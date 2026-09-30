import { describe, expect, it } from "vitest";
import { parseRfpProposalPart, type RfpProposal } from "@opportunity-engine/contracts";
import {
  batchProposalSections,
  estimatePages,
  gapIdsInOrder,
  mergeProposalParts,
  proposalPlatformChecks,
  reconcileRfpProposal,
  renumberPartGaps,
} from "./rfp-proposal";

function part(value: unknown): RfpProposal {
  return parseRfpProposalPart(value);
}

const plan = part({
  structure: {
    basis: "prescribed",
    rationale: "§2.11.1 prescribes §4.1.",
    volumes: [{ volume: "Technical Proposal", pageLimit: "4 pages (§2.10.1)", sectionIds: ["cover", "a", "b"] }],
  },
  winThemes: [{ theme: "Fast pilot", customerNeed: "Milestones", discriminator: "Parallel discovery", proof: "**[GAP-001 | Prime | Reference project with dates]**" }],
  sections: [
    { id: "cover", heading: "Cover Letter", pageBudget: 1, brief: "Offer and addenda" },
    { id: "a", heading: "1(a) Prior Experience", rfpRef: "§4.1.1(a)", pageBudget: 1, brief: "Experience" },
    { id: "b", heading: "1(b) Reference Projects", rfpRef: "§4.1.1(b)", pageBudget: 2, brief: "3-5 projects" },
  ],
  gapLog: [{ id: "GAP-001", location: "Win themes", type: "missing information", description: "Reference project with dates", owner: "Prime", priority: "High" }],
});

describe("renumberPartGaps", () => {
  it("keeps listed ids, numbers the rest in order of appearance, and swaps safely", () => {
    const input = part({
      sections: [{ id: "a", content: "**[GAP-002 | Prime | Second]** then **[GAP-001 | Prime | First]** and **[GAP-007 | Prime | Kept]**" }],
      gapLog: [
        { id: "GAP-001", description: "First" },
        { id: "GAP-002", description: "Second" },
      ],
    });
    const counter = { next: 1 };
    const out = renumberPartGaps(input, new Set(["GAP-007"]), counter);
    expect(out.sections[0]!.content).toBe("**[GAP-001 | Prime | Second]** then **[GAP-002 | Prime | First]** and **[GAP-007 | Prime | Kept]**");
    expect(out.gapLog.map(gap => [gap.id, gap.description])).toEqual([["GAP-002", "First"], ["GAP-001", "Second"]]);
    expect(counter.next).toBe(3);
  });
});

describe("merge and reconcile", () => {
  function assemble() {
    const counter = { next: 1 };
    const planned = renumberPartGaps(plan, new Set(), counter);
    const keep = new Set(planned.gapLog.map(gap => gap.id));
    const sectionPart = renumberPartGaps(part({
      sections: [
        { id: "cover", content: "We offer to perform the work." },
        { id: "a", content: "Summit Tech modernized three warehouses. **[GAP-001 | Summit Tech | Reference project with dates]** **[GAP-002 | Prime | Named platforms]**" },
      ],
      gapLog: [{ id: "GAP-002", location: "1(a) Prior Experience", description: "Named platforms", owner: "Prime" }],
    }), keep, counter);
    const formsPart = renumberPartGaps(part({
      forms: [{
        form: "Proposal Form 3",
        name: "Designation of Subcontractors",
        fields: [
          { field: "Subcontractor 1 name", value: "Bay Analytics" },
          { field: "Proposer's Representative signature and date", value: "**[GAP-002 | Summit Tech | Signature and date]**" },
        ],
      }],
      gapLog: [{ id: "GAP-002", location: "Form 3", type: "signature", description: "Signature and date", owner: "Summit Tech" }],
    }), keep, counter);
    const compliancePart = part({
      complianceMatrix: [
        { requirement: "Prior experience", cite: "§4.1.1(a)", answeredIn: "a", owner: "Prime" },
        { requirement: "Designate subcontractors", cite: "§2.11.3", answeredIn: "Form 3" },
        { requirement: "Insurance certificate", cite: "Ex. 9", answeredIn: "" },
      ],
    });
    const merged = mergeProposalParts({ plan: planned, sections: [sectionPart], forms: formsPart, compliance: compliancePart });
    return reconcileRfpProposal(merged, { primeName: "Summit Tech", fallbackDue: "2026-07-22" });
  }

  it("numbers every gap once, in order of appearance, with one Gap Log entry per placeholder", () => {
    const { proposal, report } = assemble();
    expect(proposal.gapLog.map(gap => gap.id)).toEqual(["GAP-001", "GAP-002", "GAP-003", "GAP-004"]);
    expect(gapIdsInOrder(proposal)).toEqual(["GAP-001", "GAP-002", "GAP-003", "GAP-004"]);
    expect(report.emptySections).toEqual(["b"]);
    expect(proposal.sections.find(section => section.id === "b")!.content).toMatch(/^\*\*\[GAP-003 \| Summit Tech \| Draft 1\(b\) Reference Projects/);
    expect(proposal.forms[0]!.fields[1]!.value).toBe("**[GAP-004 | Summit Tech | Signature and date]**");
    expect(proposal.gapLog.every(gap => gap.owner === "Summit Tech")).toBe(true);
    expect(proposal.gapLog.every(gap => gap.due === "2026-07-22")).toBe(true);
    expect(proposal.gapLog.find(gap => gap.id === "GAP-004")!.type).toBe("signature");
  });

  it("sets compliance status from the drafted section or form", () => {
    const { proposal } = assemble();
    expect(proposal.complianceMatrix.map(row => row.status)).toEqual(["Drafted, 2 gaps", "Filled, 1 gap", "Open"]);
    expect(proposal.complianceMatrix[0]!.owner).toBe("Summit Tech");
  });

  it("keeps open action item ids and numbers new gaps after the existing ones", () => {
    const merged = mergeProposalParts({
      plan: part({
        sections: [{ id: "a", heading: "Approach", content: "Text **[GAP-012 | Prime | Still open]** and **[GAP-001 | Prime | New item]**" }],
        gapLog: [
          { id: "GAP-012", location: "Approach", description: "Still open" },
          { id: "GAP-001", location: "Approach", description: "New item" },
        ],
      }),
    });
    const { proposal } = reconcileRfpProposal(merged, { keep: new Set(["GAP-012"]), firstFresh: 13 });
    expect(proposal.sections[0]!.content).toBe("Text **[GAP-012 | Prime | Still open]** and **[GAP-013 | Prime | New item]**");
    expect(proposal.gapLog.map(gap => gap.id)).toEqual(["GAP-012", "GAP-013"]);
  });

  it("logs placeholders the model forgot and places entries by their location", () => {
    const merged = mergeProposalParts({
      plan: part({
        sections: [{ id: "2a", heading: "2(a) Team Structure", content: "Team **[GAP-005 | Bay Analytics | Confirm scope]**" }],
        forms: [{ form: "Form 8", name: "References", fields: [{ field: "Reference 1", value: "Pending" }] }],
        gapLog: [
          { id: "GAP-006", location: "Section 2a", description: "Organization chart inputs", owner: "Prime" },
          { id: "GAP-007", location: "Form 8", description: "Three referees", owner: "Prime" },
          { id: "GAP-008", location: "Submission", description: "Register on the portal", owner: "Prime" },
        ],
      }),
    });
    const { proposal, report } = reconcileRfpProposal(merged, { primeName: "Summit Tech" });
    expect(report.placeholdersLogged).toEqual(["GAP-001"]);
    expect(proposal.gapLog.find(gap => gap.id === "GAP-001")).toMatchObject({ owner: "Bay Analytics", description: "Confirm scope" });
    expect(proposal.sections[0]!.content).toContain("**[GAP-002 | Summit Tech | Organization chart inputs]**");
    expect(proposal.forms[0]!.notes).toContain("**[GAP-003 | Summit Tech | Three referees]**");
    expect(report.logOnly).toEqual(["GAP-004"]);
  });
});

describe("proposalPlatformChecks", () => {
  it("flags pre-filled signatures, unmapped requirements, and page limits", () => {
    const long = Array.from({ length: 1200 }, () => "word").join(" ");
    const checks = proposalPlatformChecks(part({
      structure: { volumes: [{ volume: "Technical Proposal", pageLimit: "2 pages", sectionIds: ["a"] }] },
      sections: [{ id: "a", heading: "Approach", pageBudget: 2, content: long }],
      forms: [{ form: "Form 6", fields: [{ field: "Signature", value: "Jane Doe" }] }],
      complianceMatrix: [{ requirement: "Insurance", cite: "Ex. 9", answeredIn: "", status: "Open" }],
    }));
    const byName = Object.fromEntries(checks.map(check => [check.check, check.result]));
    expect(byName["Each section fits its page budget"]).toBe("fail");
    expect(byName["Technical Proposal fits its 2-page limit"]).toBe("fail");
    expect(byName["Every compliance row is answered or logged"]).toBe("fail");
    expect(byName["Signature and date fields are placeholders"]).toBe("fail");
    expect(checks.every(check => check.source === "platform")).toBe(true);
  });

  it("estimates pages from prose only", () => {
    const words = Array.from({ length: 500 }, () => "word").join(" ");
    expect(estimatePages(`${words} **[GAP-001 | Prime | A long placeholder description here]**`)).toBe(1);
    expect(estimatePages("[GRAPHIC: timeline; caption: on time]")).toBe(0.3);
  });
});

describe("batchProposalSections", () => {
  it("groups sections by page budget in document order", () => {
    const batches = batchProposalSections([
      { id: "cover", pageBudget: 1 },
      { id: "1a", pageBudget: 3 },
      { id: "1b", pageBudget: 6 },
      { id: "1c", pageBudget: 1 },
      { id: "2c", pageBudget: null },
      { id: "3a", pageBudget: 5 },
    ]);
    expect(batches).toEqual([["cover", "1a"], ["1b", "1c"], ["2c"], ["3a"]]);
  });

  it("merges the smallest neighbors when there are too many batches", () => {
    const batches = batchProposalSections(
      [1, 2, 3, 4, 5].map(n => ({ id: `s${n}`, pageBudget: 7 })),
      { maxBatches: 3 },
    );
    expect(batches).toHaveLength(3);
    expect(batches.flat()).toEqual(["s1", "s2", "s3", "s4", "s5"]);
  });
});
