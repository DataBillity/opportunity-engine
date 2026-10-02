"use client";

import { useState, useRef, useEffect } from "react";
import type { GraphData, Partner, Pursuit, Organization, ResponseActionItem } from "@/lib/mock-data";
import { getPartner } from "@/lib/mock-data";
import { Modal, FormField, TextArea, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { ActionItemResponseModal } from "@/components/action-items/action-item-response-modal";
import { useToast } from "@/components/ui/toast";
import { OutreachComposer } from "@/components/outreach/outreach-composer";
import { DocumentDropzone } from "@/components/pursuit/document-dropzone";
import { RfiScopeSummaryBody } from "./rfi-scope-summary";
import { RfpGoNoGoAssessmentView } from "./rfp-gonogo-assessment";
import { applyIngestToPursuit, ingestPursuitDocuments, recLabel } from "@/lib/create-pursuit";
import { recShortLabel } from "@opportunity-engine/core";
import { useOperator } from "@/components/auth/operator-provider";
import { operatorReviewerLabel } from "@/lib/operator-profile";
import {
  applyClose,
  applyReopen,
  decisionOf,
  isOverride,
  partnerComposition as buildPartnerComposition,
  platformRecommendation,
  projectTypeOf,
  applyGoNoGoRerun,
  reassessForTeam,
  teamIdsFor,
} from "@/lib/pursuit-assessment";
import { requestGoNoGoAssessment } from "@/lib/gonogo-client";
import { gapForRequirement } from "@opportunity-engine/core";
import { GapLogActionItems } from "@/components/action-items/gap-log-action-items";
import { applyActionItemUpdate, gapLogRows, gapsToActionItems, isResolvedStatus } from "@/lib/gap-log";
import { cn } from "@/lib/cn";

const REC_TEXT = { go: "text-go", nogo: "text-nogo", cond: "text-cond", pending: "text-muted-foreground" } as const;

function RecBig({ rec, closed, projectType }: { rec: string; closed?: boolean; projectType: "rfp" | "rfi" | "sow" }) {
  if (closed) return <div className="text-xl font-extrabold text-closed">CLOSED</div>;
  const typed = rec === "go" || rec === "nogo" || rec === "cond" || rec === "pending" ? rec : "pending";
  return <div className={`text-xl font-extrabold ${REC_TEXT[typed]}`}>{recShortLabel(typed, projectType)}</div>;
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function OpportunityView({
  pursuit, org, partners, graph, onBack, onDraft,   onConfirmDecision, onUpdatePursuit, onDeletePursuit,
}: {
  pursuit: Pursuit; org: Organization;
  partners?: Partner[];
  graph?: GraphData;
  onBack: () => void; onDraft: () => void;
  onConfirmDecision: (pursuitId: string, decision: "go" | "nogo", meta: { reason: string; reviewer: string }) => void;
  onUpdatePursuit: (pursuitId: string, updates: Partial<Pursuit>) => void;
  onDeletePursuit?: (pursuitId: string) => void;
}) {
  const { toast } = useToast();
  const { profile } = useOperator();
  const reviewer = profile ? operatorReviewerLabel(profile) : "Operator";
  const [confirmOpen, setConfirmOpen] = useState<"go" | "nogo" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmReason, setConfirmReason] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
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
  const logRows = gapLogRows(pursuit, partners);
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
          response += "\nConsider reaching out to partners in the Partner Network who cover these gap areas.";
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

  const allPartners = partners ?? [];
  const activePartners = allPartners.filter(p => p.status !== "Archived");

  const partnerComposition = buildPartnerComposition(pursuit, allPartners, graph);
  const teamIds = teamIdsFor(pursuit, allPartners, graph);
  const [addPartnerToOppOpen, setAddPartnerToOppOpen] = useState(false);
  const [assessing, setAssessing] = useState(false);

  function reassessCoverage(nextTeam: string[], trigger: "partner_added" | "partner_removed" | "rerun", partner?: Partner) {
    if (!graph) {
      onUpdatePursuit(pursuit.id, { includedPartnerIds: nextTeam });
      return;
    }
    const outcome = reassessForTeam({
      pursuit,
      partners: allPartners,
      graph,
      teamIds: nextTeam,
      trigger,
      partnerName: partner?.name,
    });
    onUpdatePursuit(pursuit.id, outcome.updates);
    const worse = outcome.updates.score !== undefined && outcome.updates.score < pursuit.score;
    toast(outcome.summary, worse ? "warning" : "success");
  }

  async function reassess(nextTeam: string[], trigger: "partner_added" | "partner_removed" | "rerun", partner?: Partner) {
    if (pursuit.goNoGo && projectTypeOf(pursuit) === "rfp" && !pursuit.sourceText?.trim()) {
      onUpdatePursuit(pursuit.id, { includedPartnerIds: nextTeam });
      toast("The RFP text is no longer available, so the Go/No-Go recommendation was left as it is.", "warning");
      return;
    }
    const rerunModel = projectTypeOf(pursuit) === "rfp" && Boolean(pursuit.sourceText?.trim()) && (pursuit.goNoGo || trigger === "rerun");
    if (!rerunModel) {
      reassessCoverage(nextTeam, trigger, partner);
      return;
    }
    if (assessing) return;
    setAssessing(true);
    try {
      const result = await requestGoNoGoAssessment({
        sourceText: pursuit.sourceText ?? "",
        documentNames: pursuit.documents.map(doc => doc.name),
        organizationName: org.name,
        teamPartnerIds: nextTeam,
      });
      const outcome = applyGoNoGoRerun({
        pursuit,
        teamIds: nextTeam,
        trigger,
        partnerName: partner?.name,
        result,
      });
      onUpdatePursuit(pursuit.id, outcome.updates);
      const worse = outcome.updates.score !== undefined && outcome.updates.score < pursuit.score;
      toast(outcome.summary, worse ? "warning" : "success");
    } catch (err) {
      if (pursuit.goNoGo) {
        onUpdatePursuit(pursuit.id, { includedPartnerIds: nextTeam });
        toast(err instanceof Error ? err.message : "The Go/No-Go assessment could not be rerun. The previous recommendation is unchanged.", "warning");
      } else {
        reassessCoverage(nextTeam, trigger, partner);
      }
    } finally {
      setAssessing(false);
    }
  }

  function handleRemovePartnerFromOpp(partnerId: string) {
    reassess(teamIds.filter(id => id !== partnerId), "partner_removed", allPartners.find(p => p.id === partnerId));
  }

  function handleAddPartnerToOpp(partnerId: string) {
    if (teamIds.includes(partnerId)) return;
    reassess([...teamIds, partnerId], "partner_added", allPartners.find(p => p.id === partnerId));
    setAddPartnerToOppOpen(false);
  }

  function handleRerunAssessment() {
    reassess(teamIds, "rerun");
  }

  const advisorQuickPrompts = [
    "How can I improve this score?",
    "What partner capabilities would fill the gaps?",
    "What's the ideal team composition?",
  ];

  function handleConfirm() {
    if (!confirmOpen) return;
    if (confirmIsOverride && !confirmReason.trim()) return;
    onConfirmDecision(pursuit.id, confirmOpen, { reason: confirmReason, reviewer });
    const isRfi = projectTypeOf(pursuit) === "rfi";
    toast(
      confirmOpen === "go"
        ? `Project "${pursuit.name}" set to ${isRfi ? "RESPOND" : "GO"} — ready for response drafting`
        : `Project "${pursuit.name}" set to ${isRfi ? "PASS" : "NO-GO"} — it stays open until you close it`,
      confirmOpen === "go" ? "success" : "warning"
    );
    setConfirmOpen(null);
    setConfirmReason("");
  }

  function handleClose() {
    onUpdatePursuit(pursuit.id, applyClose(pursuit, { reason: closeReason, reviewer }));
    toast(`Project "${pursuit.name}" closed`, "warning");
    setCloseOpen(false);
    setCloseReason("");
  }

  function handleReopen() {
    onUpdatePursuit(pursuit.id, applyReopen(pursuit));
    toast(`Project "${pursuit.name}" reopened`, "success");
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
  const mappedRows = pursuit.reqmap.filter(r => r.status === "mapped");
  const mappedCount = mappedRows.length;
  const unmappedWithoutGap = pursuit.reqmap.filter(r => r.status === "unmapped" && !gapForRequirement(r, pursuit.gaps));
  const gapCount = pursuit.gaps.length + unmappedWithoutGap.length;
  const platform = platformRecommendation(pursuit);
  const decision = decisionOf(pursuit);
  const decisionDiffers = decision ? isOverride(decision.value, platform.rec) : false;
  const confirmIsOverride = confirmOpen ? isOverride(confirmOpen, platform.rec) : false;
  const latestAssessment = pursuit.assessments?.[0];
  const goLabel = isRfi ? "Respond" : "Go";
  const noGoLabel = isRfi ? "Pass" : "No-Go";

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
                onClick={handleRerunAssessment}
                disabled={!graph || pursuit.closed || assessing}
                title={projectType === "rfp"
                  ? "Re-score the Go/No-Go assessment using the current partners and Partner Network"
                  : projectType === "rfi"
                    ? "Re-score topic coverage using the current partners and Partner Network"
                    : "Re-score coverage using the current partners and Partner Network"}
                className="text-xs font-medium px-3.5 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assessing ? "Assessing…" : "Rerun Assessment"}
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
              {decision ? "Your decision" : "Recommendation"}
            </div>
            <RecBig rec={pursuit.rec} closed={pursuit.closed} projectType={projectType} />
            {decision && (
              <div className="text-[11px] text-muted-foreground mt-1">
                Platform:{" "}
                <span className={cn("font-semibold", REC_TEXT[platform.rec])}>{recShortLabel(platform.rec, projectType)}</span>
                {decisionDiffers && (
                  <span className="ml-1.5 inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md oe-status-cond">Override</span>
                )}
              </div>
            )}
            <div className="text-[11px] text-muted-foreground mt-1">
              Confidence:{" "}
              {pursuit.goNoGo ? (
                <span className="font-semibold text-foreground">{pursuit.goNoGo.recommendation.confidence}</span>
              ) : (
                <span className="font-mono font-semibold text-foreground">{pursuit.confidence}%</span>
              )}
            </div>
          </div>
        </div>

        {/* Decision card */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Decision</h3>
            <span className="text-[11px] text-muted-foreground font-mono">{pursuit.decisionRecord.id}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
            <div className="p-4 sm:p-5 space-y-1.5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Platform recommendation</div>
              <div className={cn("text-sm font-bold", REC_TEXT[platform.rec])}>
                {recLabel(platform.rec, projectType)}
                <span className="ml-2 text-xs font-normal text-muted-foreground">score {platform.score}/100</span>
              </div>
              <p className="text-xs text-foreground">{platform.reason || "Awaiting triage."}</p>
              {platform.at && <p className="text-[10px] text-muted-foreground">As of {formatWhen(platform.at)}</p>}
            </div>
            <div className="p-4 sm:p-5 space-y-1.5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Your decision</div>
              {decision ? (
                <>
                  <div className={cn("text-sm font-bold flex items-center gap-2 flex-wrap", REC_TEXT[decision.value])}>
                    {recLabel(decision.value, projectType)}
                    {decision.override && (
                      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-cond">
                        Overrides platform {recLabel(decision.platformRec, projectType)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground">
                    {decision.reason
                      ? <>Reason: {decision.reason}</>
                      : <span className="italic text-muted-foreground">No reason recorded.</span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{[decision.reviewer, formatWhen(decision.at)].filter(Boolean).join(" · ")}</p>
                  {!decision.override && decisionDiffers && (
                    <p className="text-[11px] text-cond">
                      The platform recommendation has since changed to {recLabel(platform.rec, projectType)}. Your decision stands until you change it.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No decision yet. Confirm {goLabel} or {noGoLabel} below.
                </p>
              )}
              {pursuit.closed && (
                <div className="pt-2 mt-2 border-t border-border">
                  <div className="text-[10px] uppercase tracking-widest text-closed font-bold">Closed</div>
                  <p className="text-xs text-foreground">
                    {pursuit.closedReason ? pursuit.closedReason : <span className="italic text-muted-foreground">No reason recorded.</span>}
                  </p>
                  {(pursuit.closedBy || pursuit.closedAt) && (
                    <p className="text-[10px] text-muted-foreground">{[pursuit.closedBy, formatWhen(pursuit.closedAt)].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
              )}
            </div>
          </div>
          {latestAssessment && (
            <div className="px-4 sm:px-5 py-3.5 border-t border-border bg-muted/20 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Latest reassessment · {formatWhen(latestAssessment.at)}
                </div>
                {(pursuit.assessments?.length ?? 0) > 1 && (
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(open => !open)}
                    className="text-[11px] text-primary font-medium bg-transparent border-none cursor-pointer hover:underline"
                  >
                    {historyOpen ? "Hide history" : `History (${pursuit.assessments!.length})`}
                  </button>
                )}
              </div>
              <p className="text-xs text-foreground">{latestAssessment.summary}</p>
              {historyOpen && (
                <ul className="pt-1 space-y-2">
                  {pursuit.assessments!.slice(1).map(item => (
                    <li key={item.at} className="text-[11px] text-muted-foreground">
                      <span className="font-mono">{formatWhen(item.at)}</span> — {item.summary}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">How this was scored</h3>
            <span className="text-[11px] text-muted-foreground font-mono">{isRfi ? "RFI" : pursuit.goNoGo ? "Go/No-Go" : "RFP-03"}</span>
          </div>
          <div className="p-5 space-y-3 text-sm text-foreground">
            {pursuit.goNoGo ? (
              <>
                <p>
                  <strong>Score ({pursuit.goNoGo.recommendation.score}/100)</strong> is the weighted average of the factor scores, times 20.
                  {" "}<span className="font-mono text-xs">{pursuit.goNoGo.recommendation.scoreMath}</span>
                </p>
                <p>
                  <strong>Recommendation ({pursuit.goNoGo.recommendation.decision})</strong>{" "}
                  Go requires 70 or higher and every gate at Pass. Conditional Go is 55 through 69, and also when any gate is Curable or Unknown. No-Go is below 55, and when any gate is Fail. A contract-and-delivery score of 1 cannot be a Go. A capability score of 1 is No-Go unless a registered Partner covers the gap. People confirm the decision.
                </p>
                <p>
                  <strong>Confidence ({pursuit.goNoGo.recommendation.confidence})</strong>{" "}
                  {pursuit.confidenceNote}
                </p>
                {pursuit.goNoGo.recommendation.decideBy && (
                  <p><strong>Decide by</strong> {pursuit.goNoGo.recommendation.decideBy}.</p>
                )}
                {pursuit.goNoGo.recommendation.upside && <p>{pursuit.goNoGo.recommendation.upside}</p>}
              </>
            ) : (
              <>
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
                  <strong>Platform recommendation ({recLabel(platform.rec, projectType)})</strong>{" "}
                  {isRfi
                    ? "uses the purpose, challenges, and likely services — not page limits or the questions in the response worksheet."
                    : `uses coverage gates. ${recLabel("go", projectType)} needs ≥ ${breakdown?.goCoverageFloor ?? 75}% requirement coverage and score ≥ ${breakdown?.goScoreFloor ?? 68}.`}
                  {breakdown && !isRfi && (
                    <> Coverage here is {breakdown.mappedCount} of {breakdown.totalRequirements} ({breakdown.coveragePct}%).{breakdown.passFailBlocked ? " An unmapped pass/fail requirement also blocks Go." : ""}{breakdown.documentOverlapCount > 0 ? ` Document language overlap (${breakdown.documentOverlapCount} topics) can lift the score without counting as mapped requirements.` : ""}</>
                  )}
                  {breakdown?.recRule ? ` ${breakdown.recRule}` : ""}
                </p>
              </>
            )}
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

        {pursuit.goNoGo && <RfpGoNoGoAssessmentView assessment={pursuit.goNoGo} />}

        {/* Partner composition card */}
        {allPartners.length > 0 && (
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h3 className="oe-card-title">Partner Composition</h3>
              <button
                onClick={() => setAddPartnerToOppOpen(true)}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
              >
                + Add Partner
              </button>
            </div>
            <div className="p-5">
              {partnerComposition.length > 0 ? (
                <div className="divide-y divide-border">
                  {partnerComposition.map(({ partnerId, partner, contributions, needed }) => (
                    <div key={partnerId} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-foreground">{partner.name}</span>
                          <span className={cn(
                            "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                            partner.type === "Prime" ? "oe-status-go" : "oe-status-trace",
                          )}>{partner.type}</span>
                          {needed ? (
                            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-go">Contributing</span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-pending">No mapped contribution</span>
                          )}
                        </div>
                        {contributions.length > 0 ? (
                          <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-0.5">
                            {contributions.map((c, i) => <li key={i}>{c}</li>)}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">
                            Not contributing capabilities, experience, credentials, or people to this opportunity.
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemovePartnerFromOpp(partnerId)}
                        className="text-[10px] font-medium px-2 py-1 rounded border border-input bg-card text-destructive cursor-pointer hover:bg-destructive/10 shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No partners are included in this opportunity. Add partners to improve coverage and scoring.
                </p>
              )}
            </div>
          </div>
        )}

        <Modal open={addPartnerToOppOpen} onClose={() => setAddPartnerToOppOpen(false)} title="Add Partner to Opportunity">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Select a partner to include in the assessment and response for this opportunity. The score and recommendation are reassessed against the new team, with a note on what changed.
            </p>
            <div className="divide-y divide-border border border-border rounded-md max-h-60 overflow-y-auto">
              {activePartners
                .filter(p => !teamIds.includes(p.id))
                .map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleAddPartnerToOpp(p.id)}
                    className="w-full text-left px-3 py-2.5 text-xs hover:bg-muted/40 cursor-pointer flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-semibold text-foreground">{p.name}</span>
                      <span className="text-muted-foreground ml-2">{p.type}</span>
                    </div>
                    <span className="text-primary text-[10px] font-medium shrink-0">Add →</span>
                  </button>
                ))
              }
              {activePartners.filter(p => !teamIds.includes(p.id)).length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center italic">All active partners are already included.</div>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <SecondaryButton onClick={() => setAddPartnerToOppOpen(false)}>Close</SecondaryButton>
            </div>
          </div>
        </Modal>

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

        {/* Scope summary card */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Scope Summary</h3>
          </div>
          {pursuit.projectType === "rfi" && pursuit.docSummary.rfi ? (
            <RfiScopeSummaryBody docSummary={pursuit.docSummary} rfi={pursuit.docSummary.rfi} />
          ) : (
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
          )}
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

        {/* Mapped capabilities card */}
        {pursuit.reqmap.length > 0 && (
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border">
              <h3 className="oe-card-title">Mapped Capabilities</h3>
              <span className="text-xs text-muted-foreground text-right">
                <span className="font-mono font-semibold text-foreground">{mappedCount}</span>
                {" "}of {pursuit.reqmap.length} {isRfi ? "topics we can speak to" : "requirements mapped"}
                {gapCount > 0 && <> · <span className="font-mono font-semibold text-cond">{gapCount}</span> gap{gapCount === 1 ? "" : "s"}</>}
              </span>
            </div>
            {mappedRows.length > 0 ? (
              <div className="overflow-x-auto oe-touch-scroll">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="oe-table-header">
                      <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">{isRfi ? "Scope topic" : "Requirement"}</th>
                      <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Capability</th>
                      <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedRows.map((r, i) => (
                      <tr key={i} className="oe-table-row border-b border-border last:border-b-0">
                        <td className="px-4 py-3 align-top text-foreground">{r.req}</td>
                        <td className="px-4 py-3 align-top font-mono text-[11px] text-primary">{r.node ?? "—"}</td>
                        <td className="px-4 py-3 align-top text-muted-foreground">{r.evidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-4 text-xs text-muted-foreground italic">
                No {isRfi ? "scope topics" : "requirements"} map to the current team’s capabilities yet — see Gaps in Capabilities below.
              </p>
            )}
          </div>
        )}

        {/* Gaps in capabilities card */}
        {gapCount > 0 && (
          <div className="bg-card rounded-xl border border-dashed border-destructive/30 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
              <div className="w-2 h-2 rounded-sm bg-cond" />
              <h3 className="oe-card-title">Gaps in Capabilities</h3>
            </div>
            <div className="divide-y divide-border">
              {unmappedWithoutGap.map((r, i) => (
                <div key={`unmapped-${i}`} className="px-4 sm:px-5 py-4 flex flex-col xs:flex-row justify-between gap-2 xs:gap-4 items-start">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground mb-1">{r.req}</div>
                    <div className="text-[11px] text-muted-foreground">{r.evidence}</div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-nogo whitespace-nowrap shrink-0">
                    Unmapped {isRfi ? "topic" : "requirement"}
                  </span>
                </div>
              ))}
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

        {logRows.length > 0 && (
          <GapLogActionItems
            rows={logRows}
            onOpen={id => {
              const existing = (pursuit.responseActionItems ?? []).find(item => item.id === id);
              const gap = pursuit.rfiResponse?.gaps.find(item => item.id === id);
              setActionItem(existing ?? (gap ? gapsToActionItems([gap], partners)[0] ?? null : null));
            }}
          />
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
            {!pursuit.closed && decision?.value !== "go" && (
              <button
                onClick={() => { setConfirmReason(""); setConfirmOpen("go"); }}
                className="text-xs font-semibold px-4 py-2 rounded-md bg-go text-white cursor-pointer transition-all hover:opacity-90 shadow-sm"
              >
                {decision ? `Change to ${goLabel}` : `Confirm ${goLabel}`}
              </button>
            )}
            {!pursuit.closed && decision?.value !== "nogo" && (
              <button
                onClick={() => { setConfirmReason(""); setConfirmOpen("nogo"); }}
                className="text-xs font-semibold px-4 py-2 rounded-md border border-nogo text-nogo bg-card cursor-pointer transition-all hover:bg-nogo-soft"
              >
                {decision ? `Change to ${noGoLabel}` : `Confirm ${noGoLabel}`}
              </button>
            )}
            {!pursuit.closed ? (
              <button
                onClick={() => { setCloseReason(""); setCloseOpen(true); }}
                className="text-xs font-semibold px-4 py-2 rounded-md border border-input text-foreground bg-card cursor-pointer transition-all hover:bg-secondary"
              >
                Close Opportunity
              </button>
            ) : (
              <button
                onClick={handleReopen}
                className="text-xs font-semibold px-4 py-2 rounded-md border border-input text-foreground bg-card cursor-pointer transition-all hover:bg-secondary"
              >
                Reopen Opportunity
              </button>
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
              ? `You are setting "${pursuit.name}" to ${isRfi ? "RESPOND" : "GO"}. This advances the project to response drafting.`
              : `You are setting "${pursuit.name}" to ${isRfi ? "PASS" : "NO-GO"}. The project stays open until you choose Close Opportunity.`
            }
          </div>
          <div className="text-xs text-foreground rounded-md border border-border bg-muted/20 px-3 py-2.5">
            Platform recommendation:{" "}
            <strong className={REC_TEXT[platform.rec]}>{recLabel(platform.rec, projectType)}</strong>
            {platform.reason && <span className="text-muted-foreground"> — {platform.reason}</span>}
          </div>
          <FormField label={confirmIsOverride ? "Reason for overriding the platform recommendation (required)" : "Reason / notes (optional)"}>
            <TextArea
              value={confirmReason}
              onChange={setConfirmReason}
              placeholder={confirmIsOverride
                ? `Why ${confirmOpen === "go" ? goLabel : noGoLabel} despite the ${recLabel(platform.rec, projectType)} recommendation?`
                : "Add context for the decision record…"}
              rows={3}
            />
          </FormField>
          <div className="text-[11px] text-muted-foreground">
            Decision record <span className="font-mono text-foreground">{pursuit.decisionRecord.id}</span> will be updated.
            Reviewer: <span className="text-foreground">{reviewer}</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setConfirmOpen(null)}>Cancel</SecondaryButton>
            <button
              onClick={handleConfirm}
              disabled={confirmIsOverride && !confirmReason.trim()}
              className={cn(
                "text-xs font-semibold px-4 py-2 rounded-md text-white cursor-pointer transition-all hover:opacity-90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
                confirmOpen === "go" ? "bg-go" : "bg-destructive",
              )}
            >
              Confirm {confirmOpen === "go" ? goLabel : noGoLabel}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={closeOpen} onClose={() => setCloseOpen(false)} title="Close Opportunity">
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            Close <strong>{pursuit.name}</strong>? Closed opportunities keep their assessment, decision, and response work, and can be reopened.
          </p>
          <FormField label="Reason (optional)">
            <TextArea
              value={closeReason}
              onChange={setCloseReason}
              placeholder="e.g. Customer cancelled the solicitation, submitted, not pursuing…"
              rows={3}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setCloseOpen(false)}>Cancel</SecondaryButton>
            <button
              onClick={handleClose}
              className="text-xs font-semibold px-4 py-2 rounded-md bg-closed text-white cursor-pointer transition-all hover:opacity-90 shadow-sm"
            >
              Close Opportunity
            </button>
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
        assigneeLabel={actionItem?.assignedPartnerId
          ? `${getPartner(actionItem.assignedPartnerId, partners)?.name ?? actionItem.assignedPartnerId}${actionItem.assignedInternal ? ` (${actionItem.assignedInternal})` : ""}`
          : actionItem?.assignedInternal ?? undefined}
        onClose={() => setActionItem(null)}
        onSave={updates => {
          if (!actionItem) return;
          onUpdatePursuit(pursuit.id, applyActionItemUpdate(pursuit, actionItem.id, updates, partners));
          toast(isResolvedStatus(updates.status) ? `${actionItem.id} resolved — regenerate the response to use it` : "Action item updated", "success");
        }}
      />
    </div>
  );
}
