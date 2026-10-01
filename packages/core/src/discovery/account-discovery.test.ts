import { describe, expect, it } from "vitest";
import {
  graphVersionOf,
  isStaleCapture,
  matchExistingAccount,
  nextHotLeadId,
  scoreDiscoveredAccount,
  screenInboundLead,
} from "./account-discovery";

const graph = [
  { id: "CAP-1", name: "Customer Data Platform", kind: "capability" as const },
  { id: "EXP-1", name: "Airline loyalty modernization", kind: "experience" as const },
];

describe("Lane A discovery scoring", () => {
  it("scores a sourced public account and decomposes the result", () => {
    const scored = scoreDiscoveredAccount({
      name: "Northwind Air",
      domain: "northwind.example",
      industryHint: "Airlines",
      text: "Northwind Air is hiring a chief data officer and modernizing its customer data platform and loyalty program. Budget approved for a multi-year platform.",
      isInbound: false,
      priorRelationship: false,
      graph,
      graphVersion: graphVersionOf(graph),
      capturedAt: "2026-09-30T12:00:00.000Z",
    });

    expect(scored.total).toBeGreaterThan(50);
    expect(scored.capabilityAlignment + scored.intentTiming + scored.accountValueFit).toBeGreaterThan(0);
    expect(scored.factors.length).toBeGreaterThan(2);
    expect(scored.modelVersion).toBe("opportunity-alignment-v1");
    expect(scored.graphVersion).toBe(graphVersionOf(graph));
    expect(scored.matchedNodes.map((node) => node.id)).toContain("CAP-1");
    expect(scored.industry).toMatch(/Airline/i);
  });

  it("flags a channel-shaped account without inventing capability", () => {
    const scored = scoreDiscoveredAccount({
      name: "Harbor Reseller Group",
      text: "We are a value-added reseller and referral partner for payroll software.",
      isInbound: false,
      priorRelationship: false,
      graph,
      graphVersion: "graph-test",
    });
    expect(scored.channelLens).toBe("channel");
    expect(scored.factors.some((factor) => /partner candidate/i.test(factor))).toBe(true);
  });

  it("screens thin and disposable inbound leads for a person to review", () => {
    const flags = screenInboundLead({
      name: "Acme",
      email: "buyer@mailinator.com",
      summary: "hi",
    });
    expect(flags.flags.some((flag) => /disposable/i.test(flag))).toBe(true);
    expect(flags.flags.some((flag) => /thin/i.test(flag))).toBe(true);
    expect(screenInboundLead({ name: "", email: "not-an-email", summary: "Enough detail to review this inquiry properly." }).flags.length).toBeGreaterThan(0);
  });

  it("resolves a candidate to an existing account by domain or name", () => {
    const accounts = [{ id: "a1", name: "Northwind Air, Inc.", domain: "https://www.northwind.example/about" }];
    expect(matchExistingAccount({ name: "Other", domain: "northwind.example" }, accounts)?.id).toBe("a1");
    expect(matchExistingAccount({ name: "Northwind Air" }, accounts)?.reason).toMatch(/name/i);
    expect(matchExistingAccount({ name: "Unrelated Transit" }, accounts)).toBeNull();
  });

  it("raises a hot lead only when a new account outranks the current top", () => {
    expect(nextHotLeadId({
      previousTopId: "old",
      previousTopScore: 70,
      ranked: [
        { id: "old", score: 70, eligible: true },
        { id: "new", score: 81, eligible: true },
      ],
    })).toBe("new");
    expect(nextHotLeadId({
      previousTopId: "old",
      previousTopScore: 90,
      ranked: [{ id: "old", score: 88, eligible: true }],
    })).toBeNull();
  });

  it("flags enrichment past the freshness window", () => {
    expect(isStaleCapture("2026-01-01T00:00:00.000Z", Date.parse("2026-09-30T00:00:00.000Z"))).toBe(true);
    expect(isStaleCapture("2026-09-01T00:00:00.000Z", Date.parse("2026-09-30T00:00:00.000Z"))).toBe(false);
  });
});
