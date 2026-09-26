/**
 * Mock data layer — mirrors the UI POV's demonstration dataset.
 * Will be replaced by real DB queries as phases complete.
 */

export interface Organization {
  id: string;
  name: string;
  industry: string;
  channel: string;
  source?: string;
  score: number;
  domain: string;
  registryId: string;
  summary: string;
  contacts: Contact[];
  whyGoodFit: string;
  scoreFactors: string[];
  scoreHistory: ScoreHistory[];
  notes: Note[];
  pursuits: string[];
  archived?: boolean;
}

export interface Contact {
  name: string;
  title: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  linkedinUrl?: string;
  connectedOn?: string;
}

export interface ScoreHistory {
  score: number;
  at: string;
  reason: string;
}

export interface Note {
  author: string;
  date: string;
  text: string;
}

export interface PursuitDocument {
  name: string;
  kind?: "solicitation" | "sow" | "addendum" | "other";
  mime?: string;
  sizeBytes?: number;
  extractedChars?: number;
  parseStatus?: "extracted" | "empty" | "unsupported";
}

export interface PursuitScoreBreakdown {
  projectType: "rfp" | "rfi" | "sow";
  capabilityAlignment: number;
  intentTiming: number;
  accountValueFit: number;
  inboundIntentUplift: number;
  coveragePct: number;
  mappedCount: number;
  totalRequirements: number;
  documentOverlapCount: number;
  goScoreFloor: number;
  goCoverageFloor: number;
  condScoreFloor: number;
  condCoverageFloor: number;
  passFailBlocked: boolean;
  recRule: string;
  detectedFromDocument?: boolean;
  typeOverridden?: boolean;
}

export interface Pursuit {
  id: string;
  orgId: string;
  name: string;
  typeLabel: string;
  projectType?: "rfp" | "rfi" | "sow";
  solicitationRef: string;
  lane: "B" | "C";
  score: number;
  status: string;
  rec: "go" | "nogo" | "cond" | "pending";
  confidence: number;
  confidenceNote?: string;
  scoreBreakdown?: PursuitScoreBreakdown;
  closed: boolean;
  dueDate: string | null;
  documents: PursuitDocument[];
  sourceText?: string;
  sourceTextTruncated?: boolean;
  triageMode?: "model" | "heuristic" | "pending";
  docSummary: {
    objective: string[];
    challenges?: string[];
    services: string[];
    deliverables: string[];
    responseConstraints?: string[];
  };
  informationRequests?: string[];
  rationale: string[];
  reqmap: RequirementMapping[];
  gaps: GapItem[];
  rfund: { lane: string; tier: string; score: number; note: string };
  decisionRecord: {
    id: string;
    type: string;
    subject: string;
    model: string;
    reviewer: string;
    action: string;
    retention: string;
  };
  responseActionItems?: ResponseActionItem[];
  rfiResponse?: RfiResponseMeta;
  complianceMatrix?: { ref: string; title: string; sectionId: string }[];
  draftStatus?: "In Draft" | "Submitted" | "On Hold" | "Canceled";
  draftStatusDate?: string;
  outcome?: "Won" | "Lost" | "Postponed" | "Canceled";
  outcomeDate?: string;
}

export interface RequirementMapping {
  req: string;
  status: "mapped" | "unmapped";
  node: string | null;
  evidence: string;
}

export interface GapItem {
  id: string;
  title: string;
  crit: string;
  demand: string;
  closure: string;
}

export interface RfiGapLogItem {
  id: string;
  location: string;
  gapType: string;
  description: string;
  owner: string;
  priority: "High" | "Medium" | "Low";
  dueAt: string;
  status: "Open" | "In progress" | "Resolved";
  notes: string;
}

export interface RfiResponseMeta {
  reviewerSummary: string;
  strategicNotes: string;
  questions: string[];
  compliance: { requirement: string; rfiRef: string; responseSection: string; owner: string; status: string }[];
  gaps: RfiGapLogItem[];
}

export interface ResponseActionItem {
  id: string;
  kind: string;
  description: string;
  expectedResponseType: string;
  relatedSection: string;
  assignedPartnerId: string | null;
  assignedInternal: string | null;
  dueAt: string;
  status: string;
  gates: string[];
  responseContent: string;
  responseDocument: { name: string } | null;
}

export interface Partner {
  id: string;
  name: string;
  type: string;
  website: string;
  repo: string;
  contact: string;
  contactEmail: string;
  status: string;
  teamingAgreementSigned: boolean | null;
  accessTier: string | null;
  covers: string[];
  note: string;
  summary: string;
  createdAt: string;
  _sharedCapIds?: string[];
  _sharedExpIds?: string[];
}

export interface GraphData {
  capabilities: GraphCapability[];
  experience: GraphExperience[];
  credentials: GraphCredential[];
  people: GraphPerson[];
}

export interface GraphCapability {
  id: string;
  name: string;
  partners: string[];
  status: string;
  updated: string;
}

export interface GraphExperience {
  id: string;
  name: string;
  partners: string[];
  capabilities: string[];
  technologies: string[];
  services: string[];
  industry: string;
  summary: string;
  status: string;
  updated: string;
}

export interface GraphCredential {
  id: string;
  name: string;
  credType: string;
  partner: string;
  scope: string;
  expiration: string;
  status: string;
  updated: string;
  documentText: string;
  documentFileName: string;
}

export interface GraphPerson {
  id: string;
  name: string;
  partner: string;
  role: string;
  roles: string[];
  skills: string[];
  technologies: string[];
  expertise: string;
  industries: string[];
  projectHistory: string[];
  status: string;
  updated: string;
  resumeText: string;
  resumeFileName: string;
}

export interface SearchResult {
  id: string;
  org: string;
  industry: string;
  signal: string;
  source: string;
  score: number;
  updated: string;
}

export const organizations: Organization[] = [
  {
    id: "ORG-01", name: "Cascade Regional Transit Authority", industry: "Public Transit", channel: "Solicitation", score: 68,
    domain: "cascadetransit.gov", registryId: "UEI: F4K9XCASC001",
    summary: "Regional transit authority operating bus and light rail across three counties; board approved a multi-year fare and payments modernization budget in Q2.",
    contacts: [{ name: "Elena Morais", title: "VP Technology", email: "emorais@cascadetransit.gov" }],
    whyGoodFit: "Strong capability match on fare systems integration; multi-year budget signals durable, not one-off, work.",
    scoreFactors: [
      "Strong match on Fare & Payments Integration and Financial Reconciliation capability.",
      "Board-approved multi-year modernization budget confirmed in public minutes (high-confidence signal).",
      "Two requirements on the current RFP remain unmapped, including a pass/fail FedRAMP gap.",
    ],
    scoreHistory: [
      { score: 61, at: "2026-07-02", reason: "Initial discovery scoring — board budget signal not yet confirmed." },
      { score: 68, at: "2026-08-14", reason: "Refreshed after board minutes confirmed the modernization budget." },
    ],
    notes: [{ author: "J. Tran", date: "2026-08-14", text: "Board minutes reference a second modernization phase for depot operations — worth tracking as a future SOW." }],
    pursuits: ["OPP-2201", "OPP-2150"],
  },
  {
    id: "ORG-02", name: "Harborview Health Network", industry: "Healthcare", channel: "Direct inquiry", score: 84,
    domain: "harborview.org", registryId: "UEI: H8V2HARB014",
    summary: "Regional health network with three hospital campuses. Claims and adjudication modernization is the current priority.",
    contacts: [
      { name: "Marcus Field", title: "VP Digital Transformation", email: "mfield@harborview.org" },
      { name: "Ann Okafor", title: "Director, Member Experience", email: "aokafor@harborview.org" },
    ],
    whyGoodFit: "Two simultaneous SOWs — a durable relationship rather than a single transaction.",
    scoreFactors: [
      "Strong match on Claims & Adjudication Systems and Regulated Healthcare Data Pipelines capability.",
      "Two simultaneous SOWs in motion — recurring-relationship signal.",
      "Direct inbound relationship with no competitive procurement risk.",
    ],
    scoreHistory: [
      { score: 79, at: "2026-06-11", reason: "Initial scoring on first SOW inquiry." },
      { score: 84, at: "2026-08-01", reason: "Refreshed after second SOW confirmed a durable relationship." },
    ],
    notes: [],
    pursuits: ["OPP-2214", "OPP-2215"],
  },
  {
    id: "ORG-03", name: "Meridian State Dept. of Labor", industry: "Government — Labor & Workforce", channel: "Solicitation", score: 91,
    domain: "meridian.state.gov", registryId: "UEI: M3R1MERI077",
    summary: "State department of labor responsible for unemployment insurance administration statewide.",
    contacts: [{ name: "Renata Sung", title: "Director of IT Modernization", email: "rsung@meridian.state.gov" }],
    whyGoodFit: "Direct precedent from the Commonwealth engagement; key personnel available.",
    scoreFactors: [
      "Near-direct match on Legacy Modernization and Benefits Fraud Analytics capability.",
      "Direct precedent from the completed Commonwealth engagement.",
      "Two proposed key personnel have a documented prior working relationship.",
    ],
    scoreHistory: [
      { score: 88, at: "2026-07-20", reason: "Initial scoring on solicitation release." },
      { score: 91, at: "2026-08-22", reason: "Refreshed after key-personnel evidence confirmed." },
    ],
    notes: [],
    pursuits: ["OPP-2219"],
  },
  {
    id: "ORG-04", name: "Northfield Logistics Group", industry: "Logistics & Transportation", channel: "Outbound", score: 74,
    domain: "", registryId: "", summary: "", contacts: [], whyGoodFit: "",
    scoreFactors: [], scoreHistory: [{ score: 74, at: "2026-09-02", reason: "Initial discovery scoring." }], notes: [], pursuits: [],
  },
  {
    id: "ORG-05", name: "BrightPath Underwriters", industry: "Insurance", channel: "Inbound", score: 61,
    domain: "", registryId: "", summary: "", contacts: [], whyGoodFit: "",
    scoreFactors: [], scoreHistory: [{ score: 61, at: "2026-09-05", reason: "Initial scoring on inbound enquiry." }], notes: [], pursuits: [],
  },
  {
    id: "ORG-06", name: "Anchor Peak Credit Union", industry: "Financial Services", channel: "Partner", score: 79,
    domain: "", registryId: "", summary: "", contacts: [],
    whyGoodFit: "Introduced by NorthPeak Transit Systems; adjacent core-banking integration need.",
    scoreFactors: [], scoreHistory: [{ score: 79, at: "2026-09-08", reason: "Initial scoring on partner introduction." }], notes: [], pursuits: [],
  },
];

export const pursuits: Record<string, Pursuit> = {
  "OPP-2201": {
    id: "OPP-2201", orgId: "ORG-01", name: "Fare Systems Modernization", typeLabel: "RFP", projectType: "rfp", solicitationRef: "RFP 24-118",
    lane: "B", score: 68, status: "Triage complete", rec: "nogo", confidence: 64, closed: false, dueDate: "2026-10-02",
    documents: [{ name: "RFP_24-118_Base.pdf" }, { name: "Amendment_1_Addendum.pdf" }, { name: "Vendor_QA_Responses.pdf" }],
    docSummary: {
      objective: ["Modernize the agency's fare collection and payments infrastructure system-wide.", "Improve reconciliation accuracy and reduce manual settlement effort."],
      services: ["Contactless/EMV fare payment integration", "Live GTFS-realtime / AVL feed integration", "FedRAMP Moderate hosting for the payments layer"],
      deliverables: ["Production fare payment platform, phased rollout across 3 counties", "Reconciliation and reporting dashboard", "12 months post-launch support"],
    },
    rationale: [
      "Two evaluation requirements could not be mapped to a consortium-owned or partner-covered capability node.",
      "One unmapped requirement (FedRAMP Moderate ATO) is a pass/fail evaluation criterion — sufficient to drive a No-Go.",
      "Key personnel availability is otherwise sufficient for the proposed period of performance.",
    ],
    reqmap: [
      { req: "Contactless fare payment integration, EMV-compliant", status: "mapped", node: "CAP-0231 Fare & Payments Integration", evidence: "3 experience nodes, consortium-owned" },
      { req: "Live GTFS-realtime / AVL feed integration, 2+ prior deployments", status: "unmapped", node: null, evidence: "No matching node at required maturity" },
      { req: "FedRAMP Moderate Authorization to Operate, production reference", status: "unmapped", node: null, evidence: "Pass/fail criterion — no consortium or partner node" },
      { req: "Transit fare reconciliation reporting", status: "mapped", node: "CAP-0117 Financial Reconciliation Systems", evidence: "2 experience nodes, consortium-owned" },
    ],
    gaps: [
      { id: "GAP-114", title: "FedRAMP Moderate Authorization to Operate (ATO)", crit: "Pass/fail criterion", demand: "3 solicitations in 90 days", closure: "Partner or 12+ months to build" },
      { id: "GAP-089", title: "Live GTFS-realtime / AVL feed integration", crit: "Scored preference — 15 of 100 pts", demand: "5 solicitations in 90 days", closure: "Partner or new hire" },
    ],
    rfund: { lane: "B", tier: "advisory", score: 38, note: "Mostly configuration/integration scope — limited platform-advancement content identified." },
    decisionRecord: { id: "DEC-88213", type: "D4 — Go/No-Go triage (RFP-01, RFP-03)", subject: "Project OPP-2201", model: "triage-v3 / prompt v1.9 / graph v212", reviewer: "—  not yet confirmed", action: "Recommendation generated, awaiting human confirmation", retention: "3 years minimum (bid-defensibility class)" },
  },
  "OPP-2150": {
    id: "OPP-2150", orgId: "ORG-01", name: "Real-Time Passenger Information System", typeLabel: "RFP", projectType: "rfp", solicitationRef: "RFP 24-062",
    lane: "B", score: 41, status: "No-Go confirmed — closed", rec: "nogo", confidence: 81, closed: true, dueDate: null,
    documents: [{ name: "RFP_24-062_Base.pdf" }],
    docSummary: { objective: ["Deploy real-time arrival signage across 400 transit shelters."], services: ["Digital signage hardware + real-time feed integration"], deliverables: ["Hardware install across 400 sites", "Feed integration platform"] },
    rationale: ["Hardware deployment and field install scope fell outside consortium capability entirely."],
    reqmap: [{ req: "Physical signage hardware installation, 400 sites", status: "unmapped", node: null, evidence: "Outside consortium scope" }],
    gaps: [{ id: "GAP-051", title: "Physical hardware installation at scale", crit: "Core scope requirement", demand: "1 solicitation", closure: "Not a fit for consortium model" }],
    rfund: { lane: "B", tier: "advisory", score: 12, note: "Field hardware/install scope — negligible funding relevance." },
    decisionRecord: { id: "DEC-86110", type: "D4 — Go/No-Go triage", subject: "Project OPP-2150", model: "triage-v2 / prompt v1.6 / graph v188", reviewer: "J. Tran (Bid Manager)", action: "Confirmed NO-GO, 2026-05-09", retention: "3 years minimum" },
  },
  "OPP-2214": {
    id: "OPP-2214", orgId: "ORG-02", name: "Claims Platform Modernization", typeLabel: "SOW", projectType: "sow", solicitationRef: "Direct SOW",
    lane: "C", score: 84, status: "Go confirmed", rec: "go", confidence: 88, closed: false, dueDate: null,
    documents: [{ name: "Harborview_SOW_ClaimsModernization_v3.docx" }, { name: "Data_Processing_Addendum.pdf" }],
    docSummary: {
      objective: ["Replace the legacy claims adjudication system with a cloud-native platform.", "Reduce average claim processing time."],
      services: ["Claims adjudication engine modernization", "HIPAA-compliant data pipeline redesign"],
      deliverables: ["Production claims platform", "Data migration from legacy system, zero data loss", "Staff training and cutover plan"],
    },
    rationale: ["All stated scope items map to consortium-owned capability.", "No claim-adverse terms flagged.", "Key personnel bench has capacity."],
    reqmap: [
      { req: "Claims adjudication engine modernization", status: "mapped", node: "CAP-0044 Claims & Adjudication Systems", evidence: "5 experience nodes, consortium-owned" },
      { req: "HIPAA-compliant data pipeline redesign", status: "mapped", node: "CAP-0091 Regulated Healthcare Data Pipelines", evidence: "3 experience nodes, consortium-owned" },
    ],
    gaps: [],
    rfund: { lane: "C", tier: "full", score: 71, note: "Claims-adjudication modernization touches core-engine consent-routing and cross-network signal processing (H1/H2)." },
    decisionRecord: { id: "DEC-88190", type: "D4 — Go/No-Go triage (SOW lens)", subject: "Project OPP-2214", model: "triage-v3 / prompt v1.9 / graph v211", reviewer: "M. Alvarez (Commercial Lead)", action: "Confirmed Go, 09/03", retention: "3 years minimum" },
  },
  "OPP-2215": {
    id: "OPP-2215", orgId: "ORG-02", name: "Patient Portal Redesign", typeLabel: "SOW", projectType: "sow", solicitationRef: "Direct SOW",
    lane: "C", score: 76, status: "Triage complete", rec: "go", confidence: 79, closed: false, dueDate: null,
    documents: [{ name: "Harborview_SOW_PatientPortal_draft.docx" }],
    docSummary: {
      objective: ["Redesign the member-facing patient portal for accessibility and self-service scheduling."],
      services: ["Patient portal UX redesign", "Self-service scheduling integration"],
      deliverables: ["Redesigned portal, WCAG 2.2 AA compliant", "Scheduling integration with existing EHR"],
    },
    rationale: ["Scope maps cleanly to existing digital-experience capability.", "Runs concurrently with Claims Platform — same account team."],
    reqmap: [{ req: "Patient portal UX redesign, WCAG 2.2 AA", status: "mapped", node: "CAP-0091 Regulated Healthcare Data Pipelines", evidence: "1 adjacent experience node" }],
    gaps: [],
    rfund: { lane: "C", tier: "full", score: 24, note: "Primarily client-specific UX/config work — low platform-advancement content." },
    decisionRecord: { id: "DEC-88350", type: "D4 — Go/No-Go triage", subject: "Project OPP-2215", model: "triage-v3 / prompt v1.9 / graph v213", reviewer: "—  not yet confirmed", action: "Recommendation generated, awaiting human confirmation", retention: "3 years minimum" },
  },
  "OPP-2219": {
    id: "OPP-2219", orgId: "ORG-03", name: "Unemployment Insurance Modernization", typeLabel: "RFP", projectType: "rfp", solicitationRef: "RFP SOL-24-0441",
    lane: "B", score: 91, status: "Go confirmed — drafting", rec: "go", confidence: 92, closed: false, dueDate: "2026-09-28",
    documents: [{ name: "SOL-24-0441_Base.pdf" }, { name: "Technical_Appendix_A.pdf" }, { name: "Pricing_Schedule.xlsx" }],
    docSummary: {
      objective: ["Retire the 30-year-old mainframe unemployment claims system.", "Reduce fraud losses through modern analytics."],
      services: ["Legacy mainframe claims migration", "Fraud detection and adjudication analytics"],
      deliverables: ["Production claims platform, statewide rollout", "Fraud analytics dashboard", "Data migration with zero-loss cutover"],
    },
    rationale: [
      "All stated requirements map to consortium-owned capability at sufficient maturity.",
      "Prior working relationship exists between two proposed key personnel.",
      "No teaming requirement raised to Lane D.",
    ],
    reqmap: [
      { req: "Legacy mainframe claims migration", status: "mapped", node: "CAP-0018 Legacy Modernization — Public Benefits", evidence: "4 experience nodes, consortium-owned" },
      { req: "Fraud detection and adjudication analytics", status: "mapped", node: "CAP-0126 Benefits Fraud Analytics", evidence: "2 experience nodes, consortium-owned" },
    ],
    gaps: [],
    complianceMatrix: [
      { ref: "Vol I § 3.2", title: "Technical Approach", sectionId: "tech" },
      { ref: "Vol I § 3.4", title: "Past Performance", sectionId: "past" },
      { ref: "Vol I § 3.5", title: "Key Personnel", sectionId: "pers" },
      { ref: "Vol I § 3.6", title: "Management Plan", sectionId: "mgmt" },
    ],
    responseActionItems: [
      { id: "RAI-01", kind: "missing_info", description: "Confirm Priya Nandakumar's availability start date.", expectedResponseType: "text", relatedSection: "pers", assignedPartnerId: "PTR-U", assignedInternal: null, dueAt: "2026-09-20", status: "Open", gates: ["proposal_section:pers"], responseContent: "", responseDocument: null },
      { id: "RAI-02", kind: "missing_info", description: "Provide an updated E&O certificate.", expectedResponseType: "file", relatedSection: "mgmt", assignedPartnerId: "PTR-U", assignedInternal: null, dueAt: "2026-09-18", status: "Open", gates: ["proposal_section:mgmt"], responseContent: "", responseDocument: null },
      { id: "RAI-03", kind: "other", description: "Subcontracting plan percentage breakdown not yet finalized.", expectedResponseType: "text", relatedSection: "mgmt", assignedPartnerId: null, assignedInternal: "M. Alvarez", dueAt: "2026-09-22", status: "Open", gates: ["proposal_section:mgmt"], responseContent: "", responseDocument: null },
    ],
    rfund: { lane: "B", tier: "advisory", score: 19, note: "Legacy migration against a well-established pattern — largely replication, not new technical uncertainty." },
    decisionRecord: { id: "DEC-87990", type: "D4 — Go/No-Go triage", subject: "Project OPP-2219", model: "triage-v3 / prompt v1.8 / graph v204", reviewer: "J. Tran (Bid Manager)", action: "Confirmed Go, 08/22", retention: "3 years minimum" },
  },
};

export const partnerDirectory: Partner[] = [
  { id: "PTR-U", name: "Union Systems Group", type: "Prime", website: "https://unionsystemsgroup.com", repo: "https://drive.google.com/drive/folders/union-systems-shared", contact: "Priya Nandakumar", contactEmail: "priya.nandakumar@unionsystemsgroup.com", status: "Active", teamingAgreementSigned: null, accessTier: null, covers: [], note: "", summary: "Consortium prime for public-sector modernization and claims platforms.", createdAt: "2025-11-04" },
  { id: "PTR-M", name: "Meridian Analytics", type: "Prime", website: "https://meridiananalytics.io", repo: "https://drive.google.com/drive/folders/meridian-shared", contact: "Owen Fitzgerald", contactEmail: "owen.fitzgerald@meridiananalytics.io", status: "Active", teamingAgreementSigned: null, accessTier: null, covers: [], note: "", summary: "Analytics partner focused on fraud detection and financial reconciliation.", createdAt: "2025-12-12" },
  { id: "PTR-H", name: "Harbor Digital", type: "Prime", website: "https://harbordigital.com", repo: "https://github.com/harbor-digital/shared-capability-docs", contact: "Ann Okafor", contactEmail: "ann.okafor@harbordigital.com", status: "Active", teamingAgreementSigned: null, accessTier: null, covers: [], note: "", summary: "Healthcare data and digital-experience delivery partner.", createdAt: "2026-01-18" },
  { id: "PTR-CIRRUS", name: "Cirrus Federal Compliance Partners", type: "Subcontractor", website: "https://cirrusfederal.com", repo: "—", contact: "Lena Ortiz", contactEmail: "lena.ortiz@cirrusfederal.com", status: "Active", teamingAgreementSigned: true, accessTier: "self_service_roster", covers: ["GAP-114"], note: "FedRAMP Moderate ATO, 4 production authorizations", summary: "FedRAMP Moderate ATO, 4 production authorizations.", createdAt: "2026-03-02" },
  { id: "PTR-NORTHPEAK", name: "NorthPeak Transit Systems", type: "Subcontractor", website: "https://northpeaktransit.com", repo: "—", contact: "Chris Vale", contactEmail: "chris.vale@northpeaktransit.com", status: "Active", teamingAgreementSigned: false, accessTier: "task_only", covers: ["GAP-089"], note: "GTFS-realtime / AVL integration, 3 prior transit deployments", summary: "GTFS-realtime / AVL integration, 3 prior transit deployments.", createdAt: "2026-04-21" },
  { id: "PTR-ALLUVIA", name: "Alluvia Data Partners", type: "Subcontractor", website: "—", repo: "—", contact: "Maya Chen", contactEmail: "maya.chen@alluviadata.com", status: "Active", teamingAgreementSigned: false, accessTier: "task_only", covers: ["GAP-089"], note: "AVL integration, 1 prior deployment", summary: "AVL integration specialist with one prior transit deployment.", createdAt: "2026-06-09" },
];

export const graphData: GraphData = {
  capabilities: [
    { id: "CAP-0231", name: "Fare & Payments Integration", partners: ["PTR-U"], status: "Verified", updated: "2026-07-14" },
    { id: "CAP-0117", name: "Financial Reconciliation Systems", partners: ["PTR-M", "PTR-U"], status: "Verified", updated: "2026-06-02" },
    { id: "CAP-0044", name: "Claims & Adjudication Systems", partners: ["PTR-U"], status: "Verified", updated: "2026-05-28" },
    { id: "CAP-0091", name: "Regulated Healthcare Data Pipelines", partners: ["PTR-H"], status: "Verified", updated: "2026-05-28" },
    { id: "CAP-0018", name: "Legacy Modernization — Public Benefits", partners: ["PTR-U"], status: "Verified", updated: "2026-04-11" },
    { id: "CAP-0126", name: "Benefits Fraud Analytics", partners: ["PTR-M"], status: "Verified", updated: "2026-04-11" },
  ],
  experience: [
    { id: "EXP-0512", name: "Commonwealth Dept. of Labor — Claims Migration (2022–2024)", partners: ["PTR-U"], capabilities: ["CAP-0018", "CAP-0044"], technologies: ["COBOL migration tooling", "AWS GovCloud", "PostgreSQL"], services: ["Program Management", "Data Migration", "Testing"], industry: "Government — Labor & Workforce", summary: "Retired a 25-year COBOL claims mainframe, migrating 4.2M historical records to AWS GovCloud with a zero-downtime cutover across three regional processing centers.", status: "Verified", updated: "2026-03-02" },
    { id: "EXP-0513", name: "Commonwealth Dept. of Labor — Post-launch performance metrics", partners: ["PTR-U"], capabilities: ["CAP-0018"], technologies: ["AWS GovCloud", "Grafana"], services: ["Change Management", "Performance Monitoring"], industry: "Government — Labor & Workforce", summary: "Stood up post-launch operational metrics and a Grafana performance dashboard used by the agency's claims operations team.", status: "Verified", updated: "2026-03-02" },
    { id: "EXP-0514", name: "State of Alder Bay — Legacy mainframe retirement", partners: ["PTR-U", "PTR-M"], capabilities: ["CAP-0018", "CAP-0117"], technologies: ["COBOL migration tooling", "Azure Government"], services: ["Program Management", "Data Migration", "Financial Reconciliation"], industry: "Government", summary: "Joint retirement of a statewide mainframe with reconciliation of legacy financial ledgers onto Azure Government.", status: "Verified", updated: "2025-11-19" },
    { id: "EXP-0515", name: "Fairhaven County — Benefits platform migration", partners: ["PTR-M"], capabilities: ["CAP-0117", "CAP-0126"], technologies: ["Databricks", "Azure Government"], services: ["Fraud Analytics", "Testing"], industry: "Government — Benefits", summary: "County benefits platform migration with fraud-analytics overlays on Databricks; pending re-validation of production metrics.", status: "Pending re-validation", updated: "2025-08-30" },
  ],
  credentials: [
    { id: "CRED-021", name: "FedRAMP Moderate ATO", credType: "Certification", partner: "PTR-CIRRUS", scope: "Cloud hosting authorization, payments workloads", expiration: "2027-04-30", status: "Partner-contributed", updated: "2026-08-01", documentFileName: "Cirrus_FedRAMP_Moderate_ATO.pdf", documentText: "Authorization to Operate at FedRAMP Moderate for Cirrus Federal cloud hosting of payments workloads. Four production authorizations on file. Expires 2027-04-30." },
    { id: "CRED-014", name: "CMMI Level 3 (Services)", credType: "Certification", partner: "PTR-U", scope: "Software services delivery maturity", expiration: "2027-01-15", status: "Verified", updated: "2026-01-15", documentFileName: "USG_CMMI_L3_Services.pdf", documentText: "CMMI Institute appraisal confirming Union Systems Group at Maturity Level 3 for Services. Scope: software services delivery. Valid through 2027-01-15." },
    { id: "CRED-030", name: "Errors & Omissions Insurance", credType: "Insurance", partner: "PTR-U", scope: "$5M per occurrence", expiration: "2027-02-01", status: "Verified", updated: "2026-02-01", documentFileName: "USG_EO_Certificate.pdf", documentText: "Errors & Omissions liability insurance certificate. Coverage: $5,000,000 per occurrence. Named insured: Union Systems Group. Expiration: 2027-02-01." },
    { id: "CRED-031", name: "Cyber Liability Insurance", credType: "Insurance", partner: "PTR-M", scope: "$3M per occurrence", expiration: "2026-12-01", status: "Verified", updated: "2025-12-01", documentFileName: "Meridian_Cyber_Liability.pdf", documentText: "Cyber liability insurance certificate. Coverage: $3,000,000 per occurrence. Named insured: Meridian Analytics. Expiration: 2026-12-01." },
    { id: "CRED-032", name: "Performance Bond Capacity", credType: "Bonding", partner: "PTR-U", scope: "Up to $10M per engagement", expiration: "2027-06-01", status: "Verified", updated: "2026-06-01", documentFileName: "USG_Performance_Bond_Capacity.pdf", documentText: "Surety letter confirming performance bond capacity up to $10,000,000 per engagement for Union Systems Group. Valid through 2027-06-01." },
  ],
  people: [
    { id: "PPL-118", name: "Dana Whitfield, PMP", partner: "PTR-U", role: "Program Manager", roles: ["Program Manager"], skills: ["Program management", "Stakeholder management"], technologies: ["MS Project", "Jira", "AWS GovCloud"], expertise: "12 years leading public-sector modernization programs.", industries: ["Government", "Public Benefits"], projectHistory: ["EXP-0512", "EXP-0513"], status: "Verified", updated: "2026-07-01", resumeFileName: "Dana_Whitfield_Resume.pdf", resumeText: "Dana Whitfield, PMP\nProgram Manager\n12 years leading public-sector modernization programs.\nRoles: Program Manager.\nExpertise: stakeholder management, schedule control, multi-vendor governance.\nIndustries: Government, Public Benefits.\nPrior: Commonwealth Dept. of Labor claims migration (PM)." },
    { id: "PPL-119", name: "Priya Nandakumar", partner: "PTR-U", role: "Lead Data Architect", roles: ["Lead Data Architect"], skills: ["Data architecture", "Migration design", "ETL pipelines"], technologies: ["PostgreSQL", "Databricks", "AWS GovCloud"], expertise: "Architected the data migration approach on two completed legacy mainframe retirements.", industries: ["Government", "Public Benefits"], projectHistory: ["EXP-0512", "EXP-0514"], status: "Verified", updated: "2026-06-20", resumeFileName: "Priya_Nandakumar_Resume.pdf", resumeText: "Priya Nandakumar\nLead Data Architect\nArchitected the data migration approach on two completed legacy mainframe retirements.\nRoles: Lead Data Architect.\nExpertise: data architecture, ETL pipelines, COBOL-to-cloud migration.\nTechnologies: PostgreSQL, Databricks, AWS GovCloud.\nIndustries: Government, Public Benefits." },
    { id: "PPL-120", name: "Marcus Webb", partner: "PTR-U", role: "QA & Compliance Lead", roles: ["QA & Compliance Lead"], skills: ["Test automation", "Compliance validation"], technologies: ["Selenium", "WCAG tooling"], expertise: "Led certification testing for production release on the Commonwealth engagement.", industries: ["Government"], projectHistory: ["EXP-0512"], status: "Verified", updated: "2026-06-20", resumeFileName: "Marcus_Webb_Resume.pdf", resumeText: "Marcus Webb\nQA & Compliance Lead\nLed certification testing for production release on the Commonwealth engagement.\nRoles: QA & Compliance Lead.\nExpertise: test automation, compliance validation, WCAG accessibility.\nIndustries: Government." },
  ],
};

export const searchResults: SearchResult[] = [
  { id: "sr1", org: "Alder Bay Transit Authority", industry: "Public Transit", signal: "RFI issued for fare-collection modernization, response due in 6 weeks", source: "Agency procurement portal", score: 71, updated: "2 hours ago" },
  { id: "sr2", org: "Fenwick Mutual Insurance", industry: "Insurance", signal: '10-K flags "legacy claims infrastructure" as a strategic risk factor', source: "SEC 10-K filing", score: 66, updated: "1 day ago" },
  { id: "sr3", org: "Solari Health Partners", industry: "Healthcare", signal: "CTO LinkedIn post: actively scoping claims adjudication stack replacement", source: "LinkedIn post", score: 79, updated: "3 hours ago" },
  { id: "sr4", org: "Kestrel Grid Utilities", industry: "Utilities", signal: "Press release announcing $40M grid-modernization initiative", source: "Press release", score: 58, updated: "6 hours ago" },
];

export function getPartner(id: string, partners: Partner[] = partnerDirectory): Partner | undefined {
  return partners.find(p => p.id === id);
}

export function isArchivedStatus(status: string): boolean {
  return status === "Archived";
}

export function activeGraph(graph: GraphData): GraphData {
  return {
    capabilities: graph.capabilities.filter(item => !isArchivedStatus(item.status)),
    experience: graph.experience.filter(item => !isArchivedStatus(item.status)),
    credentials: graph.credentials.filter(item => !isArchivedStatus(item.status)),
    people: graph.people.filter(item => !isArchivedStatus(item.status)),
  };
}

export function getOrgPursuits(org: Organization): Pursuit[] {
  return org.pursuits.map(pid => pursuits[pid]).filter(Boolean) as Pursuit[];
}

export function getOrgTopScore(org: Organization): number {
  const active = getOrgPursuits(org).filter(p => !p.closed);
  if (active.length) return Math.max(...active.map(p => p.score));
  return org.score;
}
