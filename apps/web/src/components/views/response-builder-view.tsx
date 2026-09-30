"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { GraphData, GraphExperience, GraphPerson, Organization, Partner, Pursuit, PursuitCoverLetter, ResponseActionItem } from "@/lib/mock-data";
import type { RfpProposal } from "@opportunity-engine/contracts";
import { estimatePages, outlineSectionsFor, RFI_OUTLINE_SECTIONS, summarizeRfpProposal } from "@opportunity-engine/core";
import { getPartner } from "@/lib/mock-data";
import { Modal, FormField, TextInput, SelectInput, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { ActionItemResponseModal } from "@/components/action-items/action-item-response-modal";
import { GapLogActionItems } from "@/components/action-items/gap-log-action-items";
import { RichTextEditor, RichTextHtml } from "@/components/ui/rich-text-editor";
import { useToast } from "@/components/ui/toast";
import { useOperator } from "@/components/auth/operator-provider";
import { cn } from "@/lib/cn";
import { rankPeopleForRole } from "@/lib/personnel-fit";
import { RfiResponsePackagePanel } from "@/components/views/rfi-response-package";
import { escapeHtml, htmlToPlainText, isEmptyRichText, plainTextToHtml, sanitizeRichText } from "@/lib/rich-text";
import { GAP_TYPE_LABELS, applyActionItemUpdate, gapLogRows, gapsToActionItems, isResolvedStatus, sortGapLogRows, type GapLogRow } from "@/lib/gap-log";
import { useResponseJob, type ResponseJobKind, type ResponseJobOutcome } from "@/lib/response-jobs";
import { liveProposal, runRfpProposalJob, runRfpSectionJob, type RfpProposalContext } from "@/lib/rfp-proposal-generation";
import { primePartnerOf } from "@/lib/rfp-proposal-sources";
import { PageBudgetBar, ProposalFormsPanel, ProposalStatusStrip, ProposalSupportPanel } from "@/components/views/rfp-proposal-panels";
import {
  COVER_LETTER_ID,
  COVER_LETTER_MAX_WORDS,
  coverLetterConstraint,
  responseSignature,
  runCoverLetterJob,
  runPackageJob,
  runSectionJob,
  type GenerationContext,
} from "@/lib/response-generation";

interface SectionMeta {
  id: string;
  name: string;
  ref: string;
  trace: "full" | "partial" | "none";
  tracePct: string;
  mandatory: boolean;
  reviewNeeded?: boolean;
}

const DRAFT_STATUSES = ["In Draft", "Submitted", "On Hold", "Canceled"] as const;
const OUTCOMES = ["Won", "Lost", "Postponed", "Canceled"] as const;

const initialSections: SectionMeta[] = [
  { id: "tech", name: "Technical Approach", ref: "Vol I § 3.2", trace: "partial", tracePct: "92%", mandatory: true },
  { id: "past", name: "Past Performance", ref: "Vol I § 3.4", trace: "full", tracePct: "100%", mandatory: true },
  { id: "pers", name: "Key Personnel", ref: "Vol I § 3.5", trace: "full", tracePct: "—", mandatory: true },
  { id: "mgmt", name: "Management Plan", ref: "Vol I § 3.6", trace: "none", tracePct: "Not started", mandatory: true },
];

function isGenericRfiMatrix(matrix: { sectionId: string }[]): boolean {
  if (matrix.length !== 3) return false;
  return matrix.map(item => item.sectionId).sort().join(",") === "approach,experience,overview";
}

function isCoverSection(section: { id: string; name: string }): boolean {
  return section.id === "cover" || section.id === COVER_LETTER_ID || /^cover (letter|page)$/i.test(section.name.trim());
}

/** Response sections, without the cover letter (which has its own editor) and with drafted ones marked. */
function sectionsForPursuit(pursuit: Pursuit): SectionMeta[] {
  const drafts = pursuit.responseDrafts ?? {};
  return outlineForPursuit(pursuit)
    .filter(section => !isCoverSection(section))
    .map(section => section.trace === "none" && !isEmptyRichText(drafts[section.id])
      ? { ...section, trace: "partial" as const, tracePct: "Drafted" }
      : section);
}

function outlineForPursuit(pursuit: Pursuit): SectionMeta[] {
  if (pursuit.id === "OPP-2219" && !pursuit.rfpProposal) return initialSections;
  if (pursuit.projectType === "rfi") {
    const matrix = pursuit.complianceMatrix ?? [];
    const source = matrix.length && !isGenericRfiMatrix(matrix)
      ? matrix
      : RFI_OUTLINE_SECTIONS.map(section => ({ ref: section.ref, title: section.title, sectionId: section.sectionId }));
    return source.map(item => ({
      id: item.sectionId, name: item.title, ref: item.ref,
      trace: "none" as const, tracePct: "Not started", mandatory: true,
    }));
  }
  if (pursuit.complianceMatrix?.length) {
    return pursuit.complianceMatrix.map(item => ({
      id: item.sectionId, name: item.title, ref: item.ref,
      trace: "none" as const, tracePct: "Not started", mandatory: true,
    }));
  }
  return outlineSectionsFor(pursuit.projectType ?? "rfp").map(section => ({
    id: section.sectionId, name: section.title, ref: section.ref,
    trace: "none" as const, tracePct: "Not started", mandatory: true,
  }));
}

const PACKAGE_LABEL = { rfi: "RFI response", rfp: "proposal", sow: "SOW response" } as const;

function draftsForPursuit(pursuit: Pursuit, sections: SectionMeta[]): Record<string, string> {
  const saved = new Map(
    (pursuit.rfiResponse?.sections ?? []).map(section => [section.id, plainTextToHtml(section.body)]),
  );
  const persisted = pursuit.responseDrafts ?? {};
  if (pursuit.id === "OPP-2219" && saved.size === 0 && !pursuit.responseDrafts) {
    return Object.fromEntries(
      Object.entries(seedDraftContent).map(([id, text]) => [id, plainTextToHtml(text)]),
    );
  }
  return Object.fromEntries(sections.map(section => [section.id, persisted[section.id] ?? saved.get(section.id) ?? ""]));
}

/** A cover letter saved before it had its own editor lived in the outline's "cover" section. */
function initialCoverLetter(pursuit: Pursuit): string {
  if (pursuit.coverLetter) return pursuit.coverLetter.body;
  const legacy = pursuit.responseDrafts?.cover
    ?? (pursuit.rfiResponse?.sections ?? []).find(section => isCoverSection({ id: section.id, name: section.title }))?.body;
  if (!legacy) return "";
  return /<\/?[a-z][\s\S]*>/i.test(legacy) ? legacy : plainTextToHtml(legacy);
}

function outlineSection(pursuit: Pursuit, section: SectionMeta): string {
  const docs = pursuit.documents.map(doc => doc.name).join(", ") || "the uploaded solicitation";
  const objectives = pursuit.docSummary.objective.slice(0, 3);
  const mapped = pursuit.reqmap.filter(item => item.status === "mapped").slice(0, 5);
  const gaps = pursuit.gaps.slice(0, 4);
  const lines = [
    `This ${section.name.toLowerCase()} is grounded in ${docs}${pursuit.solicitationRef ? ` (${pursuit.solicitationRef})` : ""}.`,
    "",
  ];
  if (objectives.length) { lines.push("Stated objectives"); for (const item of objectives) lines.push(`• ${item}`); lines.push(""); }
  if (section.id === "scope" || section.id === "tech") {
    if (pursuit.docSummary.services.length) { lines.push("Requested services"); for (const item of pursuit.docSummary.services.slice(0, 5)) lines.push(`• ${item}`); lines.push(""); }
    if (mapped.length) { lines.push("Capability coverage to expand in the full draft"); for (const item of mapped) lines.push(`• ${item.req}${item.node ? ` — ${item.node}` : ""}`); lines.push(""); }
  }
  if (gaps.length && (section.id === "mgmt" || section.id === "tech")) { lines.push("Open gaps the response must address or qualify"); for (const gap of gaps) lines.push(`• ${gap.title} (${gap.crit})`); lines.push(""); }
  if (pursuit.sourceText) { lines.push("Source packet is on file. Generate the narrative from mapped requirements only; do not invent past performance."); }
  else { lines.push("Upload the solicitation on the opportunity if this outline is thin — the response builder uses the extracted packet."); }
  return lines.join("\n").trim();
}

const seedDraftContent: Record<string, string> = {
  tech: `The proposed technical approach leverages our team's direct experience migrating legacy mainframe benefits systems to modern cloud-native architectures. Our methodology, refined across two completed state-level unemployment insurance modernizations, addresses the core challenge of retiring a 30-year-old system while maintaining uninterrupted service delivery.

Our migration strategy employs a phased cutover approach that has achieved zero-downtime transitions in prior engagements. Data migration is led by Priya Nandakumar, who architected the equivalent pipeline on the Commonwealth engagement, ensuring continuity of expertise from the team's most directly relevant prior performance.

The fraud analytics component builds on our existing Benefits Fraud Analytics capability, applying supervised learning models trained on historical claims patterns to identify anomalous adjudication activity in real time. Quality assurance and compliance testing is overseen by Marcus Webb, drawing on his work certifying the Commonwealth system for production release.`,
  past: `Commonwealth Department of Labor — Claims Migration (2022–2024)

Retired a 25-year-old COBOL mainframe claims processing system, migrating 4.2M historical records to a cloud-native PostgreSQL-backed platform on AWS GovCloud. The project delivered zero-downtime cutover across three regional processing centers and reduced average claim processing time by 34%.

Key personnel overlap: Dana Whitfield (Program Manager) and Priya Nandakumar (Lead Data Architect) led this engagement and are proposed for equivalent roles on this program.`,
  pers: `Program Manager: Dana Whitfield, PMP — 12 years leading public-sector modernization programs.
Lead Data Architect: Priya Nandakumar — Architected the equivalent migration pipeline on two completed legacy mainframe retirements.
QA & Compliance Lead: Marcus Webb — Led certification testing for production release on the Commonwealth engagement.`,
  mgmt: "",
};

const generatedMgmtDraft = `Our management approach is built on three pillars: structured governance, transparent communication, and continuous risk management.

Project governance follows a tiered model: a Joint Steering Committee meets monthly for strategic direction, while the Program Manager conducts weekly status reviews with the agency's project lead. All decisions are documented and traceable through our centralized project management platform.

Risk management is embedded throughout the program lifecycle. Our risk register is reviewed weekly, with each risk assigned an owner, mitigation strategy, and escalation trigger. Critical risks are escalated to the Steering Committee within 24 hours of identification.

Quality management follows our CMMI Level 3 processes, adapted for the specific requirements of this engagement. Independent quality reviews are conducted at each milestone gate, with findings tracked to resolution before proceeding.

The subcontracting plan ensures clear accountability across all consortium members. Each partner has a defined scope of work, reporting obligations, and performance metrics aligned with the prime contract requirements.`;

interface ChatMessage { role: "system" | "user" | "assistant"; text: string; }

const defaultPersonnelAssignments: Record<string, string> = {
  "Program Manager": "",
  "Lead Data Architect": "",
  "QA & Compliance Lead": "",
};

const demoPersonnelAssignments: Record<string, string> = {
  "Program Manager": "PPL-118",
  "Lead Data Architect": "PPL-119",
  "QA & Compliance Lead": "PPL-120",
};

const copilotResponses: Record<string, string> = {
  "Strengthen the fraud analytics paragraph": "I've enhanced the fraud analytics paragraph with specific metrics and methodology details.",
  "Add a risk mitigation section": "I've added a risk mitigation section addressing three key areas.",
  "Which claims aren't source-traced?": "Two assertions in the current draft lack direct source tracing.",
};

export function ResponseBuilderEmptyState({
  orgName,
  projectType,
  onOpenOpportunity,
}: {
  orgName?: string;
  projectType?: "rfp" | "rfi" | "sow";
  onOpenOpportunity: () => void;
}) {
  return (
    <div className="bg-card rounded-xl border shadow-sm px-6 py-16 text-center">
      <h2 className="text-base font-semibold text-foreground">Response Builder</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        {orgName
          ? projectType === "rfi"
            ? `No confirmed Respond decision for ${orgName}. Confirm Respond on an RFI before drafting a response.`
            : `No confirmed Go pursuit for ${orgName}. Confirm Go on an opportunity before drafting a response.`
          : projectType === "rfi"
            ? "Confirm Respond on an RFI before drafting a response."
            : "Confirm Go on an opportunity before drafting a response."}
      </p>
      <button
        type="button"
        onClick={onOpenOpportunity}
        className="mt-6 text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm"
      >
        Open Opportunity →
      </button>
    </div>
  );
}

const EMPTY_GRAPH: GraphData = { capabilities: [], experience: [], credentials: [], people: [] };

function proposalExportHtml(proposal: RfpProposal, summary: string, rows: GapLogRow[]): string {
  const cell = (value: string) => `<td>${escapeHtml(value)}</td>`;
  const table = (headers: string[], body: string[][]) => body.length
    ? `<table border="1" cellpadding="6" cellspacing="0"><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr>${body.map(row => `<tr>${row.map(cell).join("")}</tr>`).join("")}</table>`
    : "<p><em>None</em></p>";
  const forms = proposal.forms.map(form => `<h2>${escapeHtml([form.form, form.name].filter(Boolean).join(" — "))}</h2>${
    form.completedBy.length ? `<p>Completed by: ${escapeHtml(form.completedBy.join(", "))}</p>` : ""
  }${form.placement ? `<p>Placement: ${escapeHtml(form.placement)}</p>` : ""}${
    table(["Field", "Value"], form.fields.map(field => [field.field, field.value]))
  }${form.notes ? `<p>${escapeHtml(form.notes)}</p>` : ""}`).join("");
  const gapTable = table(
    ["ID", "Location", "Type", "Description", "Owner", "Priority", "Due", "Status"],
    rows.map(row => [row.id, row.location, GAP_TYPE_LABELS[row.type] ?? row.type, row.description, row.owner, row.priority, row.dueAt, row.status]),
  );
  return [
    `<br style="page-break-before:always"><h1>Forms</h1>${forms || "<p><em>No forms completed</em></p>"}`,
    `<h1>Gap Log - Action Items</h1>${gapTable}`,
    `<h1>Supporting material</h1><h2>Reviewer summary</h2><p>${escapeHtml(summary)}</p>`,
    `<h2>Compliance matrix</h2>${table(["Requirement", "Cite", "Answered in", "Criterion", "Owner", "Status"], proposal.complianceMatrix.map(row => [row.requirement, row.cite, row.answeredIn, row.criterion, row.owner, row.status]))}`,
    `<h2>Page budget</h2>${table(["Section", "RFP ref", "Points", "Budget (pages)", "Estimate (pages)"], proposal.sections.map(section => [
      section.heading, section.rfpRef, section.points, section.pageBudget == null ? "Outside budget" : String(section.pageBudget), String(estimatePages(section.content)),
    ]))}`,
    `<h2>Consistency checks</h2>${table(["Check", "Result", "Detail", "Source"], proposal.consistencyChecks.map(check => [check.check, check.result, check.detail, check.source]))}`,
    `<h2>Submission checklist</h2><ul>${proposal.submissionChecklist.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`,
    `<h2>Questions for the issuer</h2>${table(["Question", "Basis", "Priority", "Timing"], proposal.issuerQuestions.map(row => [row.question, row.basis, row.priority, row.timing]))}`,
  ].join("");
}

export function ResponseBuilderView({
  pursuit, org, onBack, onUpdatePursuit, onApplyToPursuit, partners, people, experience, capabilities, graph,
}: {
  pursuit: Pursuit;
  org?: Organization;
  onBack: () => void;
  onUpdatePursuit: (pursuitId: string, updates: Partial<Pursuit>) => void;
  onApplyToPursuit: (pursuitId: string, apply: (pursuit: Pursuit) => Partial<Pursuit>) => void;
  partners?: Partner[];
  people?: GraphPerson[];
  experience?: GraphExperience[];
  capabilities?: string[];
  /** The capability graph, for RFP proposal sources (capabilities, credentials, resumes). */
  graph?: GraphData;
}) {
  const { toast } = useToast();
  const { profile } = useOperator();
  const { start: startJob, job, result: jobResult } = useResponseJob(pursuit.id);
  const generating = Boolean(job);
  const [sections, setSections] = useState<SectionMeta[]>(() => sectionsForPursuit(pursuit));
  const [activeSection, setActiveSection] = useState(() => sectionsForPursuit(pursuit)[0]?.id ?? "tech");
  const [drafts, setDrafts] = useState<Record<string, string>>(() => draftsForPursuit(pursuit, sectionsForPursuit(pursuit)));
  const [coverDraft, setCoverDraft] = useState(() => initialCoverLetter(pursuit));
  const [confirmCoverOpen, setConfirmCoverOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [assertionResults, setAssertionResults] = useState<{ text: string; traced: boolean }[] | null>(null);
  const [reviewedSections, setReviewedSections] = useState<Set<string>>(new Set());

  // Draft status & outcome
  const [draftStatus, setDraftStatus] = useState<string>(pursuit.draftStatus ?? "In Draft");
  const [outcome, setOutcome] = useState<string>(pursuit.outcome ?? "");

  // Full preview modal
  const [previewOpen, setPreviewOpen] = useState(false);

  // Insert section
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertName, setInsertName] = useState("");
  const [insertAfter, setInsertAfter] = useState("");

  // Key Personnel roles
  const [personnelAssignments, setPersonnelAssignments] = useState<Record<string, string>>(
    () => pursuit.id === "OPP-2219" ? { ...demoPersonnelAssignments } : { ...defaultPersonnelAssignments },
  );
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [addPersonRoleOpen, setAddPersonRoleOpen] = useState(false);
  const [addPersonForRole, setAddPersonForRole] = useState("");
  const [addPersonName, setAddPersonName] = useState("");
  const [addPersonTitle, setAddPersonTitle] = useState("");
  const [addPersonPartner, setAddPersonPartner] = useState("");
  const [actionItem, setActionItem] = useState<ResponseActionItem | null>(null);
  const rfiPacket = pursuit.rfiResponse ?? null;
  const logRows = gapLogRows(pursuit, partners);
  const isRfi = pursuit.projectType === "rfi";
  const packageLabel = PACKAGE_LABEL[pursuit.projectType ?? "rfp"];
  const isRfp = (pursuit.projectType ?? "rfp") === "rfp";
  const proposal = isRfp ? pursuit.rfpProposal : undefined;
  const primeName = primePartnerOf(partners)?.name;
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructionsText, setInstructionsText] = useState(pursuit.proposalInstructions ?? "");
  const openGaps = pursuit.rfiResponse?.gaps;
  const live = useMemo(
    () => (proposal ? liveProposal(proposal, drafts, coverDraft, openGaps) : null),
    [proposal, drafts, coverDraft, openGaps],
  );
  const planned = useMemo(() => new Map((live?.sections ?? []).map(section => [section.id, section])), [live]);

  // Upload final
  const [uploadFinalOpen, setUploadFinalOpen] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "system", text: pursuit.sourceText
        ? `Response workspace opened from ${pursuit.documents.length || 1} parsed document${pursuit.documents.length === 1 ? "" : "s"}.`
        : "Draft generated from matched capability nodes and experience references." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatTyping, setChatTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function handleStatusChange(newStatus: string) {
    setDraftStatus(newStatus);
    const date = new Date().toISOString().slice(0, 10);
    onUpdatePursuit(pursuit.id, { draftStatus: newStatus as Pursuit["draftStatus"], draftStatusDate: date });
    toast(`Status changed to ${newStatus}`, "success");
  }

  function handleOutcomeChange(newOutcome: string) {
    setOutcome(newOutcome);
    const date = new Date().toISOString().slice(0, 10);
    onUpdatePursuit(pursuit.id, { outcome: newOutcome as Pursuit["outcome"], outcomeDate: date });
    toast(`Outcome set to ${newOutcome}`, "success");
  }

  // Editor changes are saved onto the pursuit shortly after typing stops, so drafts survive leaving the view.
  const pendingDrafts = useRef<Record<string, string>>({});
  const pendingCover = useRef<string | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushEdits = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = null;
    const draftsToSave = pendingDrafts.current;
    const coverToSave = pendingCover.current;
    pendingDrafts.current = {};
    pendingCover.current = null;
    if (!Object.keys(draftsToSave).length && coverToSave === null) return;
    const editedAt = new Date().toISOString();
    onApplyToPursuit(pursuit.id, p => ({
      ...(Object.keys(draftsToSave).length ? { responseDrafts: { ...(p.responseDrafts ?? {}), ...draftsToSave } } : {}),
      ...(coverToSave !== null
        ? {
          coverLetter: p.coverLetter
            ? { ...p.coverLetter, body: coverToSave, editedAt }
            : { body: coverToSave, generatedAt: "", provider: "manual", sourceSignature: "", editedAt },
        }
        : {}),
    }));
  }, [onApplyToPursuit, pursuit.id]);
  const scheduleFlush = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(flushEdits, 700);
  }, [flushEdits]);
  useEffect(() => flushEdits, [flushEdits]);

  function handleDraftChange(sectionId: string, html: string) {
    setDrafts(prev => ({ ...prev, [sectionId]: html }));
    pendingDrafts.current[sectionId] = html;
    scheduleFlush();
  }

  function handleCoverChange(html: string) {
    setCoverDraft(html);
    pendingCover.current = html;
    scheduleFlush();
  }

  // When a generation job for this pursuit finishes while the view is open, pull in what it wrote.
  const seenJob = useRef(jobResult?.jobId);
  useEffect(() => {
    if (!jobResult || jobResult.jobId === seenJob.current) return;
    seenJob.current = jobResult.jobId;
    const written = new Set(jobResult.sectionIds);
    const saved = pursuit.responseDrafts ?? {};
    if (jobResult.kind === "package" && written.size) {
      const tracePct = jobResult.hints?.tracePct ?? "model";
      const next = sectionsForPursuit(pursuit);
      setSections(next.map(section =>
        written.has(section.id) ? { ...section, trace: "partial" as const, tracePct, reviewNeeded: false } : section,
      ));
      setActiveSection(current => current === COVER_LETTER_ID || next.some(section => section.id === current)
        ? current
        : next[0]?.id ?? COVER_LETTER_ID);
    } else if (jobResult.kind === "section") {
      setSections(prev => prev.map(section => {
        if (written.has(section.id) || section.id === jobResult.sectionId) {
          return { ...section, trace: "partial" as const, tracePct: jobResult.hints?.tracePct ?? "model" };
        }
        return jobResult.hints?.reviewOthers && !isEmptyRichText(drafts[section.id]) ? { ...section, reviewNeeded: true } : section;
      }));
    }
    if (written.size) {
      setDrafts(prev => {
        const next = { ...prev };
        for (const id of written) if (id !== COVER_LETTER_ID && saved[id] !== undefined) next[id] = saved[id]!;
        return next;
      });
    }
    if (written.has(COVER_LETTER_ID) && pursuit.coverLetter) setCoverDraft(pursuit.coverLetter.body);
    setMessages(prev => [...prev, { role: "system", text: jobResult.message }]);
  }, [jobResult, pursuit, drafts]);

  function generationContext(): GenerationContext {
    flushEdits();
    return {
      pursuit,
      org,
      partners,
      people: people ?? [],
      experience,
      capabilities,
      assignments: personnelAssignments,
      sections: sections.map(section => ({ id: section.id, name: section.name, ref: section.ref })),
      drafts,
      signatory: profile ? { name: profile.displayName, title: profile.title, email: profile.email } : undefined,
      packageLabel,
    };
  }

  function launch(kind: ResponseJobKind, label: string, run: (progress: (label: string) => void) => Promise<ResponseJobOutcome>, sectionId?: string) {
    const started = startJob({ pursuitId: pursuit.id, pursuitName: pursuit.name, kind, label, sectionId, run });
    if (!started) toast("A draft is already being generated for this opportunity", "warning");
  }

  function proposalContext(): RfpProposalContext {
    flushEdits();
    return {
      pursuit,
      partners: partners ?? [],
      graph: graph ?? { ...EMPTY_GRAPH, people: people ?? [], experience: experience ?? [] },
      assignments: personnelAssignments,
      drafts,
    };
  }

  function requestRfiPackage() {
    const redo = sections.some(section => !isEmptyRichText(drafts[section.id]));
    if (isRfp) {
      const ctx = proposalContext();
      launch("package", `${redo ? "Regenerating" : "Drafting"} the proposal`, progress => runRfpProposalJob(ctx, progress));
      return;
    }
    const ctx = generationContext();
    launch("package", `${redo ? "Regenerating" : "Drafting"} the ${packageLabel}`, () => runPackageJob(ctx));
  }

  function saveInstructions() {
    onUpdatePursuit(pursuit.id, { proposalInstructions: instructionsText.trim() });
    setInstructionsOpen(false);
    toast("Drafting instructions saved. They apply the next time the proposal is drafted.", "success");
  }

  function requestSectionDraft(options: { regenerate: boolean }) {
    const section = sections.find(item => item.id === activeSection);
    if (!section) return;
    if (proposal?.sections.some(item => item.id === section.id)) {
      const ctx = proposalContext();
      launch("section", `${options.regenerate ? "Regenerating" : "Drafting"} “${section.name}”`, () => runRfpSectionJob(ctx, section.id), section.id);
      return;
    }
    const ctx = generationContext();
    const fallbackText = pursuit.id === "OPP-2219" && section.id === "mgmt"
      ? generatedMgmtDraft
      : outlineSection(pursuit, section);
    launch(
      "section",
      `${options.regenerate ? "Regenerating" : "Drafting"} “${section.name}”`,
      () => runSectionJob(ctx, { id: section.id, name: section.name, ref: section.ref }, { ...options, fallbackText }),
      section.id,
    );
  }

  function requestCoverLetter(force = false) {
    const letter = pursuit.coverLetter;
    if (!force && letter?.editedAt && (!letter.generatedAt || letter.editedAt > letter.generatedAt)) {
      setConfirmCoverOpen(true);
      return;
    }
    setConfirmCoverOpen(false);
    const ctx = generationContext();
    launch("cover_letter", letter?.generatedAt ? "Regenerating the cover letter" : "Drafting the cover letter", () => runCoverLetterJob(ctx), COVER_LETTER_ID);
  }

  function handleGenerateDraft() {
    requestSectionDraft({ regenerate: false });
  }

  function handleRegenerate() {
    requestSectionDraft({ regenerate: true });
  }

  function handleCheckAssertions() {
    setChecking(true);
    setAssertionResults(null);
    setTimeout(() => {
      const content = htmlToPlainText(drafts[activeSection] || "");
      const sentences = content.split(/\.\s+/).filter(s => s.length > 20).slice(0, 8);
      const results = sentences.map((s, i) => ({ text: s.slice(0, 80) + (s.length > 80 ? "…" : ""), traced: i < sentences.length - 2 || Math.random() > 0.4 }));
      setAssertionResults(results);
      setChecking(false);
      const traced = results.filter(r => r.traced).length;
      toast(`Assertion check complete: ${traced}/${results.length} traced`, traced === results.length ? "success" : "warning");
    }, 1000);
  }

  function handleMarkReviewed() {
    setReviewedSections(prev => { const next = new Set(prev); next.add(activeSection); return next; });
    setSections(prev => prev.map(s => s.id === activeSection ? { ...s, trace: "full" as const, tracePct: "Reviewed ✓", reviewNeeded: false } : s));
    toast(`"${sections.find(s => s.id === activeSection)?.name}" marked as reviewed`, "success");
  }

  function handleInsertSection() {
    if (!insertName.trim()) return;
    const newId = `custom-${Date.now()}`;
    const newSection: SectionMeta = { id: newId, name: insertName.trim(), ref: "Custom", trace: "none", tracePct: "Not started", mandatory: false };
    const idx = insertAfter ? sections.findIndex(s => s.id === insertAfter) : -1;
    const next = idx < 0 ? [...sections, newSection] : [...sections.slice(0, idx + 1), newSection, ...sections.slice(idx + 1)];
    setSections(next);
    setDrafts(prev => ({ ...prev, [newId]: "" }));
    onUpdatePursuit(pursuit.id, { complianceMatrix: next.map(s => ({ ref: s.ref, title: s.name, sectionId: s.id })) });
    toast(`Section "${insertName.trim()}" inserted`, "success");
    setInsertOpen(false);
    setInsertName("");
  }

  function handleExportWord() {
    const summary = rfiPacket && !live
      ? `<h1>Reviewer summary</h1><p>${escapeHtml(rfiPacket.reviewerSummary)}</p>${
        rfiPacket.questions.length
          ? `<h2>Suggested questions</h2><ul>${rfiPacket.questions.map(question => `<li>${escapeHtml(question)}</li>`).join("")}</ul>`
          : ""
      }${rfiPacket.strategicNotes.trim() ? `<h2>Strategic notes</h2><p>${escapeHtml(rfiPacket.strategicNotes)}</p>` : ""}`
      : "";
    const gapTable = logRows.length
      ? `<h1>Gap Log - Action Items</h1><table border="1" cellpadding="6" cellspacing="0"><tr><th>ID</th><th>Location</th><th>Type</th><th>Description</th><th>Owner</th><th>Priority</th><th>Due</th><th>Status</th></tr>${
        logRows.map(row => `<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.location)}</td><td>${escapeHtml(GAP_TYPE_LABELS[row.type] ?? row.type)}</td><td>${escapeHtml(row.description)}</td><td>${escapeHtml(row.owner)}</td><td>${escapeHtml(row.priority)}</td><td>${escapeHtml(row.dueAt)}</td><td>${escapeHtml(row.status)}</td></tr>`).join("")
      }</table>`
      : "";
    const letter = isEmptyRichText(coverDraft)
      ? ""
      : `<h1>Cover Letter</h1>${sanitizeRichText(coverDraft)}<br style="page-break-before:always">`;
    const body = sections.map(s => {
      const content = isEmptyRichText(drafts[s.id])
        ? "<p><em>Not drafted</em></p>"
        : sanitizeRichText(drafts[s.id] ?? "");
      return `<h1>${escapeHtml(s.name)}</h1><p><strong>${escapeHtml(s.ref)}</strong></p>${content}`;
    }).join("");
    const tail = live
      ? proposalExportHtml(live, summarizeRfpProposal(live, primeName), sortGapLogRows(logRows, "owner_group", "asc", primeName))
      : gapTable;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(pursuit.name)} — Response Draft</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;line-height:1.65;color:#111}h1{font-family:Calibri,sans-serif;font-size:20px;margin:28px 0 8px}h2{font-size:16px}ul,ol{padding-left:1.4em}</style>
</head><body><p style="color:#555;font-size:13px">${escapeHtml(pursuit.solicitationRef || pursuit.typeLabel)}</p><h1>${escapeHtml(pursuit.name)} — Response Draft</h1>${summary}${letter}${body}${tail}</body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pursuit.name.replace(/[^a-zA-Z0-9]/g, "_")}_Draft.doc`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Draft exported as Word document", "success");
  }

  function sendChatMessage(text: string) {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { role: "user", text: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setChatTyping(true);
    setTimeout(() => {
      const response = copilotResponses[text.trim()] ||
        `I've analyzed the "${sections.find(s => s.id === activeSection)?.name}" section. ${text.trim().includes("?")
          ? "Based on the capability graph and matched experience nodes, here's what I found."
          : "I've updated the section content to reflect your requested changes."}`;
      setMessages(prev => [...prev, { role: "assistant", text: response }]);
      setChatTyping(false);
    }, 800);
  }

  const quickPrompts = ["Strengthen the fraud analytics paragraph", "Add a risk mitigation section", "Which claims aren't source-traced?"];

  const isCover = activeSection === COVER_LETTER_ID;
  const activeMeta = sections.find(s => s.id === activeSection);
  const isKeyPersonnel = !isCover && (activeSection === "pers" || (isRfp && /key personnel|staffing/i.test(activeMeta?.name ?? "")));
  const activePlan = isCover ? undefined : planned.get(activeSection);
  const budgetLine = (id: string) => {
    const plan = planned.get(id);
    if (!plan) return "";
    return [
      plan.points ? `${plan.points} pts` : "",
      plan.pageBudget != null ? `~${estimatePages(plan.content)} of ${plan.pageBudget} pp` : "outside page budget",
    ].filter(Boolean).join(" · ");
  };
  const navGroups: { label: string; items: SectionMeta[] }[] = (() => {
    if (!proposal?.structure.volumes.length) return [{ label: "", items: sections }];
    const used = new Set<string>();
    const groups = proposal.structure.volumes.map(volume => {
      const ids = new Set(volume.sectionIds.map(id => id.toLowerCase()));
      const items = sections.filter(section => !used.has(section.id) && ids.has(section.id.toLowerCase()));
      for (const item of items) used.add(item.id);
      return { label: `${volume.volume}${volume.pageLimit ? ` · ${volume.pageLimit}` : ""}`, items };
    }).filter(group => group.items.length);
    const rest = sections.filter(section => !used.has(section.id));
    return rest.length ? [...groups, { label: "Other sections", items: rest }] : groups;
  })();
  const hasDraft = !isCover && !isEmptyRichText(drafts[activeSection]);
  const draftedCount = sections.filter(s => !isEmptyRichText(drafts[s.id])).length;
  const coverLetter: PursuitCoverLetter | undefined = pursuit.coverLetter;
  const coverHasText = !isEmptyRichText(coverDraft);
  const coverStale = Boolean(
    coverLetter?.generatedAt && coverLetter.sourceSignature && coverLetter.sourceSignature !== responseSignature(sections, drafts),
  );
  const coverWords = htmlToPlainText(coverDraft).split(/\s+/).filter(Boolean).length;
  const coverConstraint = coverLetterConstraint(pursuit);
  const coverStatus = !coverHasText ? "Not drafted" : coverStale ? "Update" : coverLetter?.editedAt ? "Edited" : "Drafted";
  const editorBusy = Boolean(job && (job.kind === "package" ? !isCover : job.sectionId === activeSection));
  const allPeople = (people ?? []).filter(person => person.status !== "Archived");
  const roleNames = Object.keys(personnelAssignments);
  const referencedPeople = Object.values(personnelAssignments)
    .map(id => allPeople.find(person => person.id === id))
    .filter((person): person is GraphPerson => Boolean(person));

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
        <button onClick={onBack} className="text-primary font-medium cursor-pointer hover:underline bg-transparent border-none shrink-0">← Back to opportunity</button>
        <span className="hidden xs:inline">/</span>
        <span className="hidden xs:inline text-foreground font-medium truncate">Response Builder — {pursuit.name}</span>
      </nav>

      {/* Status bar */}
      <div className="bg-card rounded-xl border shadow-sm px-5 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Status</span>
          <select value={draftStatus} onChange={e => handleStatusChange(e.target.value)} className="oe-select text-[11px] w-28">
            {DRAFT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {draftStatus === "Submitted" && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Outcome</span>
            <select value={outcome} onChange={e => handleOutcomeChange(e.target.value)} className="oe-select text-[11px] w-28">
              <option value="">Not set</option>
              {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        )}
        <div className="flex gap-2 ml-auto">
          <button onClick={() => setPreviewOpen(true)} className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer hover:bg-secondary">Preview Full Response</button>
          <button onClick={handleExportWord} className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer hover:bg-secondary">Export Draft</button>
          <button onClick={() => setUploadFinalOpen(true)} className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer hover:bg-secondary">Upload Final</button>
        </div>
      </div>

      {proposal && live && (
        <ProposalStatusStrip
          record={proposal}
          live={live}
          summary={summarizeRfpProposal(live, primeName)}
          hasInstructions={Boolean(pursuit.proposalInstructions?.trim())}
          onEditInstructions={() => { setInstructionsText(pursuit.proposalInstructions ?? ""); setInstructionsOpen(true); }}
        />
      )}

      {rfiPacket && !live && (
        <RfiResponsePackagePanel
          packet={rfiPacket}
          logRows={logRows}
          projectType={pursuit.projectType ?? "rfp"}
        />
      )}

      {logRows.length > 0 && !live && (
        <GapLogActionItems
          rows={logRows}
          onOpen={id => {
            const existing = (pursuit.responseActionItems ?? []).find(item => item.id === id);
            const gap = rfiPacket?.gaps.find(item => item.id === id);
            setActionItem(existing ?? (gap ? gapsToActionItems([gap], partners)[0] ?? null : null));
          }}
        />
      )}

      <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-start">
        {/* Section nav card */}
        <div className="w-full xl:w-[260px] shrink-0 bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-4 py-3 text-[10px] text-muted-foreground border-b border-border bg-muted/40 font-medium flex items-center justify-between">
            <span>{proposal ? "Sections by volume" : "Sections per compliance matrix"}</span>
            <button onClick={() => setInsertOpen(true)} className="text-primary font-semibold cursor-pointer hover:underline">+ Insert</button>
          </div>
          <div className="flex xl:flex-col overflow-x-auto oe-touch-scroll xl:overflow-visible">
            <button
              onClick={() => { setActiveSection(COVER_LETTER_ID); setAssertionResults(null); }}
              className={cn(
                "flex justify-between items-center gap-2 w-full px-4 py-3 border-b xl:border-b border-r xl:border-r-0 border-border cursor-pointer text-left text-xs transition-all min-w-[11.5rem] xl:min-w-0",
                "hover:bg-muted/20",
                isCover ? "bg-accent border-l-[3px] border-l-primary" : "bg-muted/10 border-l-[3px] border-l-transparent",
              )}
            >
              <div className="min-w-0">
                <span className="block font-mono text-[9px] text-muted-foreground uppercase tracking-wider">Cover</span>
                <span className="font-semibold text-foreground">Cover Letter</span>
              </div>
              <span className={cn("font-mono text-[10px] px-1.5 py-0.5 rounded-md shrink-0 font-semibold",
                coverStatus === "Not drafted" ? "oe-status-pending" : coverStatus === "Update" ? "oe-status-cond" : "oe-status-trace",
              )}>{coverStatus === "Update" ? "Update ↻" : coverStatus}</span>
            </button>
            {navGroups.map(group => [
              group.label && (
                <div key={`group-${group.label}`} className="hidden xl:block px-4 pt-3 pb-1.5 text-[9px] uppercase tracking-widest font-bold text-muted-foreground bg-muted/30 border-b border-border">
                  {group.label}
                </div>
              ),
              ...group.items.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setActiveSection(s.id); setAssertionResults(null); }}
                  className={cn(
                    "flex justify-between items-center gap-2 w-full px-4 py-3 border-b xl:border-b border-r xl:border-r-0 border-border cursor-pointer text-left text-xs transition-all min-w-[11.5rem] xl:min-w-0",
                    "hover:bg-muted/20",
                    activeSection === s.id ? "bg-accent border-l-[3px] border-l-primary" : "bg-card border-l-[3px] border-l-transparent"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="block font-mono text-[9px] text-muted-foreground uppercase tracking-wider">{s.ref}</span>
                      {s.mandatory && <span className="text-destructive text-[10px] font-bold">*</span>}
                      {s.reviewNeeded && <span className="text-cond text-[9px] font-bold ml-1">REVIEW</span>}
                    </div>
                    <span className="font-semibold text-foreground">{s.name}</span>
                    {planned.has(s.id) && <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">{budgetLine(s.id)}</span>}
                  </div>
                  <span className={cn("font-mono text-[10px] px-1.5 py-0.5 rounded-md shrink-0 font-semibold",
                    reviewedSections.has(s.id) ? "oe-status-go" :
                    s.trace === "full" ? "oe-status-trace" :
                    s.trace === "partial" ? "oe-status-cond" : "oe-status-pending"
                  )}>{reviewedSections.has(s.id) ? "Reviewed ✓" : s.tracePct}</span>
                </button>
              )),
            ])}
          </div>
          <div className="px-4 py-3 bg-muted/20 border-t border-border xl:border-t-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Completion</div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(sections.filter(s => !isEmptyRichText(drafts[s.id])).length / sections.length) * 100}%` }} />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5">
              {sections.filter(s => !isEmptyRichText(drafts[s.id])).length} of {sections.length} sections drafted
              {reviewedSections.size > 0 && ` · ${reviewedSections.size} reviewed`}
            </div>
          </div>
        </div>

        {/* Draft workspace */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Key Personnel editor */}
          {isKeyPersonnel && (
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h4 className="text-xs font-semibold text-foreground">Key Personnel Assignments</h4>
                <button onClick={() => setAddRoleOpen(true)} className="text-[10px] text-primary font-semibold cursor-pointer hover:underline">+ Add Role</button>
              </div>
              <div className="divide-y divide-border">
                {roleNames.map(role => {
                  const assignedId = personnelAssignments[role];
                  const person = allPeople.find(p => p.id === assignedId);
                  const ranked = rankPeopleForRole(role, allPeople);
                  const options = person && !ranked.some(p => p.id === person.id) ? [person, ...ranked] : ranked;
                  return (
                    <div key={role} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground">{role}</div>
                        <div className="text-[11px] text-muted-foreground">{person ? `${person.name} (${getPartner(person.partner, partners)?.name ?? person.partner})` : "Unassigned"}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={assignedId ?? ""}
                          onChange={e => setPersonnelAssignments(prev => ({ ...prev, [role]: e.target.value }))}
                          className="oe-select text-[10px] w-48"
                        >
                          <option value="">Unassigned</option>
                          {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button
                          onClick={() => { setAddPersonForRole(role); setAddPersonRoleOpen(true); }}
                          className="text-[10px] text-primary font-medium cursor-pointer hover:underline whitespace-nowrap"
                        >Add someone</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activePlan && (
            <div className="bg-card rounded-xl border shadow-sm px-5 py-3.5 space-y-2 text-xs">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Section brief</span>
                {activePlan.rfpRef && <span className="font-mono text-[11px] text-muted-foreground">{activePlan.rfpRef}</span>}
                {activePlan.points && <span className="font-mono text-[11px] text-muted-foreground">{activePlan.points} pts</span>}
                <div className="ml-auto"><PageBudgetBar pages={estimatePages(activePlan.content)} budget={activePlan.pageBudget} /></div>
              </div>
              {activePlan.criterion && <p className="text-muted-foreground">Criterion: <span className="text-foreground">{activePlan.criterion}</span></p>}
              {activePlan.brief && <p className="text-foreground leading-relaxed">{activePlan.brief}</p>}
            </div>
          )}

          {/* Personnel ribbon (non-personnel sections) */}
          {!isKeyPersonnel && !isCover && (
            <div className="bg-card rounded-xl border shadow-sm px-5 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Referenced personnel</span>
              {referencedPeople.map(person => (
                <span key={person.id} className="inline-flex items-center gap-1.5 border border-primary/20 bg-accent px-2.5 py-1 rounded-full text-[11px] text-accent-foreground font-medium">
                  <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-bold text-primary">
                    {person.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  {person.name}
                </span>
              ))}
            </div>
          )}

          {/* Cover letter guidance */}
          {isCover && (
            <div className="bg-card rounded-xl border shadow-sm px-5 py-3.5 space-y-2 text-xs">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Cover letter</span>
                {coverHasText && (
                  <span className={cn("font-mono text-[11px]", coverWords > COVER_LETTER_MAX_WORDS ? "text-cond font-semibold" : "text-muted-foreground")}>
                    {coverWords} words · {coverWords > COVER_LETTER_MAX_WORDS ? `over one page — trim to ${COVER_LETTER_MAX_WORDS}` : "fits on one page"}
                  </span>
                )}
                {coverLetter?.generatedAt && (
                  <span className="text-[11px] text-muted-foreground">
                    {coverLetter.provider === "template" ? "Template" : "Drafted"} {new Date(coverLetter.generatedAt).toLocaleString()}
                    {coverLetter.editedAt && coverLetter.editedAt > coverLetter.generatedAt ? " · edited since" : ""}
                  </span>
                )}
              </div>
              {!coverHasText && (
                <p className="text-muted-foreground">
                  {draftedCount
                    ? `Draft a one-page letter that expresses interest, summarizes the response, and says what makes this team uniquely positioned. It is written from the ${draftedCount} drafted section${draftedCount === 1 ? "" : "s"}.`
                    : `Draft the response sections first — the cover letter summarizes them.`}
                </p>
              )}
              {coverStale && (
                <p className="text-cond">
                  The response has changed since this letter was drafted. Regenerate it to reflect the current sections, or edit it by hand.
                </p>
              )}
              {coverHasText && draftedCount < sections.length && (
                <p className="text-muted-foreground">
                  {sections.length - draftedCount} of {sections.length} sections are not drafted yet; the letter only reflects drafted sections.
                </p>
              )}
              {coverConstraint && (
                <p className="text-nogo">Check the response instructions before including a cover letter: “{coverConstraint}”</p>
              )}
            </div>
          )}

          {/* Document editor */}
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden relative">
            {isCover ? (
              <RichTextEditor
                key={COVER_LETTER_ID}
                value={coverDraft}
                onChange={handleCoverChange}
                disabled={editorBusy}
                label="Cover Letter"
                placeholder="Write the cover letter, or draft it from the response sections."
              />
            ) : (
              <RichTextEditor
                key={activeSection}
                value={drafts[activeSection] ?? ""}
                onChange={html => handleDraftChange(activeSection, html)}
                disabled={editorBusy}
                label={activeMeta?.name}
                required={activeMeta?.mandatory}
                placeholder={`Write the ${activeMeta?.name ?? "section"}, or generate a grounded first pass.`}
              />
            )}
            {editorBusy && job && (
              <div className="absolute inset-0 bg-card/80 backdrop-blur-[1px] flex items-center justify-center z-10 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="text-sm text-muted-foreground">
                    {job.kind === "package" && !isRfp ? `Drafting the ${packageLabel}, Gap Log - Action Items, and reviewer summary…` : `${job.label}…`}
                    {job.kind === "package" && isRfp && (
                      <span className="block text-[11px]">A full proposal takes several minutes: the plan first, then sections, forms, and compliance in parallel, then a consistency review.</span>
                    )}
                    <span className="block text-[11px]">You can leave this page — the draft keeps running and is saved when it finishes.</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Assertion check results */}
          {assertionResults && !isCover && (
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h4 className="text-xs font-semibold text-foreground">Assertion Trace Results</h4>
                <button onClick={() => setAssertionResults(null)} className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer">Dismiss</button>
              </div>
              <div className="divide-y divide-border">
                {assertionResults.map((r, i) => (
                  <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                    <span className={cn("inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0", r.traced ? "oe-status-go" : "oe-status-nogo")}>{r.traced ? "TRACED" : "UNTRACED"}</span>
                    <span className="text-xs text-foreground truncate">{r.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2.5 flex-wrap items-center">
            <button onClick={requestRfiPackage} disabled={generating} className="text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm disabled:opacity-50">
              {job?.kind === "package" ? "Drafting…" : draftedCount ? `Regenerate ${packageLabel}` : `Generate ${packageLabel}`}
            </button>
            {isRfp && !proposal && (
              <button
                onClick={() => { setInstructionsText(pursuit.proposalInstructions ?? ""); setInstructionsOpen(true); }}
                className="text-xs font-medium px-4 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
              >
                {pursuit.proposalInstructions?.trim() ? "Edit drafting instructions" : "Add drafting instructions"}
              </button>
            )}
            {isCover && (
              <button
                onClick={() => requestCoverLetter()}
                disabled={generating || draftedCount === 0}
                title={draftedCount === 0 ? "Draft the response sections first" : undefined}
                className={cn(
                  "text-xs font-medium px-4 py-2 rounded-md border cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                  coverStale ? "border-cond text-cond bg-card hover:bg-cond-soft" : "border-input bg-card text-foreground hover:bg-secondary",
                )}
              >
                {job?.kind === "cover_letter" ? "Drafting letter…" : coverHasText ? "Regenerate cover letter" : "Draft cover letter"}
              </button>
            )}
            {!isCover && !isRfi && !hasDraft && (
              <button onClick={handleGenerateDraft} disabled={generating} className="text-xs font-medium px-4 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary disabled:opacity-50">Draft this section only</button>
            )}
            {hasDraft && (
              <button onClick={handleRegenerate} disabled={generating} className="text-xs font-medium px-4 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary disabled:opacity-50">{job?.kind === "section" && job.sectionId === activeSection ? "Regenerating…" : "Regenerate section"}</button>
            )}
            {hasDraft && (
              <button onClick={handleCheckAssertions} disabled={checking} className="text-xs font-medium px-4 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary disabled:opacity-50">{checking ? "Checking…" : "Check assertions"}</button>
            )}
            {hasDraft && !reviewedSections.has(activeSection) && (
              <button onClick={handleMarkReviewed} className="text-xs font-semibold px-4 py-2 rounded-md bg-go text-white cursor-pointer transition-all hover:opacity-90 shadow-sm">Mark as reviewed</button>
            )}
            {!isCover && reviewedSections.has(activeSection) && (
              <span className="text-xs font-semibold px-4 py-2 rounded-md bg-[hsl(var(--status-go-soft))] text-[hsl(var(--status-go))]">✓ Reviewed</span>
            )}
            {job && !editorBusy && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                {job.label}…
              </span>
            )}
          </div>
        </div>

        {/* Copilot panel */}
        <div className="w-full xl:w-[290px] shrink-0 bg-card rounded-xl border shadow-sm flex flex-col overflow-hidden min-h-[320px] xl:min-h-[520px]">
          <div className="px-4 py-3.5 border-b border-border">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 1 0 10 10H12V2Z" /><path d="M12 2a10 10 0 0 1 10 10" /><circle cx="12" cy="12" r="3" />
              </svg>
              Section Copilot
            </h3>
            <p className="text-[11px] text-muted-foreground mt-1">Ask about the section, request changes, or check claims.</p>
          </div>
          <div className="p-4 flex flex-col gap-2.5 max-h-[340px] overflow-y-auto flex-1">
            {messages.map((msg, i) => (
              <div key={i} className={cn("px-3.5 py-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap",
                msg.role === "user" ? "self-end bg-primary text-primary-foreground rounded-br-sm max-w-[90%]" :
                msg.role === "assistant" ? "self-start bg-accent text-accent-foreground rounded-tl-sm max-w-[90%]" :
                "self-start bg-muted/50 text-foreground rounded-tl-sm max-w-[90%]"
              )}>
                {msg.role === "system" && <span className="text-[9px] uppercase tracking-widest text-trace font-bold block mb-1">System</span>}
                {msg.role === "assistant" && <span className="text-[9px] uppercase tracking-widest text-primary font-bold block mb-1">Copilot</span>}
                {msg.text}
              </div>
            ))}
            {chatTyping && (
              <div className="self-start bg-accent text-accent-foreground px-3.5 py-2.5 rounded-xl rounded-tl-sm text-xs">
                <span className="text-[9px] uppercase tracking-widest text-primary font-bold block mb-1">Copilot</span>
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="flex flex-col gap-1.5 px-4 pb-3">
            {quickPrompts.map(s => (
              <button key={s} onClick={() => sendChatMessage(s)} disabled={chatTyping}
                className="text-[11px] px-3 py-2 border border-border bg-card rounded-lg cursor-pointer text-left text-foreground hover:border-primary/40 hover:bg-accent/50 transition-all disabled:opacity-50">{s}</button>
            ))}
          </div>
          <div className="flex gap-2 px-4 py-3 border-t border-border bg-muted/20">
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !chatTyping) sendChatMessage(chatInput); }}
              placeholder="Ask about this section…" className="oe-field flex-1" />
            <button onClick={() => sendChatMessage(chatInput)} disabled={!chatInput.trim() || chatTyping}
              className="text-xs font-semibold px-3 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">Send</button>
          </div>
        </div>
      </div>

      {live && (
        <>
          <ProposalFormsPanel forms={live.forms} />
          <GapLogActionItems
            rows={logRows}
            primeOwner={primeName ?? "Prime"}
            emptyText="No open gaps. Every placeholder has been resolved."
            onOpen={id => {
              const existing = (pursuit.responseActionItems ?? []).find(item => item.id === id);
              const gap = rfiPacket?.gaps.find(item => item.id === id);
              setActionItem(existing ?? (gap ? gapsToActionItems([gap], partners)[0] ?? null : null));
            }}
          />
          <ProposalSupportPanel proposal={live} />
        </>
      )}

      <Modal open={instructionsOpen} onClose={() => setInstructionsOpen(false)} title="Drafting instructions" wide>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            What the draft should know that the RFP and the capability graph don't: win strategy, prices and pricing assumptions,
            named key personnel, exceptions to take, anything to avoid. Prices are only entered from here or by the Prime Partner.
          </p>
          <textarea
            value={instructionsText}
            onChange={e => setInstructionsText(e.target.value)}
            rows={10}
            className="oe-field w-full text-xs font-mono"
            placeholder={"e.g. Lead with our transit fare-system track record.\nPricing: blended rate $185/hr, fixed fee for Phase 1.\nDo not take exceptions to the insurance terms."}
          />
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setInstructionsOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={saveInstructions}>Save</PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Full Preview Modal */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Full Response Preview" wide>
        <div className="max-h-[70vh] overflow-y-auto space-y-6 p-2">
          {coverHasText && (
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2 border-b border-border pb-2">Cover Letter</h3>
              <div className="text-sm text-foreground leading-relaxed">
                <RichTextHtml html={coverDraft} />
              </div>
            </div>
          )}
          {sections.map(s => (
            <div key={s.id}>
              <h3 className="text-sm font-bold text-foreground mb-2 border-b border-border pb-2">
                {s.ref} — {s.name}
                {s.mandatory && <span className="text-destructive ml-1 text-[10px]">* Required</span>}
              </h3>
              <div className="text-sm text-foreground leading-relaxed">
                <RichTextHtml html={drafts[s.id]} />
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Insert Section Modal */}
      <Modal open={insertOpen} onClose={() => setInsertOpen(false)} title="Insert Section">
        <div className="space-y-4">
          <FormField label="Section name">
            <TextInput value={insertName} onChange={setInsertName} placeholder="e.g. Pricing Narrative" />
          </FormField>
          <FormField label="Insert after">
            <SelectInput value={insertAfter} onChange={setInsertAfter} options={[
              { value: "", label: "At the end" },
              ...sections.map(s => ({ value: s.id, label: s.name })),
            ]} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setInsertOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleInsertSection} disabled={!insertName.trim()}>Insert</PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Add Role Modal */}
      <Modal open={addRoleOpen} onClose={() => setAddRoleOpen(false)} title="Add Role">
        <div className="space-y-4">
          <FormField label="Role title">
            <TextInput value={newRoleName} onChange={setNewRoleName} placeholder="e.g. Security Architect" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setAddRoleOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={() => {
              if (!newRoleName.trim()) return;
              setPersonnelAssignments(prev => ({ ...prev, [newRoleName.trim()]: "" }));
              toast(`Role "${newRoleName.trim()}" added`, "success");
              setAddRoleOpen(false); setNewRoleName("");
            }} disabled={!newRoleName.trim()}>Add Role</PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Add Person for Role Modal */}
      <Modal open={addPersonRoleOpen} onClose={() => setAddPersonRoleOpen(false)} title={`Add Person for ${addPersonForRole}`}>
        <div className="space-y-4">
          <FormField label="Name"><TextInput value={addPersonName} onChange={setAddPersonName} placeholder="e.g. Sarah Chen" /></FormField>
          <FormField label="Title"><TextInput value={addPersonTitle} onChange={setAddPersonTitle} placeholder="e.g. Security Architect" /></FormField>
          <FormField label="Partner"><TextInput value={addPersonPartner} onChange={setAddPersonPartner} placeholder="e.g. Union Systems Group" /></FormField>
          <p className="text-[11px] text-muted-foreground">An action item will be created for the partner to provide this person's resume.</p>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setAddPersonRoleOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={() => {
              if (!addPersonName.trim()) return;
              const newId = `PPL-NEW-${Date.now()}`;
              setPersonnelAssignments(prev => ({ ...prev, [addPersonForRole]: newId }));
              toast(`${addPersonName.trim()} assigned to ${addPersonForRole} — action item created for resume`, "success");
              setAddPersonRoleOpen(false); setAddPersonName(""); setAddPersonTitle(""); setAddPersonPartner("");
            }} disabled={!addPersonName.trim()}>Assign & Create Action Item</PrimaryButton>
          </div>
        </div>
      </Modal>

      <ActionItemResponseModal
        open={actionItem !== null}
        item={actionItem}
        pursuitName={pursuit.name}
        assigneeLabel={actionItem?.assignedPartnerId ? getPartner(actionItem.assignedPartnerId, partners)?.name : actionItem?.assignedInternal ?? undefined}
        onClose={() => setActionItem(null)}
        onSave={updates => {
          if (!actionItem) return;
          const id = actionItem.id;
          const resolved = isResolvedStatus(updates.status);
          onApplyToPursuit(pursuit.id, p => applyActionItemUpdate(p, id, updates, partners));
          toast(resolved ? `${id} resolved — it will be used the next time the response is regenerated` : "Action item updated", "success");
        }}
      />

      <Modal open={confirmCoverOpen} onClose={() => setConfirmCoverOpen(false)} title="Regenerate Cover Letter?">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            This cover letter was edited after it was drafted. Regenerating replaces those edits with a new letter written from the current response sections.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setConfirmCoverOpen(false)}>Keep my edits</SecondaryButton>
            <PrimaryButton onClick={() => { setConfirmCoverOpen(false); requestCoverLetter(true); }}>Regenerate</PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Upload Final Modal */}
      <Modal open={uploadFinalOpen} onClose={() => setUploadFinalOpen(false)} title="Upload Final Submitted Document">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">Upload the final document that was submitted for this response.</p>
          <input type="file" className="oe-field text-xs" onChange={() => {
            toast("Final document uploaded", "success");
            setUploadFinalOpen(false);
          }} />
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setUploadFinalOpen(false)}>Cancel</SecondaryButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
