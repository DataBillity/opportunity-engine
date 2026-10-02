import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DATABILLITY_ORG_ID, resolveWorkspaceOrganizationId } from "@opportunity-engine/db";
import { buildTenantSeed, describeTenantSeed } from "./tenant-seed";

describe("workspace organization id", () => {
  it("keeps the legacy operator id on the DataBillity organization", () => {
    assert.equal(resolveWorkspaceOrganizationId(undefined), DATABILLITY_ORG_ID);
    assert.equal(resolveWorkspaceOrganizationId(""), DATABILLITY_ORG_ID);
    assert.equal(resolveWorkspaceOrganizationId(" operator "), DATABILLITY_ORG_ID);
    assert.equal(resolveWorkspaceOrganizationId("northwind"), "northwind");
  });
});

describe("new tenant demonstration data", () => {
  const seed = buildTenantSeed();

  it("is stable across builds", () => {
    assert.deepEqual(buildTenantSeed(), seed);
  });

  it("covers every core module", () => {
    for (const line of describeTenantSeed(seed)) {
      const count = Number(line.match(/\d+/)?.[0]);
      assert.ok(count > 0, line);
    }
    const summary = describeTenantSeed(seed).join("\n");
    assert.match(summary, /Search & Discovery/);
    assert.match(summary, /Pipeline/);
    assert.match(summary, /Partner network/);
    assert.match(summary, /Opportunities: \d+ \(rfp, rfi, sow\)/);
    assert.match(summary, /Capability sources/);
    assert.match(summary, /Archive/);
    assert.match(summary, /Response Builder/);
  });

  it("seeds Search & Discovery plays, a lead list, and scored candidates", () => {
    assert.ok((seed.plays ?? []).length > 0);
    assert.ok((seed.plays ?? []).every(play => play.status === "active"));
    assert.ok((seed.plays ?? []).some(play => /healthcare/i.test(play.name)));
    assert.ok((seed.plays ?? []).some(play => /transit|fare/i.test(play.name)));
    assert.ok((seed.plays ?? []).some(play => /labor|benefits|migration/i.test(play.name)));
    assert.equal(seed.leadImports?.length, 1);
    assert.equal(seed.leadImports?.[0]?.leads.length, seed.discovery?.length);
    assert.ok((seed.discovery ?? []).every(candidate => candidate.score > 0));
    assert.ok((seed.discovery ?? []).some(candidate => candidate.opportunityScore && candidate.opportunityScore > 0));
    assert.ok((seed.discovery ?? []).some(candidate => candidate.existingAccountId));
    assert.ok((seed.discovery ?? []).some(candidate => candidate.leadDraft && !candidate.existingAccountId));
    assert.ok((seed.leadImports?.[0]?.leads ?? []).some(lead => lead.bestPlayName));
  });

  it("seeds pipeline organizations, partner network, and archive records", () => {
    assert.ok(seed.organizations.some(org => !org.archived && org.channel === "Solicitation"));
    assert.ok(seed.organizations.some(org => !org.archived && org.channel === "Partner"));
    assert.ok(seed.partners.some(partner => partner.type === "Prime" && partner.status !== "Archived"));
    assert.ok(seed.partners.some(partner => partner.type === "Subcontractor" && partner.status !== "Archived"));
    assert.equal(seed.organizations.filter(org => org.archived).length, 1);
    assert.equal(seed.partners.filter(partner => partner.status === "Archived").length, 1);
    assert.ok(seed.graph.capabilities.some(item => item.status === "Archived"));
    assert.ok(seed.graph.capabilities.some(item => item.status !== "Archived"));
    assert.ok(seed.graph.experience.some(item => item.status !== "Archived"));
    assert.ok(seed.graph.credentials.length > 0);
    assert.ok(seed.graph.people.length > 0);
  });

  it("includes an open RFP, RFI, and SOW", () => {
    const open = Object.values(seed.pursuits).filter(pursuit => !pursuit.closed);
    assert.ok(open.some(pursuit => pursuit.projectType === "rfp"));
    assert.ok(open.some(pursuit => pursuit.projectType === "rfi" && pursuit.rec === "go"));
    assert.ok(open.some(pursuit => pursuit.projectType === "sow"));
    const rfiOrg = seed.organizations.find(org => org.id === "ORG-08");
    assert.ok(rfiOrg);
    assert.deepEqual(rfiOrg?.pursuits, ["OPP-2302"]);
    assert.ok(seed.pursuits["OPP-2302"]?.docSummary.rfi);
  });
});
