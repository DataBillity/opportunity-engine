"use client";

import type { RfiScopeSummary, ScopeSummarySource } from "@opportunity-engine/contracts";
import type { Pursuit } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

const CONFIDENCE_CLASS: Record<string, string> = {
  High: "oe-status-go",
  Medium: "oe-status-cond",
  Low: "oe-status-pending",
};

const WORK_TYPE_LABEL: Record<RfiScopeSummary["workType"], string> = {
  technical: "Technical solution",
  consulting: "Business and strategy consulting",
  both: "Technical solution and consulting",
  other: "Outside IT and consulting",
};

function Heading({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{children}</h4>
      {aside}
    </div>
  );
}

function Badge({ value }: { value?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md", CONFIDENCE_CLASS[value] ?? "oe-status-pending")}>{value}</span>;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-4 text-xs space-y-1.5 text-foreground">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

function Empty() {
  return <p className="text-xs text-muted-foreground italic">Not stated in the RFI.</p>;
}

export function RfiScopeSummaryBody({ docSummary, rfi }: { docSummary: Pursuit["docSummary"]; rfi: RfiScopeSummary }) {
  const explicit = rfi.services.filter(item => item.type === "explicit");
  const inferred = rfi.services.filter(item => item.type === "inferred");
  const services = [...explicit, ...inferred];
  const challenges = docSummary.challenges ?? [];
  const issuerQuestions = rfi.issuerQuestions ?? [];

  return (
    <div className="divide-y divide-border">
      <div className="p-4 sm:p-5">
        <Heading aside={rfi.objectiveConfidence ? <Badge value={rfi.objectiveConfidence} /> : undefined}>Objective</Heading>
        {docSummary.objective.length ? (
          <div className="space-y-1.5 text-sm text-foreground leading-relaxed">
            {docSummary.objective.map((item, i) => <p key={i}>{item}</p>)}
          </div>
        ) : <Empty />}
        {rfi.procurementObjective && (
          <p className="mt-2 text-xs text-foreground">
            <span className="font-semibold">Procurement objective: </span>{rfi.procurementObjective}
          </p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">{WORK_TYPE_LABEL[rfi.workType]}</p>
      </div>

      <div className="p-4 sm:p-5">
        <Heading>Why now — challenges</Heading>
        {rfi.challengeThemes.length ? (
          <ul className="space-y-2 text-xs text-foreground">
            {rfi.challengeThemes.map((theme, i) => (
              <li key={i} className="leading-relaxed">
                <span className="font-semibold">{theme.theme}</span>
                {theme.rootCause && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md oe-status-nogo">Root cause</span>}
                {theme.detail && <span>. {theme.detail}</span>}
                {theme.evidence && <span className="text-muted-foreground"> ({theme.evidence})</span>}
              </li>
            ))}
          </ul>
        ) : challenges.length ? <Bullets items={challenges} /> : <Empty />}
        {rfi.consequences.length > 0 && (
          <p className="mt-2.5 text-xs text-foreground">
            <span className="font-semibold">Consequences the RFI names: </span>{rfi.consequences.join("; ")}
          </p>
        )}
        {rfi.challengeThemes.length > 0 && challenges.length > 0 && (
          <details className="mt-2.5 text-xs">
            <summary className="cursor-pointer text-muted-foreground">Stated challenges ({challenges.length})</summary>
            <div className="mt-1.5"><Bullets items={challenges} /></div>
          </details>
        )}
      </div>

      <div className="p-4 sm:p-5">
        <Heading>Target end state (deliverables)</Heading>
        {rfi.endState ? (
          <p className="text-sm text-foreground leading-relaxed">{rfi.endState}</p>
        ) : docSummary.deliverables.length ? null : <Empty />}
        {docSummary.deliverables.length > 0 && <div className={rfi.endState ? "mt-2" : ""}><Bullets items={docSummary.deliverables} /></div>}
        {rfi.endStateConstraints.length > 0 && (
          <div className="mt-2.5">
            <div className="text-[11px] font-semibold text-foreground mb-1">Constraints</div>
            <Bullets items={rfi.endStateConstraints} />
          </div>
        )}
        {rfi.nextStep && (
          <p className="mt-2.5 text-xs text-foreground"><span className="font-semibold">Next step: </span>{rfi.nextStep}</p>
        )}
      </div>

      <div>
        <div className="px-4 sm:px-5 pt-4 sm:pt-5">
          <Heading aside={<span className="text-[10px] text-muted-foreground">{explicit.length} explicit · {inferred.length} inferred</span>}>
            Services needed
          </Heading>
        </div>
        {services.length ? (
          <div className="overflow-x-auto oe-touch-scroll pb-2">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  {["Service", "Type", "Evidence", "Confidence"].map(label => (
                    <th key={label} className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services.map((item, i) => (
                  <tr key={`${item.service}-${i}`} className="oe-table-row border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 text-foreground">{item.service}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{item.type === "explicit" ? "Explicit" : "Inferred"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{item.evidence || "—"}</td>
                    <td className="px-4 py-2.5">{item.type === "explicit" ? <span className="text-muted-foreground">—</span> : <Badge value={item.confidence} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 sm:px-5 pb-4 sm:pb-5">{docSummary.services.length ? <Bullets items={docSummary.services} /> : <Empty />}</div>
        )}
        {inferred.length > 0 && (
          <p className="px-4 sm:px-5 pb-4 text-[11px] text-muted-foreground">
            Inferred services are our reading of what the work will require. They are not the issuer's stated requirements.
          </p>
        )}
      </div>

      {rfi.gaps.length > 0 && (
        <div className="p-4 sm:p-5">
          <Heading>Gaps for the bid team</Heading>
          <Bullets items={rfi.gaps} />
        </div>
      )}

      {issuerQuestions.length > 0 && (
        <div>
          <div className="px-4 sm:px-5 pt-4 sm:pt-5">
            <Heading aside={<span className="text-[10px] text-muted-foreground">{issuerQuestions.length}</span>}>
              Questions for the issuer
            </Heading>
          </div>
          <div className="overflow-x-auto oe-touch-scroll pb-2">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="oe-table-header">
                  {["Priority", "Question", "Basis", "Evidence", "Type", "Timing"].map(label => (
                    <th key={label} className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {issuerQuestions.map((item, i) => (
                  <tr key={i} className="oe-table-row border-b border-border last:border-b-0 align-top">
                    <td className="px-4 py-2.5"><Badge value={item.priority} /></td>
                    <td className="px-4 py-2.5 text-foreground">{item.question}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{item.basis || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{item.evidence || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground capitalize">{item.type}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{item.timing || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SourceNote source={docSummary.source} />
    </div>
  );
}

function SourceNote({ source }: { source?: ScopeSummarySource }) {
  if (!source) return null;
  if (source.engine === "model") {
    return <p className="px-4 sm:px-5 py-3 text-[11px] text-muted-foreground">Summary written by {source.model ?? "the model"} from the uploaded documents.</p>;
  }
  return (
    <p className="px-4 sm:px-5 py-3 text-[11px] oe-status-cond">
      This summary came from the text parser, not the model{source.note ? `: ${source.note}` : "."} Upload the documents again to retry.
    </p>
  );
}
