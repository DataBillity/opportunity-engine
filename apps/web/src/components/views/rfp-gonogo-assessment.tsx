"use client";

import type { RfpGoNoGoAssessment } from "@opportunity-engine/contracts";
import { cn } from "@/lib/cn";

const WORK_TYPE: Record<RfpGoNoGoAssessment["opportunity"]["workType"], string> = {
  technical: "Technical solution",
  consulting: "Business and strategy consulting",
  both: "Technical solution and consulting",
  other: "Outside IT and consulting",
};

function statusClass(value: string): string {
  if (value === "Pass" || value === "Go") return "oe-status-go";
  if (value === "Fail" || value === "High" || value === "No-Go") return "oe-status-nogo";
  if (value === "Curable" || value === "Unknown" || value === "Medium" || value === "Conditional Go" || value === "assumed") return "oe-status-cond";
  return "oe-status-pending";
}

function Badge({ value }: { value: string }) {
  return <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap", statusClass(value))}>{value}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h3 className="oe-card-title">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="px-5 py-4 text-xs text-muted-foreground italic">{children}</p>;
}

export function RfpGoNoGoAssessmentView({ assessment }: { assessment: RfpGoNoGoAssessment }) {
  const { opportunity, recommendation } = assessment;
  return (
    <>
      {recommendation.decision === "Conditional Go" && recommendation.conditions.length > 0 && (
        <Section title="Conditions">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="oe-table-header">
                  {["Condition", "Owner", "By"].map(heading => (
                    <th key={heading} className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recommendation.conditions.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 align-top text-foreground">{row.condition}</td>
                    <td className="px-4 py-3 align-top text-foreground whitespace-nowrap">{row.owner}</td>
                    <td className="px-4 py-3 align-top font-mono whitespace-nowrap">{row.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="Opportunity">
        <div className="p-4 sm:p-5 space-y-3">
          <div>
            <div className="text-sm font-semibold text-foreground">{opportunity.title || "Untitled solicitation"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {[opportunity.issuer, opportunity.number].filter(Boolean).join(" · ") || "Issuer not stated"}
            </div>
          </div>
          {opportunity.objective && <p className="text-sm text-foreground leading-relaxed">{opportunity.objective}</p>}
          <p className="text-[11px] text-muted-foreground">{WORK_TYPE[opportunity.workType]}</p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {([
              ["Term", opportunity.term],
              ["Value", opportunity.value],
              ["Pricing", opportunity.pricingModel],
              ["Funding", opportunity.funding],
              ["Incumbent", opportunity.incumbent],
              ["Evaluation", opportunity.evaluationMethod],
              ["Structure", opportunity.structure],
            ] as const).map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{label}</dt>
                <dd className="text-foreground mt-0.5">{value || "Not stated"}</dd>
              </div>
            ))}
          </dl>
          {opportunity.scope.length > 0 && (
            <ul className="list-disc pl-4 text-xs space-y-1.5 text-foreground">
              {opportunity.scope.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          )}
          {opportunity.keyDates.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {opportunity.keyDates.map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-2 pr-3 text-foreground">{row.event}</td>
                      <td className="py-2 pr-3 font-mono text-foreground whitespace-nowrap">{row.date}</td>
                      <td className="py-2 text-muted-foreground">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      <Section title="Document map">
        {assessment.documentMap.length === 0 ? <Empty>No documents were classified.</Empty> : (
          <div className="divide-y divide-border">
            {assessment.documentMap.map((row, i) => (
              <div key={i} className="px-4 sm:px-5 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">{row.document}</span>
                  {row.role && <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{row.role}</span>}
                </div>
                {row.notes && <p className="text-xs text-muted-foreground mt-1">{row.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Gates">
        {assessment.gates.length === 0 ? <Empty>No pass/fail gates were identified.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="oe-table-header">
                  {["Gate", "Requirement", "Status", "Action"].map(heading => (
                    <th key={heading} className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assessment.gates.map((row, i) => (
                  <tr key={i} className="oe-table-row border-b border-border last:border-b-0">
                    <td className="px-4 py-3 align-top text-foreground font-medium">{row.gate}</td>
                    <td className="px-4 py-3 align-top text-foreground">{row.requirement}{row.evidence ? <span className="text-muted-foreground"> ({row.evidence})</span> : null}</td>
                    <td className="px-4 py-3 align-top"><Badge value={row.status} /></td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Issuer criteria">
        {assessment.issuerCriteria.length === 0 ? <Empty>The package does not state evaluation criteria.</Empty> : (
          <div className="divide-y divide-border">
            {assessment.issuerCriteria.map((row, i) => (
              <div key={i} className="px-4 sm:px-5 py-4 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{row.criterion}</span>
                  {row.points && <span className="text-[10px] font-mono text-muted-foreground">{row.points}</span>}
                  {row.estimatedPoints && <span className="text-[10px] font-mono text-muted-foreground">estimate {row.estimatedPoints}</span>}
                </div>
                {row.whatWins && <p className="text-xs text-foreground"><span className="font-semibold">What wins: </span>{row.whatWins}</p>}
                {row.teamEvidence && <p className="text-xs text-foreground"><span className="font-semibold">Team evidence: </span>{row.teamEvidence}</p>}
                {row.howToImprove && <p className="text-xs text-muted-foreground">{row.howToImprove}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Scorecard">
        {assessment.scorecard.length === 0 ? <Empty>No factors were scored.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="oe-table-header">
                  {["Factor", "Weight", "Score", "Basis", "Evidence"].map(heading => (
                    <th key={heading} className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assessment.scorecard.map((row, i) => (
                  <tr key={i} className="oe-table-row border-b border-border last:border-b-0">
                    <td className="px-4 py-3 align-top text-foreground font-medium">{row.factor}</td>
                    <td className="px-4 py-3 align-top font-mono">{Math.round(row.weight * 100)}%</td>
                    <td className="px-4 py-3 align-top font-mono font-semibold">{row.score}</td>
                    <td className="px-4 py-3 align-top"><Badge value={row.basis} /></td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{row.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-3 text-[11px] font-mono text-muted-foreground border-t border-border">{recommendation.scoreMath}</p>
          </div>
        )}
      </Section>

      <Section title="Contract and delivery risks">
        {assessment.risks.length === 0 ? <Empty>No contract risks stood out.</Empty> : (
          <div className="divide-y divide-border">
            {assessment.risks.map((row, i) => (
              <div key={i} className="px-4 sm:px-5 py-4">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge value={row.severity} />
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{row.area}</span>
                </div>
                <p className="text-sm text-foreground">{row.risk}</p>
                <p className="text-xs text-muted-foreground mt-1">{row.mitigation}{row.evidence ? ` (${row.evidence})` : ""}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Teaming">
        {assessment.teaming.length === 0 ? <Empty>No teaming gaps were identified.</Empty> : (
          <div className="divide-y divide-border">
            {assessment.teaming.map((row, i) => (
              <div key={i} className="px-4 sm:px-5 py-4 space-y-1">
                <div className="text-sm font-semibold text-foreground">{row.need}</div>
                <p className="text-xs text-foreground">{row.whyItMatters}{row.evidence ? <span className="text-muted-foreground"> ({row.evidence})</span> : null}</p>
                <p className="text-xs text-muted-foreground">Partner: {row.registeredPartner || "None registered"}. {row.action}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Gap log">
        {assessment.gapLog.length === 0 ? <Empty>No open actions.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="oe-table-header">
                  {["ID", "Item", "Owner", "Priority", "Due"].map(heading => (
                    <th key={heading} className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assessment.gapLog.map(row => (
                  <tr key={row.id || row.item} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 align-top font-mono text-muted-foreground">{row.id}</td>
                    <td className="px-4 py-3 align-top text-foreground">{row.item}{row.evidence ? <span className="text-muted-foreground"> ({row.evidence})</span> : null}</td>
                    <td className="px-4 py-3 align-top">{row.owner}</td>
                    <td className="px-4 py-3 align-top"><Badge value={row.priority} /></td>
                    <td className="px-4 py-3 align-top font-mono whitespace-nowrap">{row.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Questions for the issuer">
        {assessment.issuerQuestions.length === 0 ? <Empty>The package did not raise a question only the issuer can answer.</Empty> : (
          <div className="divide-y divide-border">
            {assessment.issuerQuestions.map((row, i) => (
              <div key={i} className="px-4 sm:px-5 py-4 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge value={row.priority} />
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{row.type}</span>
                </div>
                <p className="text-sm text-foreground">{row.question}</p>
                <p className="text-xs text-muted-foreground">{row.basis}{row.evidence ? ` (${row.evidence})` : ""}</p>
                {row.timing && <p className="text-[11px] text-muted-foreground">{row.timing}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Submission requirements">
        {assessment.submissionRequirements.length === 0 ? <Empty>No submission rules were identified.</Empty> : (
          <ul className="list-disc pl-9 pr-5 py-4 text-xs space-y-1.5 text-foreground">
            {assessment.submissionRequirements.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        )}
      </Section>

      {assessment.lotAssessments.map(lot => (
        <Section key={lot.lot} title={`Lot: ${lot.lot}`}>
          <div className="px-4 sm:px-5 py-4 space-y-2">
            <div className="flex items-center gap-2">
              <Badge value={lot.recommendation.decision} />
              <span className="text-xs font-mono text-muted-foreground">{lot.recommendation.score}/100 · {lot.recommendation.confidence}</span>
            </div>
            {lot.recommendation.rationale && <p className="text-sm text-foreground leading-relaxed">{lot.recommendation.rationale}</p>}
            <p className="text-[11px] font-mono text-muted-foreground">{lot.recommendation.scoreMath}</p>
          </div>
        </Section>
      ))}

      {assessment.adjustments.length > 0 && (
        <p className="text-[11px] text-muted-foreground px-1">
          {assessment.adjustments.join(" ")}
        </p>
      )}
    </>
  );
}
