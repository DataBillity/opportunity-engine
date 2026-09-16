"use client";

import { useState, useRef, useEffect } from "react";
import type { GraphPerson, Partner, Pursuit, ResponseActionItem } from "@/lib/mock-data";
import { getPartner } from "@/lib/mock-data";
import { Modal, FormField, TextInput, TextArea, SelectInput, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { ActionItemResponseModal } from "@/components/action-items/action-item-response-modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { rankPeopleForRole } from "@/lib/personnel-fit";

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

function sectionsForPursuit(pursuit: Pursuit): SectionMeta[] {
  if (pursuit.id === "OPP-2219") return initialSections;
  if (pursuit.complianceMatrix?.length) {
    return pursuit.complianceMatrix.map(item => ({
      id: item.sectionId, name: item.title, ref: item.ref,
      trace: "none" as const, tracePct: "Not started", mandatory: true,
    }));
  }
  return [
    { id: "tech", name: "Technical Approach", ref: "Approach", trace: "none", tracePct: "Not started", mandatory: true },
    { id: "scope", name: "Scope Response", ref: "Scope", trace: "none", tracePct: "Not started", mandatory: true },
    { id: "mgmt", name: "Management & Delivery", ref: "Delivery", trace: "none", tracePct: "Not started", mandatory: false },
  ];
}

function draftsForPursuit(pursuit: Pursuit, sections: SectionMeta[]): Record<string, string> {
  if (pursuit.id === "OPP-2219") return { ...seedDraftContent };
  return Object.fromEntries(sections.map(section => [section.id, ""]));
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

const copilotResponses: Record<string, string> = {
  "Strengthen the fraud analytics paragraph": "I've enhanced the fraud analytics paragraph with specific metrics and methodology details.",
  "Add a risk mitigation section": "I've added a risk mitigation section addressing three key areas.",
  "Which claims aren't source-traced?": "Two assertions in the current draft lack direct source tracing.",
};

export function ResponseBuilderEmptyState({
  orgName,
  onOpenOpportunity,
}: {
  orgName?: string;
  onOpenOpportunity: () => void;
}) {
  return (
    <div className="bg-card rounded-xl border shadow-sm px-6 py-16 text-center">
      <h2 className="text-base font-semibold text-foreground">Response Builder</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        {orgName
          ? `No confirmed Go pursuit for ${orgName}. Confirm Go on an opportunity before drafting a response.`
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

export function ResponseBuilderView({
  pursuit, onBack, onUpdatePursuit, partners, people,
}: {
  pursuit: Pursuit; onBack: () => void;
  onUpdatePursuit: (pursuitId: string, updates: Partial<Pursuit>) => void;
  partners?: Partner[];
  people?: GraphPerson[];
}) {
  const { toast } = useToast();
  const [sections, setSections] = useState<SectionMeta[]>(() => sectionsForPursuit(pursuit));
  const [activeSection, setActiveSection] = useState(() => sectionsForPursuit(pursuit)[0]?.id ?? "tech");
  const [drafts, setDrafts] = useState<Record<string, string>>(() => draftsForPursuit(pursuit, sectionsForPursuit(pursuit)));
  const [generating, setGenerating] = useState(false);
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
  const [personnelAssignments, setPersonnelAssignments] = useState<Record<string, string>>({
    "Program Manager": "PPL-118",
    "Lead Data Architect": "PPL-119",
    "QA & Compliance Lead": "PPL-120",
  });
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [addPersonRoleOpen, setAddPersonRoleOpen] = useState(false);
  const [addPersonForRole, setAddPersonForRole] = useState("");
  const [addPersonName, setAddPersonName] = useState("");
  const [addPersonTitle, setAddPersonTitle] = useState("");
  const [addPersonPartner, setAddPersonPartner] = useState("");
  const [actionItem, setActionItem] = useState<ResponseActionItem | null>(null);

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

  function handleGenerateDraft() {
    const section = sections.find(item => item.id === activeSection);
    if (!section) return;
    setGenerating(true);
    setTimeout(() => {
      const content = pursuit.id === "OPP-2219" && activeSection === "mgmt" ? generatedMgmtDraft : outlineSection(pursuit, section);
      setDrafts(prev => ({ ...prev, [activeSection]: content }));
      setSections(prev => prev.map(s => s.id === activeSection ? { ...s, trace: "partial", tracePct: pursuit.sourceText ? "packet" : "78%" } : s));
      setMessages(prev => [...prev, { role: "system", text: `Draft generated for "${section.name}".` }]);
      setGenerating(false);
      toast("Draft generated from the solicitation packet and capability map", "success");
    }, 1500);
  }

  function handleRegenerate() {
    setGenerating(true);
    setTimeout(() => {
      const current = drafts[activeSection] || "";
      setDrafts(prev => ({ ...prev, [activeSection]: current + "\n\n[Regenerated passage] Additional detail incorporated." }));
      // Flag other sections for review
      setSections(prev => prev.map(s => s.id !== activeSection && drafts[s.id] ? { ...s, reviewNeeded: true } : s));
      setGenerating(false);
      toast("Section regenerated — other sections flagged for review", "success");
    }, 1200);
  }

  function handleCheckAssertions() {
    setChecking(true);
    setAssertionResults(null);
    setTimeout(() => {
      const content = drafts[activeSection] || "";
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
    setSections(prev => {
      if (!insertAfter) return [...prev, newSection];
      const idx = prev.findIndex(s => s.id === insertAfter);
      if (idx < 0) return [...prev, newSection];
      const next = [...prev];
      next.splice(idx + 1, 0, newSection);
      return next;
    });
    setDrafts(prev => ({ ...prev, [newId]: "" }));
    toast(`Section "${insertName.trim()}" inserted`, "success");
    setInsertOpen(false);
    setInsertName("");
  }

  function handleExportWord() {
    const allText = sections.map(s => `# ${s.name} (${s.ref})\n\n${drafts[s.id] || "[Not drafted]"}`).join("\n\n---\n\n");
    const blob = new Blob([allText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pursuit.name.replace(/[^a-zA-Z0-9]/g, "_")}_Draft.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Draft exported as text document", "success");
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

  const isKeyPersonnel = activeSection === "pers";
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

      <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-start">
        {/* Section nav card */}
        <div className="w-full xl:w-[260px] shrink-0 bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-4 py-3 text-[10px] text-muted-foreground border-b border-border bg-muted/40 font-medium flex items-center justify-between">
            <span>Sections per compliance matrix</span>
            <button onClick={() => setInsertOpen(true)} className="text-primary font-semibold cursor-pointer hover:underline">+ Insert</button>
          </div>
          <div className="flex xl:flex-col overflow-x-auto oe-touch-scroll xl:overflow-visible">
            {sections.map(s => (
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
                </div>
                <span className={cn("font-mono text-[10px] px-1.5 py-0.5 rounded-md shrink-0 font-semibold",
                  reviewedSections.has(s.id) ? "oe-status-go" :
                  s.trace === "full" ? "oe-status-trace" :
                  s.trace === "partial" ? "oe-status-cond" : "oe-status-pending"
                )}>{reviewedSections.has(s.id) ? "Reviewed ✓" : s.tracePct}</span>
              </button>
            ))}
          </div>
          <div className="px-4 py-3 bg-muted/20 border-t border-border xl:border-t-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Completion</div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(sections.filter(s => drafts[s.id]).length / sections.length) * 100}%` }} />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5">
              {sections.filter(s => drafts[s.id]).length} of {sections.length} sections drafted
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

          {/* Personnel ribbon (non-personnel sections) */}
          {!isKeyPersonnel && (
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

          {/* Document editor */}
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="p-5 sm:p-8 min-h-[200px] sm:min-h-[260px]">
              <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-4">
                {sections.find(s => s.id === activeSection)?.name}
                {sections.find(s => s.id === activeSection)?.mandatory && <span className="text-destructive ml-1">* Required</span>}
              </h4>
              {generating ? (
                <div className="flex items-center gap-3 py-12 justify-center">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-muted-foreground">Generating draft from capability graph…</span>
                </div>
              ) : drafts[activeSection] ? (
                <div className="text-[15px] leading-[1.75] text-foreground whitespace-pre-wrap font-[400]" style={{ fontFamily: "'Charter', 'Iowan Old Style', Georgia, 'Times New Roman', serif" }}>
                  {drafts[activeSection]}
                </div>
              ) : (
                <div className="text-muted-foreground italic text-sm">
                  This section has not been drafted yet. Click <strong className="text-foreground">"Generate draft"</strong> to produce a grounded first pass.
                </div>
              )}
            </div>
          </div>

          {/* Assertion check results */}
          {assertionResults && (
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
          <div className="flex gap-2.5 flex-wrap">
            {!drafts[activeSection] && (
              <button onClick={handleGenerateDraft} disabled={generating} className="text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm disabled:opacity-50">Generate draft</button>
            )}
            {drafts[activeSection] && (
              <button onClick={handleRegenerate} disabled={generating} className="text-xs font-medium px-4 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary disabled:opacity-50">{generating ? "Regenerating…" : "Regenerate section"}</button>
            )}
            {drafts[activeSection] && (
              <button onClick={handleCheckAssertions} disabled={checking} className="text-xs font-medium px-4 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary disabled:opacity-50">{checking ? "Checking…" : "Check assertions"}</button>
            )}
            {drafts[activeSection] && !reviewedSections.has(activeSection) && (
              <button onClick={handleMarkReviewed} className="text-xs font-semibold px-4 py-2 rounded-md bg-go text-white cursor-pointer transition-all hover:opacity-90 shadow-sm">Mark as reviewed</button>
            )}
            {reviewedSections.has(activeSection) && (
              <span className="text-xs font-semibold px-4 py-2 rounded-md bg-[hsl(var(--status-go-soft))] text-[hsl(var(--status-go))]">✓ Reviewed</span>
            )}
          </div>

          {/* Action items panel */}
          {pursuit.responseActionItems && pursuit.responseActionItems.length > 0 && (
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                <h3 className="oe-card-title">Outstanding Action Items</h3>
                <span className="text-xs font-mono">
                  <span className="text-cond font-semibold">{pursuit.responseActionItems.filter(r => r.status === "Open").length}</span> open
                </span>
              </div>
              <div className="overflow-x-auto oe-touch-scroll">
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="oe-table-header">
                      <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Description</th>
                      <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Assigned</th>
                      <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Due Date</th>
                      <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Status</th>
                      <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Gates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pursuit.responseActionItems.map(item => (
                      <tr
                        key={item.id}
                        className="oe-table-row border-b border-border last:border-b-0 cursor-pointer"
                        onClick={() => setActionItem(item)}
                      >
                        <td className="px-4 py-3 text-foreground">{item.description}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.assignedPartnerId ? getPartner(item.assignedPartnerId, partners)?.name : item.assignedInternal}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono">{item.dueAt}</td>
                        <td className="px-4 py-3">
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md", item.status === "Open" ? "oe-status-cond" : "oe-status-go")}>{item.status}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.gates.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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

      {/* Full Preview Modal */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Full Response Preview" wide>
        <div className="max-h-[70vh] overflow-y-auto space-y-6 p-2">
          {sections.map(s => (
            <div key={s.id}>
              <h3 className="text-sm font-bold text-foreground mb-2 border-b border-border pb-2">
                {s.ref} — {s.name}
                {s.mandatory && <span className="text-destructive ml-1 text-[10px]">* Required</span>}
              </h3>
              <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed" style={{ fontFamily: "'Charter', Georgia, serif" }}>
                {drafts[s.id] || <span className="text-muted-foreground italic">Not yet drafted.</span>}
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
          onUpdatePursuit(pursuit.id, {
            responseActionItems: (pursuit.responseActionItems ?? []).map(item =>
              item.id === actionItem.id ? { ...item, ...updates } : item
            ),
          });
          toast("Action item updated", "success");
        }}
      />

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
