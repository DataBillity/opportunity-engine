"use client";

import { useState } from "react";
import type { Pursuit, Organization } from "@/lib/mock-data";
import { getPartner } from "@/lib/mock-data";
import { Modal, FormField, TextArea, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

function RecBig({ rec, closed }: { rec: string; closed?: boolean }) {
  if (closed) return <div className="text-xl font-extrabold text-closed">CLOSED</div>;
  const map: Record<string, [string, string]> = {
    go: ["GO", "text-go"],
    nogo: ["NO-GO", "text-nogo"],
    cond: ["CONDITIONS", "text-cond"],
    pending: ["PENDING", "text-muted-foreground"],
  };
  const [label, cls] = map[rec] ?? map.pending!;
  return <div className={`text-xl font-extrabold ${cls}`}>{label}</div>;
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
  pursuit, org, onBack, onDraft, onConfirmDecision,
}: {
  pursuit: Pursuit; org: Organization;
  onBack: () => void; onDraft: () => void;
  onConfirmDecision: (pursuitId: string, decision: "go" | "nogo") => void;
}) {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState<"go" | "nogo" | null>(null);
  const [confirmReason, setConfirmReason] = useState("");
  const [docUploadOpen, setDocUploadOpen] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<string[]>([]);

  function handleConfirm() {
    if (!confirmOpen) return;
    onConfirmDecision(pursuit.id, confirmOpen);
    toast(
      confirmOpen === "go"
        ? `Pursuit "${pursuit.name}" confirmed GO — ready for response drafting`
        : `Pursuit "${pursuit.name}" confirmed NO-GO — pursuit closed`,
      confirmOpen === "go" ? "success" : "warning"
    );
    setConfirmOpen(null);
    setConfirmReason("");
  }

  function handleUploadDoc() {
    const name = `Uploaded_Document_${uploadedDocs.length + 1}.pdf`;
    setUploadedDocs(prev => [...prev, name]);
    toast(`Document "${name}" attached`, "success");
  }

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
              {pursuit.dueDate && <><span>·</span><span>Due {pursuit.dueDate}</span></>}
            </div>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5">
              Recommendation
            </div>
            <RecBig rec={pursuit.rec} closed={pursuit.closed} />
            <div className="text-[11px] text-muted-foreground mt-1">
              Confidence: <span className="font-mono font-semibold text-foreground">{pursuit.confidence}%</span>
            </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {([
              ["Objective", pursuit.docSummary.objective],
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
        </div>

        {/* Documents card */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Documents</h3>
            <button
              onClick={() => setDocUploadOpen(true)}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
            >
              + Upload
            </button>
          </div>
          <div className="p-5">
            <div className="flex flex-wrap gap-2">
              {[...pursuit.documents.map(d => d.name), ...uploadedDocs].map((name, i) => (
                <div key={i} className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-muted/20">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="text-xs font-medium text-foreground">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Requirement mapping card */}
        {pursuit.reqmap.length > 0 && (
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h3 className="oe-card-title">Requirement → Capability Mapping</h3>
              <span className="text-xs text-muted-foreground">
                <span className="font-mono font-semibold text-foreground">
                  {pursuit.reqmap.filter(r => r.status === "mapped").length}
                </span>{" "}
                of {pursuit.reqmap.length} mapped
              </span>
            </div>
            <div className="overflow-x-auto oe-touch-scroll">
              <table className="w-full text-xs">
                <thead>
                  <tr className="oe-table-header">
                    <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Requirement</th>
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
                <div key={item.id} className="px-5 py-3.5 flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground mb-1">{item.description}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {item.assignedPartnerId ? getPartner(item.assignedPartnerId)?.name : item.assignedInternal}
                      {" · Due "}{item.dueAt}
                      {" · Blocks "}{item.gates.join(", ")}
                    </div>
                  </div>
                  <StatusBadge status={item.status} label={item.status} />
                </div>
              ))}
            </div>
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
                  Confirm Go
                </button>
                <button
                  onClick={() => { setConfirmReason(""); setConfirmOpen("nogo"); }}
                  className="text-xs font-semibold px-4 py-2 rounded-md border border-nogo text-nogo bg-card cursor-pointer transition-all hover:bg-nogo-soft"
                >
                  Confirm No-Go
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
            { label: "Intake & shredding", done: true },
            { label: "Triage scored", done: true },
            { label: "Go/No-Go decision", done: pursuit.closed || pursuit.rec === "go", current: !pursuit.closed && pursuit.rec !== "go" },
            { label: "Gap analysis", done: pursuit.gaps.length === 0 && !pursuit.closed },
            { label: "Response drafting", done: false, current: pursuit.rec === "go" && !pursuit.closed },
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
        title={confirmOpen === "go" ? "Confirm Go Decision" : "Confirm No-Go Decision"}
      >
        <div className="space-y-4">
          <div className={cn(
            "p-4 rounded-lg border text-sm",
            confirmOpen === "go"
              ? "bg-[hsl(var(--status-go-soft))] border-[hsl(var(--status-go))]/20 text-[hsl(var(--status-go))]"
              : "bg-[hsl(var(--status-nogo-soft))] border-[hsl(var(--status-nogo))]/20 text-[hsl(var(--status-nogo))]"
          )}>
            {confirmOpen === "go"
              ? `You are confirming GO for "${pursuit.name}". This will advance the pursuit to response drafting.`
              : `You are confirming NO-GO for "${pursuit.name}". This will close the pursuit.`
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
            Reviewer: <span className="text-foreground">J. Tran (Bid Manager)</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setConfirmOpen(null)}>Cancel</SecondaryButton>
            {confirmOpen === "go" ? (
              <button
                onClick={handleConfirm}
                className="text-xs font-semibold px-4 py-2 rounded-md bg-go text-white cursor-pointer transition-all hover:opacity-90 shadow-sm"
              >
                Confirm Go
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                className="text-xs font-semibold px-4 py-2 rounded-md bg-destructive text-white cursor-pointer transition-all hover:opacity-90 shadow-sm"
              >
                Confirm No-Go
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Upload Document Modal */}
      <Modal open={docUploadOpen} onClose={() => setDocUploadOpen(false)} title="Upload Document">
        <div className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <div className="text-3xl mb-2">📄</div>
            <p className="text-xs text-muted-foreground mb-3">
              Drag & drop files here, or click to browse
            </p>
            <button
              onClick={handleUploadDoc}
              className="text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm"
            >
              Select File
            </button>
          </div>
          <div className="flex justify-end pt-2">
            <SecondaryButton onClick={() => setDocUploadOpen(false)}>Done</SecondaryButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
