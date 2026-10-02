/**
 * Demonstration workspace copied onto every new tenant.
 * Search & Discovery, pipeline, the Partner network, opportunities,
 * capability sources, and the archive each receive sample records.
 */
import {
  buildPlaysFromPartners,
  computeOpportunityScore,
  scoreFitAgainstPlays,
  type Play,
  type PlaySolicitation,
  type RelationshipLevel,
} from "@opportunity-engine/core";
import type { RfiScopeSummary } from "@opportunity-engine/contracts";
import {
  graphData,
  organizations as baseOrganizations,
  partnerDirectory,
  pursuits as basePursuits,
  type GraphData,
  type Organization,
  type Partner,
  type Pursuit,
} from "./mock-data";
import type { ImportedLead, ListSettings } from "./lead-import";
import type { DiscoveryCandidate } from "./search-candidates";
import type { LeadImportBatch, WorkspaceState } from "./shared-workspace";

const SEEDED_AT = "2026-09-12T15:00:00.000Z";
const SEEDED_DAY = "2026-09-12";

const LIST_SETTINGS: ListSettings = {
  source: {
    type: "event",
    provider: "Demonstration seed",
    eventName: "Public Sector Modernization Forum",
    eventDate: "2026-09-08",
    eventLocation: "Portland, OR",
    eventTheme: "Benefits, transit payments, and healthcare claims",
  },
  relationshipLevel: "Met in person",
  relationshipOwner: "J. Tran",
  context: "Sample discovery list seeded so a new tenant can review Fit and Opportunity scores against consortium plays.",
};

interface DemoLeadSpec {
  id: string;
  name: string;
  sector: string;
  orgType: string;
  sizeBand: string;
  text: string;
  domain: string;
  industry: string;
  contact: { name: string; title: string; email: string; roleLevel: "decision-maker" | "influencer" };
  need: number;
  timing: number;
  whyNow: string;
  existingOrgId?: string;
}

const DEMO_LEADS: DemoLeadSpec[] = [
  {
    id: "DISC-01",
    name: "Cedar County Workforce Board",
    sector: "Government — Labor & Workforce",
    orgType: "state agency",
    sizeBand: "regional",
    text: "County workforce board preparing a program management and data migration modernization of its legacy unemployment claims system, with benefits fraud analytics on the roadmap.",
    domain: "cedarworkforce.gov",
    industry: "Government — Labor & Workforce",
    contact: { name: "Helen Cho", title: "Chief Information Officer", email: "hcho@cedarworkforce.gov", roleLevel: "decision-maker" },
    need: 28,
    timing: 16,
    whyNow: "Board adopted a two-year claims modernization budget in September 2026.",
  },
  {
    id: "DISC-02",
    name: "Lakeshore Medical Group",
    sector: "Healthcare",
    orgType: "healthcare provider",
    sizeBand: "regional",
    text: "Regional hospital group replacing claims adjudication and regulated healthcare data pipelines. Program management for a phased cutover is in the current IT plan.",
    domain: "lakeshoremedical.org",
    industry: "Healthcare",
    contact: { name: "David Okonkwo", title: "VP Revenue Cycle", email: "dokonkwo@lakeshoremedical.org", roleLevel: "decision-maker" },
    need: 24,
    timing: 14,
    whyNow: "Legacy claims platform support contract ends March 2027.",
  },
  {
    id: "DISC-03",
    name: "Rivermark Transit District",
    sector: "Public Transit",
    orgType: "transit or special district",
    sizeBand: "regional",
    text: "Transit district issuing an RFP for fare and payments integration and financial reconciliation across bus and light rail. Program management is named in the draft scope.",
    domain: "rivermarktransit.gov",
    industry: "Public Transit",
    contact: { name: "Sofia Alvarez", title: "Director of Fare Systems", email: "salvarez@rivermarktransit.gov", roleLevel: "influencer" },
    need: 30,
    timing: 18,
    whyNow: "Draft fare-systems RFP is scheduled for release in October 2026.",
  },
  {
    id: "DISC-04",
    name: "Harborview Health Network",
    sector: "Healthcare",
    orgType: "healthcare provider",
    sizeBand: "regional",
    text: "Already a pipeline account. Claims adjudication modernization and healthcare data pipelines are active statements of work.",
    domain: "harborview.org",
    industry: "Healthcare",
    contact: { name: "Marcus Field", title: "VP Digital Transformation", email: "mfield@harborview.org", roleLevel: "decision-maker" },
    need: 22,
    timing: 12,
    whyNow: "Two statements of work are already in motion on this account.",
    existingOrgId: "ORG-02",
  },
  {
    id: "DISC-05",
    name: "Summit Retail Cooperative",
    sector: "Retail",
    orgType: "organization",
    sizeBand: "unknown",
    text: "Member-owned retailer exploring a loyalty application. No public-sector, transit, or claims scope in the notes from the forum.",
    domain: "summitretail.coop",
    industry: "Retail",
    contact: { name: "Noah Patel", title: "IT Manager", email: "npatel@summitretail.coop", roleLevel: "influencer" },
    need: 8,
    timing: 4,
    whyNow: "No dated initiative. Conversation was exploratory.",
  },
];

const archivedOrganization: Organization = {
  id: "ORG-07",
  demo: true,
  archived: true,
  name: "Pinnacle Municipal Utilities",
  industry: "Utilities",
  channel: "Outbound",
  source: "Demonstration seed",
  score: 44,
  domain: "pinnacleutilities.gov",
  registryId: "",
  summary: "Municipal utility that paused a billing-portal inquiry. Kept in the archive so a new tenant can see reinstatement.",
  contacts: [{ name: "Ruth Keller", title: "IT Director", email: "rkeller@pinnacleutilities.gov" }],
  whyGoodFit: "Adjacent public-sector buyer, but the billing-portal scope did not match a current play.",
  scoreFactors: ["Low capability overlap with the seeded partner network."],
  scoreHistory: [{ score: 44, at: "2026-06-02", reason: "Initial discovery scoring." }],
  notes: [{ author: "J. Tran", date: "2026-07-18", text: "Archived after the utility deferred the portal project to the next budget cycle." }],
  pursuits: [],
};

const rfiOrganization: Organization = {
  id: "ORG-08",
  demo: true,
  name: "Westbridge Benefits Board",
  industry: "Government — Benefits",
  channel: "Solicitation",
  source: "Demonstration seed",
  score: 77,
  domain: "westbridgebenefits.gov",
  registryId: "UEI: W3B8WEST014",
  summary: "State benefits board gathering approaches for an eligibility portal before a 2027 RFP.",
  contacts: [{ name: "Amira Hassan", title: "Procurement Lead", email: "ahassan@westbridgebenefits.gov" }],
  whyGoodFit: "Eligibility and claims-adjacent scope lines up with the public-benefits play.",
  scoreFactors: [
    "RFI asks for eligibility portal discovery and a data migration approach.",
    "Prior benefits-platform experience is on file for Meridian Analytics and Union Systems Group.",
  ],
  scoreHistory: [{ score: 77, at: "2026-09-10", reason: "Scored when the RFI was added to the demonstration workspace." }],
  notes: [],
  pursuits: ["OPP-2302"],
};

const rfiSummary: RfiScopeSummary = {
  workType: "technical",
  objectiveConfidence: "Medium",
  procurementObjective: "Identify vendors who can replace the eligibility portal before a future RFP.",
  challengeThemes: [{
    theme: "Legacy eligibility rules",
    detail: "Rules are encoded in a 20-year-old portal that county staff cannot change without a release.",
    rootCause: true,
    evidence: "§2",
  }],
  consequences: ["Applicants abandon the portal before they finish an application."],
  endState: "A shortlist for a 2027 solicitation.",
  endStateConstraints: ["Written response limited to 15 pages."],
  nextStep: "Invite-only demonstrations in November 2026.",
  services: [{ service: "Eligibility portal discovery", type: "explicit", evidence: "§3", confidence: "High" }],
  gaps: ["Budget is not stated."],
  issuerQuestions: [],
  evaluationCriteria: ["Relevant public-benefits experience"],
  commercialTerms: ["No pricing form in this RFI."],
};

const rfiPursuit: Pursuit = {
  id: "OPP-2302",
  orgId: "ORG-08",
  name: "Eligibility Portal Discovery",
  typeLabel: "RFI",
  projectType: "rfi",
  solicitationRef: "RFI 26-014",
  lane: "B",
  score: 77,
  status: "Respond confirmed",
  rec: "go",
  confidence: 74,
  closed: false,
  dueDate: "2026-10-20",
  documents: [{ name: "RFI_26-014_Eligibility_Portal.pdf", kind: "solicitation" }],
  docSummary: {
    objective: ["Gather approaches for a statewide benefits eligibility portal."],
    challenges: ["Legacy eligibility rules are hard-coded in the current portal."],
    services: ["Eligibility portal discovery", "Data migration approach"],
    deliverables: ["Written RFI response", "Demonstration agenda"],
    rfi: rfiSummary,
  },
  rationale: [
    "The requested discovery work maps to public-benefits modernization experience.",
    "Budget and demonstration criteria are still open, so the response should state assumptions.",
  ],
  reqmap: [
    { req: "Eligibility portal discovery approach", status: "mapped", node: "CAP-0018 Legacy Modernization — Public Benefits", evidence: "Commonwealth and Fairhaven experience" },
    { req: "Data migration approach with stated assumptions", status: "mapped", node: "CAP-0044 Claims & Adjudication Systems", evidence: "Lead data architect on file" },
  ],
  gaps: [],
  rfund: { lane: "B", tier: "advisory", score: 22, note: "Discovery RFI. Limited new platform scope beyond the eligibility portal." },
  decisionRecord: {
    id: "DEC-88410",
    type: "D4 — Respond triage (RFI)",
    subject: "Project OPP-2302",
    model: "triage-v3 / prompt v1.9 / graph v214",
    reviewer: "J. Tran (Bid Manager)",
    action: "Confirmed Respond, 2026-09-12",
    retention: "3 years minimum",
  },
};

const archivedPartner: Partner = {
  id: "PTR-LEGACY",
  name: "Legacy Grid Consulting",
  type: "Subcontractor",
  website: "https://legacygrid.example",
  repo: "—",
  contact: "Imani Brooks",
  contactEmail: "ibrooks@legacygrid.example",
  status: "Archived",
  teamingAgreementSigned: true,
  accessTier: "task_only",
  covers: [],
  note: "Archived after the utility billing practice wound down.",
  summary: "Former subcontractor for municipal utility billing portals. Retained so the archive shows a partner with history.",
  createdAt: "2024-04-02",
};

function cloneGraph(graph: GraphData): GraphData {
  const copy = structuredClone(graph);
  copy.capabilities.push({
    id: "CAP-ARCH",
    name: "Municipal Utility Billing Portals",
    partners: ["PTR-LEGACY"],
    status: "Archived",
    updated: "2025-11-01",
  });
  copy.experience.push({
    id: "EXP-ARCH",
    name: "Pinnacle Municipal Utilities — Billing portal (2019–2021)",
    partners: ["PTR-LEGACY"],
    capabilities: ["CAP-ARCH"],
    technologies: ["Java", "Oracle"],
    services: ["Billing portal support"],
    industry: "Utilities",
    summary: "Maintained a municipal billing portal. The practice closed in 2025.",
    status: "Archived",
    updated: "2025-11-01",
  });
  copy.experience.push({
    id: "EXP-HARBOR",
    name: "Regional health network — Claims adjudication modernization (2023–2025)",
    partners: ["PTR-H", "PTR-U"],
    capabilities: ["CAP-0044", "CAP-0091"],
    technologies: ["PostgreSQL", "AWS"],
    services: ["Claims adjudication", "Healthcare data pipelines"],
    industry: "Healthcare",
    summary: "Replaced a legacy claims adjudication engine and the regulated data pipelines that feed it for a three-hospital network.",
    status: "Verified",
    updated: "2026-05-28",
  });
  copy.experience.push({
    id: "EXP-FARE",
    name: "Regional transit agency — Fare and payments integration (2024–2025)",
    partners: ["PTR-U", "PTR-M"],
    capabilities: ["CAP-0231", "CAP-0117"],
    technologies: ["GTFS", "EMV"],
    services: ["Fare payment integration", "Financial reconciliation"],
    industry: "Public Transit",
    summary: "Delivered contactless fare payment and daily reconciliation for a multi-county transit agency.",
    status: "Verified",
    updated: "2026-07-14",
  });
  return copy;
}

function solicitationsFor(play: Play): PlaySolicitation[] {
  const name = `${play.name} ${play.problem}`.toLowerCase();
  const rows: PlaySolicitation[] = [];
  if (/fare|payment|transit|reconciliation/.test(name)) {
    rows.push({
      solicitationId: "OPP-2201",
      issuer: "Cascade Regional Transit Authority",
      type: "RFP",
      date: "2026-08-14",
      outcome: "pending",
    });
  }
  if (/claim|healthcare|health|adjudication/.test(name)) {
    rows.push({
      solicitationId: "OPP-2214",
      issuer: "Harborview Health Network",
      type: "SOW",
      date: "2026-08-01",
      outcome: "pending",
    });
  }
  if (/legacy|benefits|fraud|labor|data migration|program management/.test(name)) {
    rows.push({
      solicitationId: "OPP-2219",
      issuer: "Meridian State Dept. of Labor",
      type: "RFP",
      date: "2026-08-22",
      outcome: "submitted",
    });
    rows.push({
      solicitationId: "EXP-0512",
      issuer: "Commonwealth Dept. of Labor",
      type: "RFP",
      date: "2022-03-01",
      outcome: "won",
    });
  }
  return rows;
}

function activatePlays(plays: Play[]): Play[] {
  return plays.map(play => {
    const solicitations = solicitationsFor(play);
    const bid = solicitations.filter(row => row.outcome !== "pending" && row.outcome !== "no-bid").length;
    const won = solicitations.filter(row => row.outcome === "won").length;
    return {
      ...play,
      status: "active" as const,
      approvedAt: SEEDED_AT,
      approvedBy: "Demonstration seed",
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
      solicitations,
      strength: {
        ...play.strength,
        solicitationsSeen: solicitations.length,
        bid,
        won,
        notes: play.proven
          ? "Seeded from the demonstration partner network."
          : play.strength.notes,
      },
    };
  });
}

function leadAction(total: number, existing: boolean): ImportedLead["action"] {
  if (existing) return "needs_review";
  if (total >= 60) return "add_to_pipeline";
  if (total >= 40) return "nurture";
  return "park";
}

function buildDiscovery(plays: Play[], pipeline: Organization[]): {
  leads: ImportedLead[];
  candidates: DiscoveryCandidate[];
} {
  const leads: ImportedLead[] = [];
  const candidates: DiscoveryCandidate[] = [];
  const relationship: RelationshipLevel = LIST_SETTINGS.relationshipLevel;

  for (const spec of DEMO_LEADS) {
    const fit = scoreFitAgainstPlays({
      orgName: spec.name,
      orgType: spec.orgType,
      sector: spec.sector,
      sizeBand: spec.sizeBand,
      orgText: spec.text,
      contactCount: 1,
      hasDecisionMaker: spec.contact.roleLevel === "decision-maker",
      hasInfluencer: spec.contact.roleLevel === "influencer",
      relationshipLevel: relationship,
      plays,
    });
    const opportunity = computeOpportunityScore({
      need: spec.need,
      timing: spec.timing,
      fitScore: fit.total,
    });
    const existing = pipeline.find(org => org.id === spec.existingOrgId);
    const lead: ImportedLead = {
      id: spec.id,
      originalName: spec.name,
      cleanedName: spec.name,
      status: "Enriched",
      action: leadAction(fit.total, Boolean(existing)),
      contacts: [{
        name: spec.contact.name,
        title: spec.contact.title,
        email: spec.contact.email,
        roleLevel: spec.contact.roleLevel,
      }],
      notes: spec.text,
      dateOfLastContact: "2026-09-08",
      listSettings: LIST_SETTINGS,
      identity: {
        canonicalName: spec.name,
        division: "",
        website: spec.domain,
        hqLocation: "",
        confidence: "High",
        needsConfirmation: false,
        notAnOrganization: false,
        duplicateOf: existing?.id ?? null,
        isPartner: false,
        isCustomer: false,
        excluded: false,
        excludedReason: existing ? "Already in the pipeline." : "",
      },
      identityConfidence: "High",
      orgType: spec.orgType,
      sector: spec.sector,
      sizeBand: spec.sizeBand,
      bestPlayId: fit.bestPlayId ?? undefined,
      bestPlayName: fit.bestPlayName ?? undefined,
      fitScore: fit,
      opportunityScore: opportunity.total,
      need: spec.need,
      timing: spec.timing,
      whyNow: spec.whyNow,
      relationshipOwner: LIST_SETTINGS.relationshipOwner,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    };
    leads.push(lead);

    const leadDraft: Organization | undefined = existing ? undefined : {
      id: `ORG-${spec.id}`,
      demo: true,
      name: spec.name,
      industry: spec.industry,
      channel: "Discovery",
      source: "Demonstration seed",
      score: fit.total,
      domain: spec.domain,
      registryId: "",
      summary: spec.text,
      contacts: [{ name: spec.contact.name, title: spec.contact.title, email: spec.contact.email }],
      whyGoodFit: fit.bestPlayName ? `Play match: ${fit.bestPlayName}.` : "No play match in the seeded network.",
      scoreFactors: Object.entries(fit.reasons).map(([key, value]) => `${key}: ${value}`),
      scoreHistory: [{ score: fit.total, at: SEEDED_DAY, reason: "Seeded Search & Discovery fit score." }],
      notes: [{ author: LIST_SETTINGS.relationshipOwner, date: SEEDED_DAY, text: spec.whyNow }],
      pursuits: [],
    };

    candidates.push({
      id: spec.id,
      org: spec.name,
      industry: spec.industry,
      signal: spec.whyNow,
      source: "Demonstration seed",
      score: fit.total,
      opportunityScore: opportunity.total,
      updated: SEEDED_DAY,
      domain: spec.domain,
      factors: Object.entries(fit.reasons).map(([key, value]) => `${key}: ${value}`),
      channelLens: "direct",
      existingAccountId: existing?.id,
      existingReason: existing ? `${spec.name} is already in the pipeline.` : undefined,
      leadDraft,
    });
  }

  return { leads, candidates };
}

export function buildTenantSeed(): WorkspaceState {
  const organizations: Organization[] = [
    ...structuredClone(baseOrganizations),
    archivedOrganization,
    rfiOrganization,
  ];
  const pursuits: Record<string, Pursuit> = {
    ...structuredClone(basePursuits),
    [rfiPursuit.id]: rfiPursuit,
  };
  const partners: Partner[] = [...structuredClone(partnerDirectory), archivedPartner];
  const graph = cloneGraph(graphData);
  const plays = activatePlays(buildPlaysFromPartners({
    partners: partners.filter(partner => partner.status !== "Archived").map(partner => ({
      id: partner.id,
      name: partner.name,
      type: partner.type,
    })),
    capabilities: graph.capabilities,
    experiences: graph.experience,
    credentials: graph.credentials,
    people: graph.people,
  }));
  const discoveryBuild = buildDiscovery(plays, organizations);
  const leadImport: LeadImportBatch = {
    id: "IMP-BATCH-DEMO",
    name: "Public Sector Modernization Forum",
    settings: LIST_SETTINGS,
    leads: discoveryBuild.leads,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  };

  return {
    organizations,
    pursuits,
    partners,
    graph,
    plays,
    leadImports: [leadImport],
    discovery: discoveryBuild.candidates,
  };
}

export function describeTenantSeed(seed: WorkspaceState = buildTenantSeed()): string[] {
  const pursuitList = Object.values(seed.pursuits);
  const projectTypes = ["rfp", "rfi", "sow"].filter(type =>
    pursuitList.some(pursuit => (pursuit.projectType ?? (pursuit.lane === "C" ? "sow" : "rfp")) === type),
  );
  const activeOrgs = seed.organizations.filter(org => !org.archived);
  const activePartners = seed.partners.filter(partner => partner.status !== "Archived");
  return [
    `Search & Discovery: ${seed.plays?.length ?? 0} plays, ${seed.discovery?.length ?? 0} candidates, ${seed.leadImports?.length ?? 0} lead list`,
    `Pipeline: ${activeOrgs.length} organizations`,
    `Partner network: ${activePartners.length} partners`,
    `Opportunities: ${pursuitList.length} (${projectTypes.join(", ")})`,
    `Capability sources: ${seed.graph.capabilities.filter(item => item.status !== "Archived").length} capabilities, ${seed.graph.experience.filter(item => item.status !== "Archived").length} experience records, ${seed.graph.credentials.length} credentials, ${seed.graph.people.length} people`,
    `Archive: ${seed.organizations.filter(org => org.archived).length} leads, ${seed.partners.filter(partner => partner.status === "Archived").length} partners`,
    `Response Builder: ${pursuitList.filter(pursuit => pursuit.rec === "go" && !pursuit.closed).length} confirmed pursuits`,
  ];
}
