"use client";

import { useState, useRef, useEffect } from "react";
import type { Pursuit } from "@/lib/mock-data";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

interface SectionMeta {
  id: string;
  name: string;
  ref: string;
  trace: "full" | "partial" | "none";
  tracePct: string;
}

const initialSections: SectionMeta[] = [
  { id: "tech", name: "Technical Approach", ref: "Vol I § 3.2", trace: "partial", tracePct: "92%" },
  { id: "past", name: "Past Performance", ref: "Vol I § 3.4", trace: "full", tracePct: "100%" },
  { id: "pers", name: "Key Personnel", ref: "Vol I § 3.5", trace: "full", tracePct: "—" },
  { id: "mgmt", name: "Management Plan", ref: "Vol I § 3.6", trace: "none", tracePct: "Not started" },
];

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

interface ChatMessage {
  role: "system" | "user" | "assistant";
  text: string;
}

const copilotResponses: Record<string, string> = {
  "Strengthen the fraud analytics paragraph": "I've enhanced the fraud analytics paragraph with specific metrics and methodology details. The updated text now references the supervised ML model's 94.2% precision rate on historical claims data and adds detail about the real-time scoring pipeline architecture.",
  "Add a risk mitigation section": "I've added a risk mitigation section addressing three key areas: (1) data migration integrity with automated reconciliation checks, (2) system availability during phased cutover with rollback procedures, and (3) knowledge transfer continuity with documented runbooks.",
  "Which claims aren't source-traced?": "Two assertions in the current draft lack direct source tracing:\n\n1. \"zero-downtime transitions\" — referenced in EXP-0512 narrative but specific metric not in verified data\n2. \"reduced average claim processing time by 34%\" — appears in experience summary but underlying measurement methodology not documented\n\nRecommendation: Verify both claims with PTR-U before submission.",
};

export function ResponseBuilderView({
  pursuit,
  onBack,
  onUpdatePursuit,
}: {
  pursuit: Pursuit;
  onBack: () => void;
  onUpdatePursuit: (pursuitId: string, updates: Partial<Pursuit>) => void;
}) {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("tech");
  const [sections, setSections] = useState<SectionMeta[]>(initialSections);
  const [drafts, setDrafts] = useState<Record<string, string>>({ ...seedDraftContent });
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [assertionResults, setAssertionResults] = useState<{ text: string; traced: boolean }[] | null>(null);
  const [reviewedSections, setReviewedSections] = useState<Set<string>>(new Set());

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "system",
      text: "Draft generated from 2 matched capability nodes and 4 experience references. 92% of assertions are source-traced.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatTyping, setChatTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleGenerateDraft() {
    setGenerating(true);
    setTimeout(() => {
      setDrafts(prev => ({ ...prev, [activeSection]: generatedMgmtDraft }));
      setSections(prev =>
        prev.map(s =>
          s.id === activeSection ? { ...s, trace: "partial", tracePct: "78%" } : s
        )
      );
      setMessages(prev => [
        ...prev,
        { role: "system", text: `Draft generated for "${sections.find(s => s.id === activeSection)?.name}". 78% of assertions are source-traced. Review recommended before submission.` },
      ]);
      setGenerating(false);
      toast("Draft generated from capability graph and experience nodes", "success");
    }, 1500);
  }

  function handleRegenerate() {
    setGenerating(true);
    setTimeout(() => {
      const current = drafts[activeSection] || "";
      setDrafts(prev => ({
        ...prev,
        [activeSection]: current + "\n\n[Regenerated passage] Additional detail has been incorporated from recent experience nodes and updated capability evidence to strengthen the response alignment with evaluation criteria.",
      }));
      setGenerating(false);
      toast("Section regenerated with updated evidence", "success");
      setMessages(prev => [
        ...prev,
        { role: "system", text: `Section "${sections.find(s => s.id === activeSection)?.name}" regenerated. New evidence from 2 additional experience nodes incorporated.` },
      ]);
    }, 1200);
  }

  function handleCheckAssertions() {
    setChecking(true);
    setAssertionResults(null);
    setTimeout(() => {
      const content = drafts[activeSection] || "";
      const sentences = content.split(/\.\s+/).filter(s => s.length > 20).slice(0, 8);
      const results = sentences.map((s, i) => ({
        text: s.slice(0, 80) + (s.length > 80 ? "…" : ""),
        traced: i < sentences.length - 2 || Math.random() > 0.4,
      }));
      setAssertionResults(results);
      setChecking(false);
      const traced = results.filter(r => r.traced).length;
      toast(`Assertion check complete: ${traced}/${results.length} traced`, traced === results.length ? "success" : "warning");
    }, 1000);
  }

  function handleMarkReviewed() {
    setReviewedSections(prev => {
      const next = new Set(prev);
      next.add(activeSection);
      return next;
    });
    setSections(prev =>
      prev.map(s =>
        s.id === activeSection ? { ...s, trace: "full" as const, tracePct: "Reviewed ✓" } : s
      )
    );
    toast(`"${sections.find(s => s.id === activeSection)?.name}" marked as reviewed`, "success");
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
          ? "Based on the capability graph and matched experience nodes, here's what I found:\n\n• All key personnel references are verified against PPL records\n• Technical approach aligns with 4 of 4 stated requirements\n• Recommend reviewing the timeline assumptions against the PoP constraints"
          : "I've updated the section content to reflect your requested changes. The trace percentage has been recalculated — please run 'Check assertions' to verify source coverage."
        }`;
      setMessages(prev => [...prev, { role: "assistant", text: response }]);
      setChatTyping(false);
    }, 800 + Math.random() * 600);
  }

  const quickPrompts = [
    "Strengthen the fraud analytics paragraph",
    "Add a risk mitigation section",
    "Which claims aren't source-traced?",
  ];

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
        <button onClick={onBack} className="text-primary font-medium cursor-pointer hover:underline bg-transparent border-none shrink-0">
          ← Back to opportunity
        </button>
        <span className="hidden xs:inline">/</span>
        <span className="hidden xs:inline text-foreground font-medium truncate">Response Builder — {pursuit.name}</span>
      </nav>

      <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-start">
        {/* Section nav card */}
        <div className="w-full xl:w-[240px] shrink-0 bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-4 py-3 text-[10px] text-muted-foreground border-b border-border bg-muted/40 font-medium">
            Sections per compliance matrix (RFP-04)
          </div>
          <div className="flex xl:flex-col overflow-x-auto oe-touch-scroll xl:overflow-visible">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => { setActiveSection(s.id); setAssertionResults(null); }}
              className={cn(
                "flex justify-between items-center gap-2 w-full px-4 py-3 border-b xl:border-b border-r xl:border-r-0 border-border cursor-pointer text-left text-xs transition-all min-w-[11.5rem] xl:min-w-0",
                "hover:bg-muted/20",
                activeSection === s.id
                  ? "bg-accent border-l-[3px] border-l-primary"
                  : "bg-card border-l-[3px] border-l-transparent"
              )}
            >
              <div className="min-w-0">
                <span className="block font-mono text-[9px] text-muted-foreground uppercase tracking-wider">{s.ref}</span>
                <span className="font-semibold text-foreground">{s.name}</span>
              </div>
              <span className={cn(
                "font-mono text-[10px] px-1.5 py-0.5 rounded-md shrink-0 font-semibold",
                reviewedSections.has(s.id) ? "oe-status-go" :
                s.trace === "full" ? "oe-status-trace" :
                s.trace === "partial" ? "oe-status-cond" :
                "oe-status-pending"
              )}>
                {reviewedSections.has(s.id) ? "Reviewed ✓" : s.tracePct}
              </span>
            </button>
          ))}
          </div>

          {/* Overall progress */}
          <div className="px-4 py-3 bg-muted/20 border-t border-border xl:border-t-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">
              Completion
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${(sections.filter(s => drafts[s.id]).length / sections.length) * 100}%` }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5">
              {sections.filter(s => drafts[s.id]).length} of {sections.length} sections drafted
              {reviewedSections.size > 0 && ` · ${reviewedSections.size} reviewed`}
            </div>
          </div>
        </div>

        {/* Draft workspace */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Personnel ribbon */}
          <div className="bg-card rounded-xl border shadow-sm px-5 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Referenced personnel
            </span>
            {["Priya Nandakumar", "Marcus Webb", "Dana Whitfield"].map(name => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 border border-primary/20 bg-accent px-2.5 py-1 rounded-full text-[11px] text-accent-foreground font-medium cursor-pointer hover:border-primary/40 transition-all group relative"
              >
                <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-bold text-primary">
                  {name.split(" ").map(n => n[0]).join("")}
                </div>
                {name}
              </span>
            ))}
          </div>

          {/* Document editor */}
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="p-5 sm:p-8 min-h-[200px] sm:min-h-[260px]">
              <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-4">
                {sections.find(s => s.id === activeSection)?.name}
              </h4>
              {generating ? (
                <div className="flex items-center gap-3 py-12 justify-center">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-muted-foreground">Generating draft from capability graph…</span>
                </div>
              ) : drafts[activeSection] ? (
                <div
                  className="text-[15px] leading-[1.75] text-foreground whitespace-pre-wrap font-[400]"
                  style={{ fontFamily: "'Charter', 'Iowan Old Style', Georgia, 'Times New Roman', serif" }}
                >
                  {drafts[activeSection]}
                </div>
              ) : (
                <div className="text-muted-foreground italic text-sm">
                  This section has not been drafted yet. Click <strong className="text-foreground">"Generate draft"</strong> to produce a grounded first pass from the compliance matrix requirements and matched capability nodes.
                </div>
              )}
            </div>
          </div>

          {/* Assertion check results */}
          {assertionResults && (
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h4 className="text-xs font-semibold text-foreground">Assertion Trace Results</h4>
                <button
                  onClick={() => setAssertionResults(null)}
                  className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
              <div className="divide-y divide-border">
                {assertionResults.map((r, i) => (
                  <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                    <span className={cn(
                      "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0",
                      r.traced ? "oe-status-go" : "oe-status-nogo"
                    )}>
                      {r.traced ? "TRACED" : "UNTRACED"}
                    </span>
                    <span className="text-xs text-foreground truncate">{r.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2.5 flex-wrap">
            {!drafts[activeSection] && (
              <button
                onClick={handleGenerateDraft}
                disabled={generating}
                className="text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm disabled:opacity-50"
              >
                Generate draft
              </button>
            )}
            {drafts[activeSection] && (
              <button
                onClick={handleRegenerate}
                disabled={generating}
                className="text-xs font-medium px-4 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary disabled:opacity-50"
              >
                {generating ? "Regenerating…" : "Regenerate section"}
              </button>
            )}
            {drafts[activeSection] && (
              <button
                onClick={handleCheckAssertions}
                disabled={checking}
                className="text-xs font-medium px-4 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary disabled:opacity-50"
              >
                {checking ? "Checking…" : "Check assertions"}
              </button>
            )}
            {drafts[activeSection] && !reviewedSections.has(activeSection) && (
              <button
                onClick={handleMarkReviewed}
                className="text-xs font-semibold px-4 py-2 rounded-md bg-go text-white cursor-pointer transition-all hover:opacity-90 shadow-sm"
              >
                Mark as reviewed
              </button>
            )}
            {reviewedSections.has(activeSection) && (
              <span className="text-xs font-semibold px-4 py-2 rounded-md bg-[hsl(var(--status-go-soft))] text-[hsl(var(--status-go))]">
                ✓ Reviewed
              </span>
            )}
          </div>
        </div>

        {/* Copilot panel */}
        <div className="w-full xl:w-[290px] shrink-0 bg-card rounded-xl border shadow-sm flex flex-col overflow-hidden min-h-[320px] xl:min-h-[520px]">
          <div className="px-4 py-3.5 border-b border-border">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 1 0 10 10H12V2Z" />
                <path d="M12 2a10 10 0 0 1 10 10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Section Copilot
            </h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              Ask about the section, request changes, or check claims.
            </p>
          </div>

          {/* Messages */}
          <div className="p-4 flex flex-col gap-2.5 max-h-[340px] overflow-y-auto flex-1">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "px-3.5 py-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap",
                  msg.role === "user"
                    ? "self-end bg-primary text-primary-foreground rounded-br-sm max-w-[90%]"
                    : msg.role === "assistant"
                      ? "self-start bg-accent text-accent-foreground rounded-tl-sm max-w-[90%]"
                      : "self-start bg-muted/50 text-foreground rounded-tl-sm max-w-[90%]"
                )}
              >
                {msg.role === "system" && (
                  <span className="text-[9px] uppercase tracking-widest text-trace font-bold block mb-1">System</span>
                )}
                {msg.role === "assistant" && (
                  <span className="text-[9px] uppercase tracking-widest text-primary font-bold block mb-1">Copilot</span>
                )}
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

          {/* Quick prompts */}
          <div className="flex flex-col gap-1.5 px-4 pb-3">
            {quickPrompts.map(s => (
              <button
                key={s}
                onClick={() => sendChatMessage(s)}
                disabled={chatTyping}
                className="text-[11px] px-3 py-2 border border-border bg-card rounded-lg cursor-pointer text-left text-foreground hover:border-primary/40 hover:bg-accent/50 transition-all disabled:opacity-50 disabled:cursor-wait"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2 px-4 py-3 border-t border-border bg-muted/20">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !chatTyping) sendChatMessage(chatInput);
              }}
              placeholder="Ask about this section…"
              className="oe-field flex-1"
            />
            <button
              onClick={() => sendChatMessage(chatInput)}
              disabled={!chatInput.trim() || chatTyping}
              className="text-xs font-semibold px-3 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
