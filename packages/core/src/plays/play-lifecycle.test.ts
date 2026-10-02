import { describe, expect, it } from "vitest";
import { buildPlaysFromPartners, type PlayBuilderInput } from "./play-builder";
import {
  applySolicitationUpdate,
  approveProposedPlay,
  assessProposedPlay,
  composeConsortiumPlays,
  storeUpdatedPlay,
} from "./play-lifecycle";

const graph: PlayBuilderInput = {
  partners: [
    { id: "PTR-U", name: "Union Systems", type: "Prime" },
    { id: "PTR-M", name: "Meridian", type: "Subcontractor" },
  ],
  capabilities: [
    { id: "CAP-1", name: "Claims Migration", partners: ["PTR-U"], status: "Verified" },
    { id: "CAP-2", name: "Fare Payment Integration", partners: ["PTR-M"], status: "Verified" },
  ],
  experiences: [
    {
      id: "EXP-A",
      name: "State labor claims migration",
      partners: ["PTR-U"],
      industry: "Healthcare",
      services: ["Claims Migration"],
      technologies: [],
      summary: "Migrated a claims platform for a health system.",
      status: "Verified",
    },
    {
      id: "EXP-B",
      name: "City fare payment rollout",
      partners: ["PTR-M"],
      industry: "Public Transit",
      services: ["Fare Payment"],
      technologies: [],
      summary: "Delivered fare payment integration for a transit agency.",
      status: "Verified",
    },
  ],
  credentials: [
    { id: "CR-1", name: "SOC 2", credType: "Certification", partner: "PTR-U", scope: "", status: "Verified" },
  ],
  people: [
    { id: "P-1", name: "Ada Quinn", partner: "PTR-U", roles: ["Architect"], expertise: "Claims migration", industries: ["Healthcare"], status: "Verified" },
  ],
};

describe("derived plays", () => {
  it("does not treat a service delivered in one industry as a play in another", () => {
    const plays = buildPlaysFromPartners(graph);
    const names = plays.map(play => play.name);
    expect(plays).toHaveLength(2);
    expect(names.some(name => /claims/i.test(name) && /transit/i.test(name))).toBe(false);
    expect(names.some(name => /fare/i.test(name) && /healthcare/i.test(name))).toBe(false);
  });

  it("clusters the same service when industries are adjacent", () => {
    const plays = buildPlaysFromPartners({
      ...graph,
      experiences: [
        graph.experiences[0]!,
        {
          ...graph.experiences[0]!,
          id: "EXP-C",
          name: "Benefits claims migration",
          industry: "Health plan",
        },
      ],
    });
    expect(plays).toHaveLength(1);
    expect(plays[0]?.strength.experienceCount).toBe(2);
  });
});

describe("proposed plays", () => {
  it("gives transferable credit and a coverage gap when the industry differs", () => {
    const play = assessProposedPlay({
      name: "Claims migration",
      problem: "A transit agency needs to migrate its claims-style fare adjudication.",
      sector: "Public Transit",
      orgType: "transit or special district",
      services: ["Claims Migration"],
    }, graph, new Date("2026-10-02T12:00:00Z"));

    expect(play.origin).toBe("proposed");
    expect(play.status).toBe("draft");
    expect(play.proven).toBe(false);
    expect(play.assessment?.transferable).toBe(true);
    expect(play.assessment?.experienceCredits[0]?.industry).toBe("Healthcare");
    expect(play.coverageGaps.some(gap => /public transit/i.test(gap.service))).toBe(true);
    expect(play.coverageGaps.some(gap => /claims migration/i.test(gap.service))).toBe(false);
  });

  it("keeps an approved proposal when partner records are rebuilt", () => {
    const draft = assessProposedPlay({
      name: "Claims migration",
      problem: "Migrate claims in public transit.",
      sector: "Public Transit",
      orgType: "",
      services: ["Claims Migration"],
    }, graph);
    const approved = approveProposedPlay([draft], draft.playId, "Priya");
    const composed = composeConsortiumPlays(graph, approved);
    const proposal = composed.find(play => play.playId === draft.playId);
    expect(proposal?.status).toBe("active");
    expect(proposal?.approvedBy).toBe("Priya");
    expect(composed.filter(play => play.origin !== "proposed")).toHaveLength(2);
  });
});

describe("solicitation updates", () => {
  it("updates only the matched play when a response is submitted and then won", () => {
    const derived = buildPlaysFromPartners(graph);
    const submitted = applySolicitationUpdate(derived, {
      solicitationId: "OPP-1",
      issuer: "Harbor Transit",
      type: "RFP",
      date: "2026-09-01",
      outcome: "submitted",
      title: "Fare Payment Modernization",
      objective: "Replace the fare payment system.",
      services: ["Fare Payment"],
      challenges: ["Aging fareboxes"],
      sector: "Public Transit",
      orgType: "transit or special district",
    }, new Date("2026-10-02T12:00:00Z"));

    expect(submitted.matchedPlayId).toBeTruthy();
    const matched = submitted.plays.find(play => play.playId === submitted.matchedPlayId);
    const other = submitted.plays.filter(play => play.playId !== submitted.matchedPlayId);
    expect(matched?.strength.bid).toBe(1);
    expect(matched?.strength.won).toBe(0);
    expect(matched?.solicitations).toHaveLength(1);
    expect(other.every(play => play.solicitations.length === 0)).toBe(true);

    const won = applySolicitationUpdate(submitted.plays, {
      solicitationId: "OPP-1",
      issuer: "Harbor Transit",
      type: "RFP",
      date: "2026-09-01",
      outcome: "won",
      title: "Fare Payment Modernization",
      objective: "Replace the fare payment system.",
      services: ["Fare Payment"],
      challenges: [],
    }, new Date("2026-10-02T12:00:00Z"));
    const after = won.plays.find(play => play.playId === won.matchedPlayId);
    expect(after?.solicitations).toHaveLength(1);
    expect(after?.solicitations[0]?.outcome).toBe("won");
    expect(after?.strength.bid).toBe(1);
    expect(after?.strength.won).toBe(1);
    expect(after?.proven).toBe(true);

    const stored = storeUpdatedPlay([], after!);
    const rebuilt = composeConsortiumPlays(graph, stored, new Date("2026-10-02T12:00:00Z"));
    const persisted = rebuilt.find(play => play.playId === after!.playId);
    expect(persisted?.strength.won).toBe(1);
    expect(persisted?.solicitations[0]?.issuer).toBe("Harbor Transit");
  });

  it("leaves plays unchanged when nothing matches", () => {
    const derived = buildPlaysFromPartners(graph);
    const result = applySolicitationUpdate(derived, {
      solicitationId: "OPP-9",
      issuer: "Other",
      type: "RFI",
      date: "2026-09-01",
      outcome: "no-bid",
      title: "Quantum key distribution study",
      objective: "Research quantum key distribution for a research lab.",
      services: ["Quantum cryptography"],
      challenges: [],
    });
    expect(result.matchedPlayId).toBeNull();
    expect(result.plays).toBe(derived);
  });
});
