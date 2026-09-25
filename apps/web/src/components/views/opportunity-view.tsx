"use client";

import { useState, useRef, useEffect } from "react";
import type { Partner, Pursuit, Organization, ResponseActionItem } from "@/lib/mock-data";
import { getPartner } from "@/lib/mock-data";
import { Modal, FormField, TextArea, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { ActionItemResponseModal } from "@/components/action-items/action-item-response-modal";
import { useToast } from "@/components/ui/toast";
import { OutreachComposer } from "@/components/outreach/outreach-composer";
import { DocumentDropzone } from "@/components/pursuit/document-dropzone";
import { applyIngestToPursuit, ingestPursuitDocuments, recLabel } from "@/lib/create-pursuit";
import { recShortLabel } from "@opportunity-engine/core";
import { useOperator } from "@/components/auth/operator-provider";
import { operatorReviewerLabel } from "@/lib/operator-profile";
import { cn } from "@/lib/cn";

function projectTypeOf(pursuit: Pursuit): "rfp" | "rfi" | "sow" {
  return pursuit.projectType ?? (pursuit.lane === "C" ? "sow" : "rfp");
}

function RecBig({ rec, closed, projectType }: { rec: string; closed?: boolean; projectType: "rfp" | "rfi" | "sow" }) {
  if (closed) return <div className="text-xl font-extrabold text-closed">CLOSED</div>;
  const typed = rec === "go" || rec === "nogo" || rec === "cond" || rec === "pending" ? rec : "pending";
  const cls = { go: "text-go", nogo: "text-nogo", cond: "text-cond", pending: "text-muted-foreground" }[typed];
  return <div className={`text-xl font-extrabold ${cls}`}>{recShortLabel(typed, projectType)}</div>;
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls: Record<string, string> = {
    mapped: "oe-status-trace",
    unmapped: "oe-status-nogo",
    Open: "oe-status-cond",
    Done: "oe-status-go",
  };
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md ${cls[status] ?? "oe-status-pending"}`}>
      {label}
    </span>
  );
}

export function OpportunityView({
  pursuit, org, partners, onBack, onDraft,   onConfirmDecision, onUpdatePursuit, onDeletePursuit,
}: {
  pursuit: Pursuit; org: Organization;
  partners?: Partner[];
  onBack: () => void; onDraft: () => void;
  onConfirmDecision: (pursuitId: string, decision: "go" | "nogo") => void;
  onUpdatePursuit: (pursuitId: string, updates: Partial<Pursuit>) => void;
  onDeletePursuit?: (pursuitId: string) => void;
}) {
  const { toast } = useToast();
  const { profile } = useOperator();
  const [confirmOpen, setConfirmOpen] = useState<"go" | "nogo" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmReason, setConfirmReason] = useState("");
  const [docUploadOpen, setDocUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorMessages, setAdvisorMessages] = useState<{ role: "user" | "assistant" | "system"; text: string }[]>([
    { role: "system", text: `AI Advisor ready for "${pursuit.name}". Ask about improving the score, ideal partner composition, or gap closure strategies.` },
  ]);
  const [advisorInput, setAdvisorInput] = useState("");
  const [advisorTyping, setAdvisorTyping] = useState(false);
  const [actionItem, setActionItem] = useState<ResponseActionItem | null>(null);
  const advisorEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { advisorEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [advisorMessages]);

  function sendAdvisorMessage(text: string) {
    if (!text.trim()) return;
    setAdvisorMessages(prev => [...prev, { role: "user", text: text.trim() }]);
    setAdvisorInput("");
    setAdvisorTyping(true);
    const gaps = pursuit.gaps;
    setTimeout(() => {
      let response = "";
      const q = text.toLowerCase();
      if (q.includes("improve") || q.includes("score")) {
        response = `To improve the opportunity score (currently ${pursuit.score}/100), consider:\n\n`;
        if (gaps.length > 0) {
          response += `1. Close ${gaps.length} open capability gap(s):\n`;
          for (const g of gaps) response += `   - ${g.title} (${g.crit})\n`;
        }
        response += `\n2. Upload additional supporting documents to strengthen requirement mapping\n3. Ensure all key personnel have verified availability for the proposed period of performance`;
      } else if (q.includes("partner") || q.includes("gap")) {
        if (gaps.length > 0) {
          response = "Based on the gap analysis, the ideal partner(s) would provide:\n\n";
          for (const g of gaps) response += `- ${g.title}: Look for a partner with ${g.closure}\n`;
          response += "\nConsider reaching out to partners in the Capability Sources graph who cover these gap areas.";
        } else {
          response = "All requirements are currently mapped to consortium capabilities. No additional partner coverage is needed for this opportunity.";
        }
      } else if (q.includes("team") || q.includes("composition")) {
        response = "The ideal team composition for this opportunity would include:\n\n- A Program Manager with public-sector modernization experience\n- A Lead Data Architect with legacy migration expertise\n- A QA & Compliance Lead for certification testing\n\nBased on current gaps, consider adding a partner with specialized capabilities in the unmapped requirement areas.";
      } else {
        response = `I've analyzed the opportunity. The current score is ${pursuit.score}/100 with ${pursuit.reqmap.filter(r => r.status === "mapped").length} of ${pursuit.reqmap.length} requirements mapped. ${gaps.length > 0 ? `There are ${gaps.length} open gap(s) that should be addressed.` : "All requirements are mapped."}\n\nWould you like me to suggest specific strategies to improve the score or identify ideal partners?`;
      }
      setAdvisorMessages(prev => [...prev, { role: "assistant", text: response }]);
      setAdvisorTyping(false);
    }, 800);
  }

  const advisorQuickPrompts = [
    "How can I improve this score?",
    "What partner capabilities would fill the gaps?",
    "What's the ideal team composition?",
  ];

  function handleConfirm() {
    if (!confirmOpen) return;
    onConfirmDecision(pursuit.id, confirmOpen);
    const isRfi = projectTypeOf(pursuit) === "rfi";
    toast(
      confirmOpen === "go"
        ? `Project "${pursuit.name}" confirmed ${isRfi ? "RESPOND" : "GO"} — ready for response drafting`
        : `Project "${pursuit.name}" confirmed ${isRfi ? "PASS" : "NO-GO"} — project closed`,
      confirmOpen === "go" ? "success" : "warning"
    );
    setConfirmOpen(null);
    setConfirmReason("");
  }

  async function handleUploadDocs() {
    if (!uploadFiles.length) return;
    setUploading(true);
    try {
      const result = await ingestPursuitDocuments({
        org,
        lane: pursuit.lane,
        projectType: projectTypeOf(pursuit),
        files: uploadFiles,
        priorText: pursuit.sourceText,
      });
      const next = applyIngestToPursuit(pursuit, result);
      onUpdatePursuit(pursuit.id, next);
      toast(
        result.warning
          ? result.warning
          : `Attached ${result.documents.length} file${result.documents.length === 1 ? "" : "s"} — scored ${next.score} (${recLabel(next.rec, next.projectType)})`,
        result.warning || next.rec === "nogo" ? "warning" : "success",
      );
      setUploadFiles([]);
      setDocUploadOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  const projectType = projectTypeOf(pursuit);
  const isRfi = projectType === "rfi";
  const breakdown = pursuit.scoreBreakdown;
  const mappedCount = pursuit.reqmap.filter(r => r.status === "mapped").length;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
        <button onClick={onBack} className="text-primary font-medium cursor-pointer hover:underline bg-transparent border-none shrink-0">
          Pipeline
        </button>
        <span className="text-muted-foreground shrink-0">/</span>
        <button onClick={onBack} className="text-primary font-medium cursor-pointer hover:underline bg-transparent border-none truncate max-w-[40%]">
          {org.name}
        </button>
        <span className="text-muted-foreground shrink-0">/</span>
        <span className="text-foreground font-medium truncate">{pursuit.name}</span>
      </nav>

    <div className="flex flex-col xl:flex-row gap-4 xl:gap-5 items-stretch xl:items-start">
      <div className="flex-1 min-w-0 space-y-4 order-2 xl:order-1">
        <div className="bg-card rounded-xl border shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row justify-between gap-4 sm:gap-6 items-start">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-foreground mb-1">{pursuit.name}</h1>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
              <span>{pursuit.typeLabel}</span>
              <span>·</span>
              <span className="font-mono">{pursuit.solicitationRef}</span>
              <span>·</span>
              <span>Score <strong className="text-foreground">{pursuit.score}</strong>/100</span>
              {breakdown && (
                <>
                  <span>·</span>
                  <span>{breakdown.mappedCount}/{breakdown.totalRequirements} {isRfi ? "topics" : "reqs"}</span>
                </>
              )}
              {pursuit.dueDate && <><span>·</span><span>Due {pursuit.dueDate}</span></>}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setOutreachOpen(true)}
                className="text-xs font-medium px-3.5 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
              >
                Outreach
              </button>
              <button
                onClick={() => {
                  const delta = Math.floor(Math.random() * 8) - 2;
                  const newScore = Math.max(0, Math.min(100, pursuit.score + delta));
                  onUpdatePursuit(pursuit.id, {
                    score: newScore,
                  });
                  toast(`Score refreshed: ${newScore}`, "success");
                }}
                className="text-xs font-medium px-3.5 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
              >
                Refresh Score
              </button>
              <button
                onClick={() => setDeleteOpen(true)}
                className="text-xs font-medium px-3.5 py-2 rounded-md border border-input bg-card text-destructive cursor-pointer transition-all hover:bg-secondary"
              >
                Delete project
              </button>
            </div>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5">
              Recommendation
            </div>
            <RecBig rec={pursuit.rec} closed={pursuit.closed} projectType={projectType} />
            <div className="text-[11px] text-muted-foreground mt-1">
              Confidence: <span className="font-mono font-semibold text-foreground">{pursuit.confidence}%</span>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">How this was scored</h3>
            <span className="text-[11px] text-muted-foreground font-mono">{isRfi ? "RFI" : "RFP-03"}</span>
          </div>
          <div className="p-5 space-y-3 text-sm text-foreground">
            <p>
              <strong>Score ({pursuit.score}/100)</strong> is opportunity alignment:
              {" "}40% capability, 35% intent/timing, 25% account value
              {breakdown ? ` — capability ${breakdown.capabilityAlignment}, intent ${breakdown.intentTiming}, account ${breakdown.accountValueFit}${breakdown.inboundIntentUplift ? `, inbound +${breakdown.inboundIntentUplift}` : ""}` : ""}.
              It is not a {isRfi ? "Respond" : "Go"} cutoff.
            </p>
            <p>
              <strong>Confidence ({pursuit.confidence}%)</strong>{" "}
              {pursuit.confidenceNote
                ?? "is extraction and mapping certainty, not the opportunity score. Thin requirement mapping keeps confidence near 50% even when intent and account value lift the score."}
            </p>
            <p>
              <strong>Recommendation ({recLabel(pursuit.rec, projectType)})</strong>{" "}
              {isRfi
                ? "uses the purpose, challenges, and likely services — not page limits or the questions in the response worksheet."
                : `uses coverage gates, not “score ≥ 75”. ${recLabel("go", projectType)} needs ≥ ${breakdown?.goCoverageFloor ?? 75}% requirement coverage and score ≥ ${breakdown?.goScoreFloor ?? 68}.`}
              {breakdown && !isRfi && (
                <> Coverage here is {breakdown.mappedCount} of {breakdown.totalRequirements} ({breakdown.coveragePct}%).{breakdown.passFailBlocked ? " An unmapped pass/fail requirement also blocks Go." : ""}{breakdown.documentOverlapCount > 0 ? ` Document language overlap (${breakdown.documentOverlapCount} topics) can lift the score without counting as mapped requirements.` : ""}</>
              )}
              {breakdown?.recRule ? ` ${breakdown.recRule}` : ""}
            </p>
          </div>
        </div>

        {/* Rationale card */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Rationale</h3>
            <span className="text-[11px] text-muted-foreground font-mono">TRIAGE-02</span>
          </div>
          <div className="p-5">
            <ul className="list-disc pl-4 text-sm space-y-2 text-foreground">
              {pursuit.rationale.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        </div>

        {/* Scope summary card */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Scope Summary</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 divide-border">
            {([
              ["Objective", pursuit.docSummary.objective],
              ["Challenges", pursuit.docSummary.challenges ?? []],
              ["Services", pursuit.docSummary.services],
              ["Deliverables", pursuit.docSummary.deliverables],
            ] as const).map(([heading, items]) => (
              <div key={heading} className="p-4 sm:p-5">
                <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">
                  {heading}
                </h4>
                {items.length > 0 ? (
                  <ul className="list-disc pl-4 text-xs space-y-1.5 text-foreground">
                    {items.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Not yet populated.</p>
                )}
              </div>
            ))}
          </div>
          {(pursuit.docSummary.responseConstraints ?? []).length > 0 && (
            <div className="px-5 py-4 border-t border-border bg-muted/20">
              <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">
                Response instructions — not scored
              </h4>
              <ul className="list-disc pl-4 text-xs space-y-1.5 text-foreground">
                {pursuit.docSummary.responseConstraints!.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Documents card */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Documents</h3>
            <button
              onClick={() => { setUploadFiles([]); setDocUploadOpen(true); }}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
            >
              + Upload
            </button>
          </div>
          <div className="p-5">
            <div className="flex flex-wrap gap-2">
              {pursuit.documents.map((doc, i) => (
                <div key={`${doc.name}-${i}`} className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-muted/20">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-foreground block truncate">{doc.name}</span>
                    {doc.parseStatus && (
                      <span className="text-[10px] text-muted-foreground">
                        {doc.parseStatus === "extracted"
                          ? `${doc.extractedChars?.toLocaleString() ?? 0} chars extracted`
                          : doc.parseStatus === "empty"
                            ? "No extractable text"
                            : "Attached · not parsed"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {pursuit.documents.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No solicitation files yet. Upload the {isRfi ? "RFI" : pursuit.lane === "C" ? "SOW" : "RFP or SOW"} to parse and score.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Requirement mapping card */}
        {pursuit.reqmap.length > 0 && (
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h3 className="oe-card-title">{isRfi ? "Scope → Capability" : "Requirement → Capability Mapping"}</h3>
              <span className="text-xs text-muted-foreground">
                <span className="font-mono font-semibold text-foreground">
                  {mappedCount}
                </span>{" "}
                of {pursuit.reqmap.length} {isRfi ? "topics we can speak to" : "mapped"}
              </span>
            </div>
            <div className="overflow-x-auto oe-touch-scroll">
              <table className="w-full text-xs">
                <thead>
                  <tr className="oe-table-header">
                    <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">{isRfi ? "Scope topic" : "Requirement"}</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Status</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Mapped Node</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {pursuit.reqmap.map((r, i) => (
                    <tr key={i} className="oe-table-row border-b border-border last:border-b-0">
                      <td className="px-4 py-3 align-top text-foreground">{r.req}</td>
                      <td className="px-4 py-3 align-top">
                        <StatusBadge
                          status={r.status}
                          label={r.status === "mapped" ? "MAPPED" : "UNMAPPED"}
                        />
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-[11px] text-primary">{r.node ?? "—"}</td>
                      <td className="px-4 py-3 align-top text-muted-foreground">{r.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Gap analysis card */}
        {pursuit.gaps.length > 0 && (
          <div className="bg-card rounded-xl border border-dashed border-destructive/30 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
              <div className="w-2 h-2 rounded-sm bg-cond" />
              <h3 className="oe-card-title">Capability Gap Analysis</h3>
            </div>
            <div className="divide-y divide-border">
              {pursuit.gaps.map(g => (
                <div key={g.id} className="px-4 sm:px-5 py-4 flex flex-col xs:flex-row justify-between gap-2 xs:gap-4 items-start">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] text-muted-foreground mb-0.5">{g.id}</div>
                    <div className="text-sm font-semibold text-foreground mb-1">{g.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Demand: {g.demand} · Closure: {g.closure}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-nogo whitespace-nowrap shrink-0">
                    {g.crit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RFUND card */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">R&D Funding Eligibility (RFUND)</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">Lane {pursuit.rfund.lane}</span>
              <span>·</span>
              <span>{pursuit.rfund.tier}</span>
            </div>
          </div>
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                <span className="block h-full bg-trace rounded-full" style={{ width: `${pursuit.rfund.score}%` }} />
              </div>
              <span className="font-mono font-bold text-sm text-foreground">{pursuit.rfund.score}</span>
            </div>
            <p className="text-xs text-muted-foreground flex-1">{pursuit.rfund.note}</p>
          </div>
        </div>

        {/* Response action items card */}
        {pursuit.responseActionItems && pursuit.responseActionItems.length > 0 && (
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h3 className="oe-card-title">Response Action Items</h3>
              <span className="text-xs font-mono">
                <span className="text-cond font-semibold">
                  {pursuit.responseActionItems.filter(r => r.status === "Open").length}
                </span>{" "}
                <span className="text-muted-foreground">open</span>
              </span>
            </div>
            <div className="divide-y divide-border">
              {pursuit.responseActionItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActionItem(item)}
                  className="w-full text-left px-5 py-3.5 flex justify-between items-start gap-4 hover:bg-muted/30 cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground mb-1">{item.description}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {item.assignedPartnerId ? getPartner(item.assignedPartnerId, partners)?.name : item.assignedInternal}
                      {" · Due "}{item.dueAt}
                      {" · Blocks "}{item.gates.join(", ")}
                    </div>
                  </div>
                  <StatusBadge status={item.status} label={item.status} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Draft status & outcome */}
        {(pursuit.draftStatus || pursuit.outcome) && (
          <div className="bg-card rounded-xl border shadow-sm px-4 sm:px-5 py-4 flex flex-wrap items-center gap-4">
            {pursuit.draftStatus && (
              <div className="text-xs text-muted-foreground">
                Draft: <strong className="text-foreground">{pursuit.draftStatus}</strong>
                {pursuit.draftStatusDate && <span className="font-mono ml-1">({pursuit.draftStatusDate})</span>}
              </div>
            )}
            {pursuit.outcome && (
              <div className="text-xs">
                Outcome:{" "}
                <span className={cn("font-bold px-2 py-0.5 rounded-md text-[10px]",
                  pursuit.outcome === "Won" ? "oe-status-go" : pursuit.outcome === "Lost" ? "oe-status-nogo" : "oe-status-cond"
                )}>
                  {pursuit.outcome}
                </span>
                {pursuit.outcomeDate && <span className="text-muted-foreground font-mono ml-1">({pursuit.outcomeDate})</span>}
              </div>
            )}
          </div>
        )}

        {/* Decision footer */}
        <div className="bg-card rounded-xl border shadow-sm px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="text-xs text-muted-foreground">
            Decision record:{" "}
            <span className="font-mono text-foreground">{pursuit.decisionRecord.id}</span>
            {" · "}{pursuit.decisionRecord.action}
          </div>
          <div className="flex gap-2.5 flex-wrap">
            {!pursuit.closed && pursuit.rec === "go" && (
              <button
                onClick={onDraft}
                className="text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm"
              >
                Open Response Builder →
              </button>
            )}
            {!pursuit.closed && (
              <>
                <button
                  onClick={() => { setConfirmReason(""); setConfirmOpen("go"); }}
                  className="text-xs font-semibold px-4 py-2 rounded-md bg-go text-white cursor-pointer transition-all hover:opacity-90 shadow-sm"
                >
                  Confirm {isRfi ? "Respond" : "Go"}
                </button>
                <button
                  onClick={() => { setConfirmReason(""); setConfirmOpen("nogo"); }}
                  className="text-xs font-semibold px-4 py-2 rounded-md border border-nogo text-nogo bg-card cursor-pointer transition-all hover:bg-nogo-soft"
                >
                  Confirm {isRfi ? "Pass" : "No-Go"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Rail — Pursuit timeline */}
      <div className="w-full xl:w-[240px] shrink-0 bg-card rounded-xl border shadow-sm xl:sticky xl:top-6 overflow-hidden order-1 xl:order-2">
        <div className="px-4 sm:px-5 py-4 border-b border-border">
          <div className="text-[10px] uppercase tracking-widest text-primary font-bold mb-1">{pursuit.typeLabel}</div>
          <div className="text-sm font-bold text-foreground leading-snug">{pursuit.name}</div>
          {pursuit.dueDate && (
            <div className={cn(
              "text-[11px] mt-2.5 px-2.5 py-1.5 rounded-md font-medium inline-block",
              pursuit.closed ? "oe-status-closed" :
              pursuit.rec === "go" ? "oe-status-go" : "oe-status-cond"
            )}>
              {pursuit.closed ? "Closed" : `Due: ${pursuit.dueDate}`}
            </div>
          )}
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex xl:flex-col gap-0 overflow-x-auto oe-touch-scroll xl:overflow-visible pb-1 xl:pb-0">
          {[
            { label: "Intake & shredding", done: pursuit.documents.length > 0 },
            { label: "Triage scored", done: pursuit.rec !== "pending" && !pursuit.status.startsWith("New") },
            { label: isRfi ? "Respond / Pass decision" : "Go/No-Go decision", done: pursuit.closed || pursuit.status.toLowerCase().includes("confirmed"), current: !pursuit.closed && pursuit.rec !== "pending" && !pursuit.status.toLowerCase().includes("confirmed") },
            { label: isRfi ? "Topic coverage" : "Gap analysis", done: pursuit.reqmap.length > 0 && pursuit.gaps.length === 0 && !pursuit.closed },
            { label: isRfi ? "Information response" : "Response drafting", done: false, current: pursuit.rec === "go" && !pursuit.closed },
            { label: "Review & submission", done: false },
          ].map((step, i, arr) => (
            <div key={i} className="flex xl:flex-row flex-col items-center xl:items-start gap-2 xl:gap-3 relative pb-0 xl:pb-5 last:pb-0 min-w-[5.5rem] xl:min-w-0 flex-1 xl:flex-none">
              {i < arr.length - 1 && (
                <>
                  <div className="hidden xl:block absolute left-[5px] top-4 bottom-0 w-px bg-border" />
                  <div className="xl:hidden absolute left-1/2 top-[5px] right-0 h-px bg-border w-full" />
                </>
              )}
              <div className={cn(
                "w-3 h-3 rounded-full border-2 shrink-0 mt-0.5 z-10 transition-all",
                step.done
                  ? "bg-primary border-primary"
                  : step.current
                    ? "bg-card border-primary ring-[3px] ring-primary/15"
                    : "bg-card border-muted"
              )} />
              <span className={cn(
                "text-[10px] xl:text-xs leading-snug text-center xl:text-left",
                step.done ? "text-foreground" :
                step.current ? "font-bold text-primary" :
                "text-muted-foreground"
              )}>
                {step.label}
              </span>
            </div>
          ))}
          </div>
        </div>
      </div>
      </div>

      {/* Confirm Decision Modal */}
      <Modal
        open={confirmOpen !== null}
        onClose={() => setConfirmOpen(null)}
        title={confirmOpen === "go"
          ? (isRfi ? "Confirm Respond" : "Confirm Go Decision")
          : (isRfi ? "Confirm Pass" : "Confirm No-Go Decision")}
      >
        <div className="space-y-4">
          <div className={cn(
            "p-4 rounded-lg border text-sm",
            confirmOpen === "go"
              ? "bg-[hsl(var(--status-go-soft))] border-[hsl(var(--status-go))]/20 text-[hsl(var(--status-go))]"
              : "bg-[hsl(var(--status-nogo-soft))] border-[hsl(var(--status-nogo))]/20 text-[hsl(var(--status-nogo))]"
          )}>
            {confirmOpen === "go"
              ? `You are confirming ${isRfi ? "RESPOND" : "GO"} for "${pursuit.name}". This will advance the project to response drafting.`
              : `You are confirming ${isRfi ? "PASS" : "NO-GO"} for "${pursuit.name}". This will close the project.`
            }
          </div>
          <FormField label="Reason / notes (optional)">
            <TextArea
              value={confirmReason}
              onChange={setConfirmReason}
              placeholder="Add context for the decision record…"
              rows={3}
            />
          </FormField>
          <div className="text-[11px] text-muted-foreground">
            Decision record <span className="font-mono text-foreground">{pursuit.decisionRecord.id}</span> will be updated.
            Reviewer: <span className="text-foreground">{profile ? operatorReviewerLabel(profile) : "Operator"}</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setConfirmOpen(null)}>Cancel</SecondaryButton>
            {confirmOpen === "go" ? (
              <button
                onClick={handleConfirm}
                className="text-xs font-semibold px-4 py-2 rounded-md bg-go text-white cursor-pointer transition-all hover:opacity-90 shadow-sm"
              >
                Confirm {isRfi ? "Respond" : "Go"}
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                className="text-xs font-semibold px-4 py-2 rounded-md bg-destructive text-white cursor-pointer transition-all hover:opacity-90 shadow-sm"
              >
                Confirm {isRfi ? "Pass" : "No-Go"}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Upload Document Modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Project">
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            Delete <strong>{pursuit.name}</strong> from {org.name}? This removes the current assessment. Add the {projectTypeOf(pursuit).toUpperCase()} again and upload the documents to run a full new assessment.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setDeleteOpen(false)}>Cancel</SecondaryButton>
            <button
              onClick={() => {
                onDeletePursuit?.(pursuit.id);
                toast(`Deleted project "${pursuit.name}"`, "success");
                setDeleteOpen(false);
              }}
              className="text-xs font-semibold px-4 py-2 rounded-md bg-destructive text-white cursor-pointer transition-all hover:opacity-90 shadow-sm"
            >
              Delete project
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={docUploadOpen} onClose={() => !uploading && setDocUploadOpen(false)} title="Upload Document">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Additional files are parsed and folded into this project’s {isRfi ? "Respond / Pass" : "Go/No-Go"} packet and later response grounding.
          </p>
          <DocumentDropzone files={uploadFiles} onChange={setUploadFiles} disabled={uploading} />
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setDocUploadOpen(false)} disabled={uploading}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleUploadDocs} disabled={!uploadFiles.length || uploading}>
              {uploading ? "Parsing & scoring…" : "Upload & score"}
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      <OutreachComposer
        open={outreachOpen}
        org={org}
        pursuits={[pursuit]}
        initialPursuitId={pursuit.id}
        onClose={() => setOutreachOpen(false)}
      />

      {/* AI Advisor panel */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <button
          onClick={() => setAdvisorOpen(prev => !prev)}
          className="w-full px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors"
        >
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10H12V2Z" /><path d="M12 2a10 10 0 0 1 10 10" /><circle cx="12" cy="12" r="3" />
            </svg>
            AI Advisor
          </h3>
          <span className="text-xs text-muted-foreground">{advisorOpen ? "▲ Collapse" : "▼ Expand"}</span>
        </button>
        {advisorOpen && (
          <div className="border-t border-border">
            <div className="p-4 flex flex-col gap-2.5 max-h-[300px] overflow-y-auto">
              {advisorMessages.map((msg, i) => (
                <div key={i} className={cn("px-3.5 py-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap",
                  msg.role === "user" ? "self-end bg-primary text-primary-foreground rounded-br-sm max-w-[90%]" :
                  msg.role === "assistant" ? "self-start bg-accent text-accent-foreground rounded-tl-sm max-w-[90%]" :
                  "self-start bg-muted/50 text-foreground rounded-tl-sm max-w-[90%]"
                )}>
                  {msg.role === "system" && <span className="text-[9px] uppercase tracking-widest text-trace font-bold block mb-1">System</span>}
                  {msg.role === "assistant" && <span className="text-[9px] uppercase tracking-widest text-primary font-bold block mb-1">AI Advisor</span>}
                  {msg.text}
                </div>
              ))}
              {advisorTyping && (
                <div className="self-start bg-accent text-accent-foreground px-3.5 py-2.5 rounded-xl rounded-tl-sm text-xs">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </div>
              )}
              <div ref={advisorEndRef} />
            </div>
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">
              {advisorQuickPrompts.map(s => (
                <button key={s} onClick={() => sendAdvisorMessage(s)} disabled={advisorTyping}
                  className="text-[11px] px-3 py-1.5 border border-border bg-card rounded-lg cursor-pointer text-foreground hover:border-primary/40 hover:bg-accent/50 transition-all disabled:opacity-50">{s}</button>
              ))}
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-border bg-muted/20">
              <input type="text" value={advisorInput} onChange={e => setAdvisorInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !advisorTyping) sendAdvisorMessage(advisorInput); }}
                placeholder="Ask about this opportunity…" className="oe-field flex-1" />
              <button onClick={() => sendAdvisorMessage(advisorInput)} disabled={!advisorInput.trim() || advisorTyping}
                className="text-xs font-semibold px-3 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">Send</button>
            </div>
          </div>
        )}
      </div>
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
    </div>
  );
}
