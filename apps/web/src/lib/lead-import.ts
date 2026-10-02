/**
 * Lead List Import Pipeline
 *
 * Turns any list of organizations into classified, scored, and enriched leads
 * compared against Partner plays.
 *
 * Five-stage pipeline:
 *   Imported → Identified → Classified → Enriched → Reviewed
 */
import type { Play, RelationshipLevel, FitScoreBreakdown } from "@opportunity-engine/core";

/* ------------------------------------------------------------------ */
/*  List settings (entered once per upload)                            */
/* ------------------------------------------------------------------ */

export type ListSourceType =
  | "event"
  | "network_export"
  | "agency"
  | "referral"
  | "research"
  | "other";

export interface ListSource {
  type: ListSourceType;
  provider: string;
  eventName?: string;
  eventDate?: string;
  eventLocation?: string;
  eventTheme?: string;
  usageTerms?: string;
}

export interface ListSettings {
  source: ListSource;
  relationshipLevel: RelationshipLevel;
  relationshipOwner: string;
  context: string;
}

export const RELATIONSHIP_LEVELS: { value: RelationshipLevel; label: string; points: number }[] = [
  { value: "Met in person", label: "Met in person", points: 12 },
  { value: "Referral", label: "Referral", points: 10 },
  { value: "Network connection", label: "Network connection", points: 6 },
  { value: "Prior interaction", label: "Prior interaction", points: 6 },
  { value: "Sourced list", label: "Sourced list (cold)", points: 2 },
];

export const LIST_SOURCE_TYPES: { value: ListSourceType; label: string }[] = [
  { value: "event", label: "Event" },
  { value: "network_export", label: "Team member's network" },
  { value: "agency", label: "List-generation agency" },
  { value: "referral", label: "Referral partner" },
  { value: "research", label: "Research" },
  { value: "other", label: "Other" },
];

/* ------------------------------------------------------------------ */
/*  Imported lead row                                                  */
/* ------------------------------------------------------------------ */

export type LeadStatus =
  | "Imported"
  | "Identified"
  | "Classified"
  | "Enriched"
  | "Reviewed";

export type LeadAction =
  | "pending"
  | "enrich"
  | "nurture"
  | "park"
  | "excluded"
  | "potential_partner"
  | "needs_review"
  | "add_to_pipeline"
  | "dismissed";

export type IdentityConfidence = "High" | "Medium" | "Low" | "Pending";

export interface LeadContact {
  name: string;
  title: string;
  email: string;
  profileUrl?: string;
  roleLevel?: "decision-maker" | "influencer" | "other";
}

export interface IdentityResult {
  canonicalName: string;
  division: string;
  website: string;
  hqLocation: string;
  confidence: IdentityConfidence;
  needsConfirmation: boolean;
  notAnOrganization: boolean;
  duplicateOf: string | null;
  isPartner: boolean;
  isCustomer: boolean;
  excluded: boolean;
  excludedReason: string;
}

export interface ImportedLead {
  id: string;
  originalName: string;
  cleanedName: string;
  status: LeadStatus;
  action: LeadAction;

  contacts: LeadContact[];
  notes: string;
  dateOfLastContact: string;

  listSettings: ListSettings;

  identity?: IdentityResult;
  identityConfidence: IdentityConfidence;

  orgType?: string;
  sector?: string;
  sizeBand?: string;
  bestPlayId?: string;
  bestPlayName?: string;
  fitScore?: FitScoreBreakdown;

  opportunityScore?: number;
  need?: number;
  timing?: number;
  whyNow?: string;

  relationshipOwner: string;

  reviewDecision?: "add" | "nurture" | "dismiss";
  dismissReason?: string;

  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Column mapping                                                     */
/* ------------------------------------------------------------------ */

export type MappableColumn =
  | "organization"
  | "contact_name"
  | "contact_first_name"
  | "contact_last_name"
  | "contact_title"
  | "website"
  | "email"
  | "profile_url"
  | "notes"
  | "date_of_last_contact"
  | "skip";

export interface ColumnMapping {
  headerName: string;
  mappedTo: MappableColumn;
}

export const MAPPABLE_COLUMNS: { value: MappableColumn; label: string; required: boolean }[] = [
  { value: "organization", label: "Organization name", required: true },
  { value: "contact_name", label: "Contact name", required: false },
  { value: "contact_first_name", label: "Contact first name", required: false },
  { value: "contact_last_name", label: "Contact last name", required: false },
  { value: "contact_title", label: "Contact title", required: false },
  { value: "website", label: "Website", required: false },
  { value: "email", label: "Email", required: false },
  { value: "profile_url", label: "Profile URL", required: false },
  { value: "notes", label: "Notes", required: false },
  { value: "date_of_last_contact", label: "Date of last contact", required: false },
  { value: "skip", label: "Skip column", required: false },
];

/* ------------------------------------------------------------------ */
/*  Name cleaning                                                      */
/* ------------------------------------------------------------------ */

const LEGAL_SUFFIXES = /\b(Inc\.?|LLC\.?|Corp\.?|Corporation|Ltd\.?|Limited|L\.?P\.?|LLP|PLC|S\.?A\.?|GmbH|Co\.?|Company|Incorporated)\s*$/i;

const NON_ORGS = new Set([
  "self-employed", "freelance", "freelancer", "retired", "stealth",
  "stealth startup", "student", "unemployed", "n/a", "na", "none",
  "-", "", "unknown",
]);

export function cleanOrgName(raw: string): string {
  return raw.trim().replace(LEGAL_SUFFIXES, "").replace(/[,.\s]+$/, "").trim();
}

export function isNonOrganization(name: string): boolean {
  return NON_ORGS.has(name.trim().toLowerCase());
}

/* ------------------------------------------------------------------ */
/*  CSV parsing into ImportedLead[]                                    */
/* ------------------------------------------------------------------ */

export function parseLeadListCsv(
  text: string,
  columnMappings: ColumnMapping[],
  settings: ListSettings,
): { leads: ImportedLead[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { leads: [], warnings: ["File has fewer than 2 lines (header + data)."] };
  }

  const headerLine = lines[0]!;
  const headers = parseCsvRow(headerLine);
  const dataLines = lines.slice(1);

  const orgColIdx = columnMappings.findIndex(m => m.mappedTo === "organization");
  if (orgColIdx < 0) {
    return { leads: [], warnings: ["No column is mapped to Organization name."] };
  }

  const now = new Date().toISOString();
  const leads: ImportedLead[] = [];
  const orgGroups = new Map<string, ImportedLead>();

  for (let i = 0; i < dataLines.length; i++) {
    const row = parseCsvRow(dataLines[i]!);
    const values: Record<MappableColumn, string> = {
      organization: "",
      contact_name: "",
      contact_first_name: "",
      contact_last_name: "",
      contact_title: "",
      website: "",
      email: "",
      profile_url: "",
      notes: "",
      date_of_last_contact: "",
      skip: "",
    };

    for (let c = 0; c < columnMappings.length && c < row.length; c++) {
      const mapping = columnMappings[c]!;
      if (mapping.mappedTo !== "skip") {
        values[mapping.mappedTo] = (row[c] ?? "").trim();
      }
    }

    const rawName = values.organization;
    const contactName = joinContactName(values.contact_name, values.contact_first_name, values.contact_last_name);
    if (!rawName || isNonOrganization(rawName)) {
      if (contactName && rawName) {
        warnings.push(`Row ${i + 2}: "${rawName}" is not an organization — contact kept.`);
      }
      continue;
    }

    const cleaned = cleanOrgName(rawName);
    const key = cleaned.toLowerCase();

    const contact: LeadContact | null =
      contactName || values.email
        ? {
            name: contactName,
            title: values.contact_title,
            email: values.email,
            profileUrl: values.profile_url || undefined,
          }
        : null;

    const existing = orgGroups.get(key);
    if (existing) {
      if (contact) {
        const dup = existing.contacts.find(c =>
          (c.email && c.email === contact.email) ||
          (c.name && c.name === contact.name)
        );
        if (!dup) existing.contacts.push(contact);
      }
      if (values.notes && !existing.notes.includes(values.notes)) {
        existing.notes = existing.notes ? `${existing.notes}; ${values.notes}` : values.notes;
      }
      existing.updatedAt = now;
      continue;
    }

    const lead: ImportedLead = {
      id: `IMP-${Date.now().toString(36)}-${i}`,
      originalName: rawName,
      cleanedName: cleaned,
      status: "Imported",
      action: "pending",
      contacts: contact ? [contact] : [],
      notes: values.notes,
      dateOfLastContact: values.date_of_last_contact,
      listSettings: settings,
      identityConfidence: "Pending",
      relationshipOwner: settings.relationshipOwner,
      createdAt: now,
      updatedAt: now,
    };

    if (values.website) {
      lead.identity = {
        canonicalName: cleaned,
        division: "",
        website: values.website,
        hqLocation: "",
        confidence: "Medium",
        needsConfirmation: false,
        notAnOrganization: false,
        duplicateOf: null,
        isPartner: false,
        isCustomer: false,
        excluded: false,
        excludedReason: "",
      };
      lead.identityConfidence = "Medium";
    }

    orgGroups.set(key, lead);
  }

  leads.push(...orgGroups.values());
  return { leads, warnings };
}

/* ------------------------------------------------------------------ */
/*  Auto-detect column mappings from headers                           */
/* ------------------------------------------------------------------ */

const ORG_HEADERS = new Set([
  "organization",
  "org",
  "company",
  "company name",
  "organization name",
  "account",
  "lead",
]);

const HEADER_HINTS: Record<string, MappableColumn> = {
  organization: "organization",
  org: "organization",
  company: "organization",
  "company name": "organization",
  "organization name": "organization",
  account: "organization",
  lead: "organization",
  contact: "contact_name",
  "contact name": "contact_name",
  "full name": "contact_name",
  "first name": "contact_first_name",
  firstname: "contact_first_name",
  "given name": "contact_first_name",
  "last name": "contact_last_name",
  lastname: "contact_last_name",
  surname: "contact_last_name",
  "family name": "contact_last_name",
  title: "contact_title",
  position: "contact_title",
  "job title": "contact_title",
  role: "contact_title",
  website: "website",
  url: "website",
  domain: "website",
  "company url": "website",
  "company website": "website",
  email: "email",
  "email address": "email",
  "contact email": "email",
  profile: "profile_url",
  "profile url": "profile_url",
  "linkedin url": "profile_url",
  linkedin: "profile_url",
  notes: "notes",
  note: "notes",
  comments: "notes",
  "date of last contact": "date_of_last_contact",
  "last contact": "date_of_last_contact",
  "connected on": "date_of_last_contact",
};

/** A single Name column is the contact when the file also has an organization column. Otherwise it is the organization. */
export function autoDetectMappings(headers: string[]): ColumnMapping[] {
  const hasOrganization = headers.some(header => ORG_HEADERS.has(header.trim().toLowerCase()));
  const used = new Set<MappableColumn>();
  return headers.map(h => {
    const key = h.trim().toLowerCase();
    const match = key === "name"
      ? (hasOrganization ? "contact_name" : "organization")
      : HEADER_HINTS[key];
    if (match && !used.has(match)) {
      used.add(match);
      return { headerName: h, mappedTo: match };
    }
    return { headerName: h, mappedTo: "skip" as MappableColumn };
  });
}

function joinContactName(full: string, first: string, last: string): string {
  const named = full.trim();
  if (named) return named;
  return [first, last].map(part => part.trim()).filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Exclusion checks                                                   */
/* ------------------------------------------------------------------ */

const EXCLUDED_ORG_TYPES = new Set([
  "consulting", "professional services", "consulting and professional services",
  "it staffing", "staffing", "staffing firm",
]);

export function isExcludedOrgType(orgType: string): boolean {
  return EXCLUDED_ORG_TYPES.has(orgType.toLowerCase().trim());
}

export function checkPartnerExclusion(
  name: string,
  partners: { id: string; name: string; website?: string }[],
): { isPartner: boolean; partnerId?: string; partnerName?: string } {
  const cleaned = cleanOrgName(name).toLowerCase();
  for (const p of partners) {
    const pCleaned = cleanOrgName(p.name).toLowerCase();
    if (cleaned === pCleaned || cleaned.includes(pCleaned) || pCleaned.includes(cleaned)) {
      return { isPartner: true, partnerId: p.id, partnerName: p.name };
    }
    if (p.website) {
      const domain = p.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] ?? "";
      if (domain && cleaned.includes(domain.split(".")[0] ?? "")) {
        return { isPartner: true, partnerId: p.id, partnerName: p.name };
      }
    }
  }
  return { isPartner: false };
}

/* ------------------------------------------------------------------ */
/*  CSV row parser (handles quoted fields)                             */
/* ------------------------------------------------------------------ */

function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

export function extractCsvHeaders(text: string): string[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  if (!lines[0]) return [];
  return parseCsvRow(lines[0]);
}

export function csvRowCount(text: string): number {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  return Math.max(0, lines.length - 1);
}
