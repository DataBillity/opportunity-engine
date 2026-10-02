import { describe, expect, it } from "vitest";
import { autoDetectMappings, parseLeadListCsv, type ListSettings } from "./lead-import";

const settings: ListSettings = {
  source: { type: "research", provider: "test" },
  relationshipLevel: "Sourced list",
  relationshipOwner: "ada",
  context: "",
};

describe("bulk lead contact names", () => {
  it("keeps a single Name column as the contact when an organization column is present", () => {
    const csv = "Company,Name,Title\nCascade Transit,Jordan Hale,IT Director";
    const mappings = autoDetectMappings(["Company", "Name", "Title"]);
    expect(mappings.map(column => column.mappedTo)).toEqual(["organization", "contact_name", "contact_title"]);
    const { leads } = parseLeadListCsv(csv, mappings, settings);
    expect(leads[0]?.cleanedName).toBe("Cascade Transit");
    expect(leads[0]?.contacts[0]?.name).toBe("Jordan Hale");
  });

  it("joins First Name and Last Name into one contact", () => {
    const csv = "Organization,First Name,Last Name,Email\nHarbor Health,Priya,Nandakumar,priya@harbor.test";
    const mappings = autoDetectMappings(["Organization", "First Name", "Last Name", "Email"]);
    expect(mappings.map(column => column.mappedTo)).toEqual([
      "organization",
      "contact_first_name",
      "contact_last_name",
      "email",
    ]);
    const { leads } = parseLeadListCsv(csv, mappings, settings);
    expect(leads[0]?.contacts[0]?.name).toBe("Priya Nandakumar");
    expect(leads[0]?.contacts[0]?.email).toBe("priya@harbor.test");
  });

  it("uses a lone Name column as the organization", () => {
    const mappings = autoDetectMappings(["Name", "Website"]);
    expect(mappings.map(column => column.mappedTo)).toEqual(["organization", "website"]);
  });
});
