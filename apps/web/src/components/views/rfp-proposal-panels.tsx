"use client";

import { Fragment, useState, type ReactNode } from "react";
import type { ProposalSection, RfpProposal, RfpProposalRecord } from "@opportunity-engine/contracts";
import { estimatePages } from "@opportunity-engine/core";
import { cn } from "@/lib/cn";

const TH = "text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5";

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center gap-3 flex-wrap">
        <h3 className="oe-card-title mr-auto">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="px-5 py-4 text-xs text-muted-foreground italic">{children}</p>;
}

function Pill({ tone, children }: { tone: "go" | "nogo" | "cond" | "pending" | "trace"; children: ReactNode }) {
  return <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap", `oe-status-${tone}`)}>{children}</span>;
}

/** Text with each GAP placeholder called out, so open items stand out in forms and tables. */
export function GapText({ text }: { text: string }) {
  const parts = text.replace(/\*\*(\[GAP-[^\]]*\])\*\*/g, "$1").split(/(\[GAP-\d{3,4}[^\]]*\])/g);
  return (
    <>
      {parts.map((part, i) => /^\[GAP-/.test(part)
        ? <strong key={i} className="text-cond font-semibold">{part}</strong>
        : <Fragment key={i}>{part}</Fragment>)}
    </>
  );
}

function statusTone(status: string): "go" | "cond" | "nogo" | "pending" {
  if (/^open/i.test(status)) return "nogo";
  if (/gap/i.test(status)) return "cond";
  if (/^(drafted|filled)/i.test(status)) return "go";
  return "pending";
}

/** Pages for a section against its budget; the bar turns amber near the budget and red past it. */
export function PageBudgetBar({ pages, budget }: { pages: number; budget: number | null }) {
  if (budget == null || budget <= 0) {
    return <span className="text-[11px] text-muted-foreground font-mono">~{pages} pp · outside the page budget</span>;
  }
  const ratio = pages / budget;
  return (
    <div className="flex items-center gap-2 min-w-[10rem]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", ratio > 1.1 ? "bg-nogo" : ratio > 0.9 ? "bg-cond" : "bg-primary")}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
      <span className={cn("text-[11px] font-mono whitespace-nowrap", ratio > 1.1 ? "text-nogo font-semibold" : "text-muted-foreground")}>
        ~{pages} of {budget} pp
      </span>
    </div>
  );
}

export function ProposalStatusStrip({
  record,
  live,
  summary,
  onEditInstructions,
  hasInstructions,
}: {
  record: RfpProposalRecord;
  live: RfpProposal;
  summary: string;
  onEditInstructions: () => void;
  hasInstructions: boolean;
}) {
  const [open, setOpen] = useState(false);
  const failed = live.consistencyChecks.filter(check => check.result === "fail").length;
  const pending = live.consistencyChecks.filter(check => check.result === "pending").length;
  const openRows = live.complianceMatrix.filter(row => /^open/i.test(row.status)).length;
  return (
    <div className="bg-card rounded-xl border shadow-sm px-5 py-3.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <h3 className="oe-card-title mr-2">Proposal draft</h3>
        <Pill tone={record.structure.basis === "prescribed" ? "go" : "trace"}>
          {record.structure.basis === "prescribed" ? "Prescribed structure" : record.structure.basis === "criteria" ? "Criteria order" : "Standard structure"}
        </Pill>
        <Pill tone={live.gapLog.length ? "cond" : "go"}>{live.gapLog.length} open gaps</Pill>
        <Pill tone={failed ? "nogo" : pending ? "cond" : "go"}>{failed ? `${failed} checks failed` : pending ? `${pending} checks pending` : "Checks pass"}</Pill>
        {live.complianceMatrix.length > 0 && (
          <Pill tone={openRows ? "nogo" : "go"}>{openRows ? `${openRows} requirements unanswered` : "Every requirement answered"}</Pill>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto">
          Drafted {new Date(record.meta.generatedAt).toLocaleString()} via {record.meta.provider}
        </span>
        <button type="button" onClick={onEditInstructions} className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-input bg-card text-foreground cursor-pointer hover:bg-secondary">
          {hasInstructions ? "Edit drafting instructions" : "Add drafting instructions"}
        </button>
        <button type="button" onClick={() => setOpen(value => !value)} className="text-[11px] text-primary font-semibold cursor-pointer hover:underline">
          {open ? "Hide summary" : "Summary"}
        </button>
      </div>
      {open && <p className="text-sm text-foreground leading-relaxed">{summary}</p>}
      {record.meta.warnings.length > 0 && (
        <ul className="text-[11px] text-cond space-y-0.5 list-disc pl-4">
          {record.meta.warnings.map(line => <li key={line}>{line}</li>)}
        </ul>
      )}
    </div>
  );
}

export function ProposalFormsPanel({ forms }: { forms: RfpProposal["forms"] }) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const toggle = (i: number) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  });
  return (
    <Card
      title="Forms"
      aside={<span className="text-[11px] text-muted-foreground">Complete and unaltered. Signatures and prices stay placeholders for their owners.</span>}
    >
      {forms.length === 0 ? <Empty>No forms were completed. Regenerate the proposal, or check the submission checklist for the forms the RFP requires.</Empty> : (
        <ul className="divide-y divide-border">
          {forms.map((form, i) => {
            const gaps = [...form.fields.map(field => field.value), form.notes].join(" ").match(/\[GAP-\d{3,4}/g)?.length ?? 0;
            const isOpen = expanded.has(i);
            return (
              <li key={`${form.form}-${form.name}-${i}`}>
                <button type="button" onClick={() => toggle(i)} className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-muted/20 cursor-pointer">
                  <span className="font-mono text-[11px] text-muted-foreground w-24 shrink-0 truncate">{form.form || "Form"}</span>
                  <span className="text-xs font-semibold text-foreground flex-1 min-w-0">{form.name}</span>
                  {form.completedBy.length > 0 && <span className="hidden sm:inline text-[11px] text-muted-foreground truncate max-w-[14rem]">{form.completedBy.join(", ")}</span>}
                  <Pill tone={gaps ? "cond" : "go"}>{gaps ? `${gaps} gap${gaps === 1 ? "" : "s"}` : "Filled"}</Pill>
                  <span className="text-muted-foreground text-[11px]">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 space-y-2">
                    {form.placement && <p className="text-[11px] text-muted-foreground">Placement: {form.placement}</p>}
                    {form.fields.length > 0 && (
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-xs">
                          <thead><tr className="oe-table-header"><th className={cn(TH, "w-[35%]")}>Field</th><th className={TH}>Value</th></tr></thead>
                          <tbody>
                            {form.fields.map((field, j) => (
                              <tr key={j} className="border-b border-border last:border-b-0 align-top">
                                <td className="px-4 py-2 text-muted-foreground">{field.field}</td>
                                <td className="px-4 py-2 text-foreground break-words"><GapText text={field.value} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {form.notes && <p className="text-[11px] text-foreground"><GapText text={form.notes} /></p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function volumeRows(proposal: RfpProposal): { volume: string; pageLimit: string; excluded: string[]; sections: ProposalSection[] }[] {
  const byId = new Map(proposal.sections.map(section => [section.id.toLowerCase(), section]));
  const used = new Set<string>();
  const rows = proposal.structure.volumes.map(volume => {
    const sections = volume.sectionIds
      .map(id => byId.get(id.toLowerCase()))
      .filter((section): section is ProposalSection => Boolean(section));
    for (const section of sections) used.add(section.id);
    return { volume: volume.volume, pageLimit: volume.pageLimit, excluded: volume.excludedFromLimit, sections };
  });
  const rest = proposal.sections.filter(section => !used.has(section.id));
  if (rest.length) rows.push({ volume: rows.length ? "Other sections" : "Proposal", pageLimit: "", excluded: [], sections: rest });
  return rows;
}

function checkTone(result: string): "go" | "nogo" | "cond" {
  return result === "pass" ? "go" : result === "fail" ? "nogo" : "cond";
}

export function ProposalSupportPanel({ proposal }: { proposal: RfpProposal }) {
  const volumes = volumeRows(proposal);
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold px-1 pt-2">Supporting material</div>

      <Card title="Structure and page budget" aside={<span className="text-[11px] text-muted-foreground">{proposal.structure.rationale}</span>}>
        <div className="overflow-x-auto oe-touch-scroll">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="oe-table-header">
                {["Section", "RFP ref", "Points", "Budget and estimate"].map(label => <th key={label} className={TH}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {volumes.map(volume => {
                const budget = volume.sections.reduce((sum, section) => sum + (section.pageBudget ?? 0), 0);
                const estimate = Math.round(volume.sections.reduce((sum, section) => sum + (section.pageBudget == null ? 0 : estimatePages(section.content)), 0) * 10) / 10;
                return (
                  <Fragment key={volume.volume}>
                    <tr className="bg-muted/40 border-b border-border">
                      <td colSpan={4} className="px-4 py-2 text-[11px] font-semibold text-foreground">
                        {volume.volume}
                        <span className="font-normal text-muted-foreground">
                          {volume.pageLimit ? ` · limit ${volume.pageLimit}` : ""}
                          {budget ? ` · budgets ${budget} pp · draft ~${estimate} pp` : ""}
                          {volume.excluded.length ? ` · not counted: ${volume.excluded.join(", ")}` : ""}
                        </span>
                      </td>
                    </tr>
                    {volume.sections.map(section => (
                      <tr key={section.id} className="border-b border-border last:border-b-0 align-top">
                        <td className="px-4 py-2.5 text-foreground">{section.heading}</td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">{section.rfpRef}</td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">{section.points || "—"}</td>
                        <td className="px-4 py-2.5"><PageBudgetBar pages={estimatePages(section.content)} budget={section.pageBudget} /></td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {proposal.winThemes.length > 0 && (
        <Card title="Win themes">
          <ul className="divide-y divide-border">
            {proposal.winThemes.map(theme => (
              <li key={theme.theme} className="px-5 py-3 text-xs space-y-0.5">
                <div className="font-semibold text-foreground"><GapText text={theme.theme} /></div>
                {theme.customerNeed && <div className="text-muted-foreground">Need: <GapText text={theme.customerNeed} /></div>}
                {theme.discriminator && <div className="text-muted-foreground">Discriminator: <GapText text={theme.discriminator} /></div>}
                {theme.proof && <div className="text-muted-foreground">Proof: <GapText text={theme.proof} /></div>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Compliance matrix">
        {proposal.complianceMatrix.length === 0 ? <Empty>No compliance matrix yet. Regenerate the proposal to build it.</Empty> : (
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="oe-table-header">
                  {["Requirement", "Cite", "Answered in", "Criterion", "Owner", "Status"].map(label => <th key={label} className={TH}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {proposal.complianceMatrix.map((row, i) => (
                  <tr key={`${row.cite}-${i}`} className="oe-table-row border-b border-border last:border-b-0 align-top">
                    <td className="px-4 py-2.5 text-foreground">{row.requirement}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{row.cite}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.answeredIn || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.criterion}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.owner}</td>
                    <td className="px-4 py-2.5"><Pill tone={statusTone(row.status)}>{row.status || "Open"}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Consistency checks">
        {proposal.consistencyChecks.length === 0 ? <Empty>No checks yet.</Empty> : (
          <ul className="divide-y divide-border">
            {proposal.consistencyChecks.map((check, i) => (
              <li key={`${check.check}-${i}`} className="px-5 py-2.5 flex items-start gap-3 text-xs">
                <Pill tone={checkTone(check.result)}>{check.result}</Pill>
                <div className="min-w-0">
                  <div className="text-foreground font-medium">{check.check}</div>
                  {check.detail && <div className="text-muted-foreground">{check.detail}</div>}
                </div>
                <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">{check.source === "platform" ? "Platform" : "Model review"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Submission checklist">
        {proposal.submissionChecklist.length === 0 ? <Empty>No checklist yet.</Empty> : (
          <ul className="px-5 py-3 space-y-1.5 text-xs text-foreground">
            {proposal.submissionChecklist.map(line => (
              <li key={line} className="flex gap-2"><span className="text-muted-foreground">☐</span><span><GapText text={line} /></span></li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Questions for the issuer" aside={<span className="text-[11px] text-muted-foreground">Submit through the RFP's question process. The platform never contacts the issuer.</span>}>
        {proposal.issuerQuestions.length === 0 ? <Empty>No questions.</Empty> : (
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  {["Question", "Basis", "Priority", "Timing"].map(label => <th key={label} className={TH}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {proposal.issuerQuestions.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0 align-top">
                    <td className="px-4 py-2.5 text-foreground">{row.question}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.basis}{row.evidence ? ` (${row.evidence})` : ""}</td>
                    <td className="px-4 py-2.5"><Pill tone={row.priority === "High" ? "nogo" : row.priority === "Medium" ? "cond" : "pending"}>{row.priority}</Pill></td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.timing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
