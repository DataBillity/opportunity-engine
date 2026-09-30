import { describe, expect, it } from "vitest";
import { gapForRequirement, reassessPursuit, type ReassessInput } from "./reassess";

const capabilities = [
  { id: "CAP-0231", name: "Fare & Payments Integration", partnerIds: ["PTR-U"] },
  { id: "CAP-0117", name: "Financial Reconciliation Systems", partnerIds: ["PTR-M", "PTR-U"] },
  { id: "CAP-0300", name: "Mobile Ticketing Applications", partnerIds: ["PTR-N"] },
];

const base: ReassessInput = {
  projectType: "rfp",
  reqmap: [
    { req: "Contactless fare payment integration, EMV-compliant", status: "mapped", node: "CAP-0231 Fare & Payments Integration", evidence: "" },
    { req: "Transit fare reconciliation reporting", status: "mapped", node: "CAP-0117 Financial Reconciliation Systems", evidence: "" },
    { req: "Mobile ticketing applications for riders", status: "unmapped", node: null, evidence: "" },
    { req: "Cloud data warehouse", status: "mapped", node: "Data Platform Modernization", evidence: "" },
  ],
  gaps: [
    { id: "GAP-121", title: "Mobile ticketing applications", crit: "Unmapped requirement", demand: "", closure: "" },
  ],
  capabilities,
  partners: [
    { id: "PTR-U", name: "Uplift Partners", covers: [] },
    { id: "PTR-M", name: "Meridian", covers: [] },
  ],
  partnerNames: { "PTR-U": "Uplift Partners", "PTR-M": "Meridian", "PTR-N": "Nimbus" },
  score: 70,
  confidence: 70,
  rec: "cond",
};

describe("reassessPursuit", () => {
  it("is a no-op when the team is unchanged", () => {
    const result = reassessPursuit(base);
    expect(result.changes).toEqual([]);
    expect(result.mappedCount).toBe(3);
    expect(result.gaps.map(gap => gap.id)).toEqual(["GAP-121"]);
  });

  it("unmaps requirements only the removed partner covered and logs a gap", () => {
    const result = reassessPursuit({
      ...base,
      partners: base.partners.filter(partner => partner.id !== "PTR-U"),
    });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ to: "unmapped", partners: ["Uplift Partners"] });
    expect(result.reqmap[1].status).toBe("mapped");
    expect(result.reqmap[3].status).toBe("mapped");
    expect(result.gaps.map(gap => gap.id)).toEqual(["GAP-122", "GAP-121"]);
    expect(result.score).toBeLessThan(70);
  });

  it("maps a gap when an added partner holds a matching capability", () => {
    const result = reassessPursuit({
      ...base,
      partners: [...base.partners, { id: "PTR-N", name: "Nimbus", covers: [] }],
    });
    expect(result.changes).toEqual([
      expect.objectContaining({ to: "mapped", node: "CAP-0300 Mobile Ticketing Applications", partners: ["Nimbus"] }),
    ]);
    expect(result.gaps).toEqual([]);
    expect(result.coveragePct).toBe(100);
    expect(result.score).toBeGreaterThan(70);
  });

  it("credits partner gap coverage and reverts it when that partner leaves", () => {
    const added = reassessPursuit({
      ...base,
      partners: [...base.partners, { id: "PTR-X", name: "Xavier Labs", covers: ["GAP-121"] }],
    });
    expect(added.reqmap[2]).toMatchObject({ status: "mapped", node: "Partner coverage: Xavier Labs", gapId: "GAP-121" });

    const removed = reassessPursuit({ ...base, reqmap: added.reqmap, gaps: added.gaps });
    expect(removed.reqmap[2].status).toBe("unmapped");
    expect(removed.gaps.map(gap => gap.id)).toEqual(["GAP-121"]);
  });

  it("blocks Go on an unmapped pass/fail requirement", () => {
    const result = reassessPursuit({
      ...base,
      reqmap: [...base.reqmap, { req: "Offeror must hold PCI DSS certification (mandatory)", status: "unmapped", node: null, evidence: "" }],
      score: 90,
    });
    expect(result.passFailBlocked).toBe(true);
    expect(result.rec).toBe("nogo");
  });
});

describe("gapForRequirement", () => {
  it("matches a gap whose title words appear in the requirement", () => {
    const gaps = [{ id: "GAP-1", title: "Section 508 accessibility audit" }];
    expect(gapForRequirement({ req: "Independent Section 508 accessibility audit of all portals" }, gaps)?.id).toBe("GAP-1");
    expect(gapForRequirement({ req: "Cloud hosting" }, gaps)).toBeUndefined();
  });
});
