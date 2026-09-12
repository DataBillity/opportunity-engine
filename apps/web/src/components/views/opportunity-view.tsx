"use client";

import type { Pursuit, Organization } from "@/lib/mock-data";
import { getPartner } from "@/lib/mock-data";

function RecBig({ rec, closed }: { rec: string; closed?: boolean }) {
  if (closed) return <div className="text-xl font-extrabold text-closed">CLOSED</div>;
  const map: Record<string, [string, string]> = {
    go: ["GO", "text-go"], nogo: ["NO-GO", "text-nogo"],
    cond: ["CONDITIONS", "text-cond"], pending: ["PENDING", "text-ink-soft"],
  };
  const [label, cls] = map[rec] ?? map.pending!;
  return <div className={`text-xl font-extrabold ${cls}`}>{label}</div>;
}

export function OpportunityView({
  pursuit, org, onBack, onDraft,
}: {
  pursuit: Pursuit; org: Organization;
  onBack: () => void; onDraft: () => void;
}) {
  return (
    <div className="flex gap-5 items-start">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-ink-soft mb-2">
          <button onClick={onBack} className="text-brand font-semibold cursor-pointer hover:underline bg-transparent border-none">Pipeline</button>
          {" / "}
          <button onClick={onBack} className="text-brand font-semibold cursor-pointer hover:underline bg-transparent border-none">{org.name}</button>
          {" / "}{pursuit.name}
        </div>

        {/* Decision header */}
        <div className="bg-panel border border-line p-5 mb-4 flex justify-between gap-6 items-start">
          <div>
            <h1 className="text-[17px] font-bold mb-1">{pursuit.name}</h1>
            <div className="text-xs text-ink-soft">
              {pursuit.typeLabel} · {pursuit.solicitationRef} · Score {pursuit.score}/100
              {pursuit.dueDate && <> · Due {pursuit.dueDate}</>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10.5px] uppercase tracking-wider text-ink-soft mb-1">Recommendation</div>
            <RecBig rec={pursuit.rec} closed={pursuit.closed} />
            <div className="text-[11.5px] text-ink-soft mt-0.5">Confidence: {pursuit.confidence}%</div>
          </div>
        </div>

        {/* Rationale */}
        <div className="bg-panel border border-line mb-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <h3 className="text-[13px] font-bold">Rationale</h3>
            <span className="text-[11.5px] text-ink-soft">TRIAGE-02 capability mapping visible</span>
          </div>
          <div className="p-4">
            <ul className="list-disc pl-4 text-[13px] space-y-1.5">
              {pursuit.rationale.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        </div>

        {/* Scope summary */}
        <div className="bg-panel border border-line mb-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <h3 className="text-[13px] font-bold">Scope Summary</h3>
          </div>
          <div className="grid grid-cols-3 divide-x divide-line">
            <div className="p-4">
              <h4 className="text-[10.5px] uppercase tracking-wider text-ink-soft font-bold mb-1.5">Objective</h4>
              <ul className="list-disc pl-4 text-xs space-y-1">{pursuit.docSummary.objective.map((o, i) => <li key={i}>{o}</li>)}</ul>
            </div>
            <div className="p-4">
              <h4 className="text-[10.5px] uppercase tracking-wider text-ink-soft font-bold mb-1.5">Services</h4>
              <ul className="list-disc pl-4 text-xs space-y-1">{pursuit.docSummary.services.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div className="p-4">
              <h4 className="text-[10.5px] uppercase tracking-wider text-ink-soft font-bold mb-1.5">Deliverables</h4>
              <ul className="list-disc pl-4 text-xs space-y-1">{pursuit.docSummary.deliverables.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          </div>
        </div>

        {/* Requirement mapping */}
        <div className="bg-panel border border-line mb-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <h3 className="text-[13px] font-bold">Requirement → Capability Mapping</h3>
            <span className="text-[11.5px] text-ink-soft">
              {pursuit.reqmap.filter(r => r.status === "mapped").length} of {pursuit.reqmap.length} mapped
            </span>
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft px-2.5 py-2 border-b border-line-strong">Requirement</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft px-2.5 py-2 border-b border-line-strong">Status</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft px-2.5 py-2 border-b border-line-strong">Mapped Node</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft px-2.5 py-2 border-b border-line-strong">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {pursuit.reqmap.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-b-0">
                  <td className="px-2.5 py-2.5 align-top">{r.req}</td>
                  <td className="px-2.5 py-2.5 align-top">
                    <span className={`text-[10.5px] font-bold px-1.5 py-px rounded-sm ${
                      r.status === "mapped" ? "bg-trace-soft text-trace" : "bg-nogo-soft text-nogo"
                    }`}>
                      {r.status === "mapped" ? "MAPPED" : "UNMAPPED"}
                    </span>
                  </td>
                  <td className="px-2.5 py-2.5 align-top font-mono text-[11.5px] text-brand">{r.node ?? "—"}</td>
                  <td className="px-2.5 py-2.5 align-top text-ink-soft">{r.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Gap analysis */}
        {pursuit.gaps.length > 0 && (
          <div className="border border-dashed border-line-strong bg-[#FCFCFA] p-4 mb-4">
            <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-ink-soft font-bold mb-2.5">
              <span className="w-[7px] h-[7px] bg-cond inline-block" />
              Capability Gap Analysis
            </div>
            {pursuit.gaps.map(g => (
              <div key={g.id} className="flex justify-between gap-3.5 py-3 border-b border-line last:border-b-0 flex-wrap">
                <div className="flex-1">
                  <div className="font-mono text-[11px] text-ink-soft">{g.id}</div>
                  <div className="text-[13px] font-semibold mt-0.5 mb-1">{g.title}</div>
                  <div className="text-[11.5px] text-ink-soft">Demand: {g.demand} · Closure: {g.closure}</div>
                </div>
                <span className="text-[10.5px] font-bold px-1.5 py-px rounded-sm bg-nogo-soft text-nogo whitespace-nowrap h-fit">
                  {g.crit}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* RFUND */}
        <div className="bg-panel border border-line mb-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <h3 className="text-[13px] font-bold">R&D Funding Eligibility (RFUND)</h3>
            <span className="text-[11.5px] text-ink-soft">Lane {pursuit.rfund.lane} · {pursuit.rfund.tier}</span>
          </div>
          <div className="p-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-[70px] h-[5px] bg-[#EAEAE3] rounded-sm overflow-hidden">
                <span className="block h-full bg-trace" style={{ width: `${pursuit.rfund.score}%` }} />
              </div>
              <span className="font-mono font-bold text-[13px]">{pursuit.rfund.score}</span>
            </div>
            <p className="text-xs text-ink-soft flex-1">{pursuit.rfund.note}</p>
          </div>
        </div>

        {/* Response action items */}
        {pursuit.responseActionItems && pursuit.responseActionItems.length > 0 && (
          <div className="bg-panel border border-line mb-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <h3 className="text-[13px] font-bold">Response Action Items</h3>
              <span className="text-[11.5px] text-ink-soft">{pursuit.responseActionItems.filter(r => r.status === "Open").length} open</span>
            </div>
            <div className="divide-y divide-line">
              {pursuit.responseActionItems.map(item => (
                <div key={item.id} className="px-4 py-3 flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold mb-1">{item.description}</div>
                    <div className="text-[11.5px] text-ink-soft">
                      {item.assignedPartnerId ? getPartner(item.assignedPartnerId)?.name : item.assignedInternal}
                      {" · Due "}{item.dueAt}
                      {" · Blocks "}{item.gates.join(", ")}
                    </div>
                  </div>
                  <span className={`text-[10.5px] font-bold px-1.5 py-px rounded-sm ${
                    item.status === "Open" ? "bg-cond-soft text-cond" : "bg-go-soft text-go"
                  }`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Decision footer */}
        <div className="bg-panel border border-line px-4 py-3.5 flex items-center justify-between gap-4 mt-4">
          <div className="text-xs text-ink-soft">
            Decision record: <span className="font-mono">{pursuit.decisionRecord.id}</span> · {pursuit.decisionRecord.action}
          </div>
          <div className="flex gap-2.5">
            {!pursuit.closed && pursuit.rec === "go" && (
              <button
                onClick={onDraft}
                className="text-xs font-semibold px-3.5 py-2 rounded-sm bg-brand border-brand text-white cursor-pointer hover:bg-[#233049]"
              >
                Open Response Builder →
              </button>
            )}
            {!pursuit.closed && (
              <>
                <button className="text-xs font-semibold px-3.5 py-2 rounded-sm bg-go border-go text-white cursor-pointer hover:bg-[#255A42]">
                  Confirm Go
                </button>
                <button className="text-xs font-semibold px-3.5 py-2 rounded-sm bg-white border border-nogo text-nogo cursor-pointer hover:bg-nogo-soft">
                  Confirm No-Go
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Rail — Pursuit timeline */}
      <div className="w-[230px] shrink-0 bg-panel border border-line sticky top-7">
        <div className="px-4 py-3.5 border-b border-line">
          <div className="text-[10px] uppercase tracking-wider text-brand font-bold mb-0.5">{pursuit.typeLabel}</div>
          <div className="text-[13px] font-bold leading-snug">{pursuit.name}</div>
          {pursuit.dueDate && (
            <div className={`text-[11.5px] mt-2 px-2 py-1.5 rounded-sm ${
              pursuit.closed ? "bg-closed-soft text-closed" :
              pursuit.rec === "go" ? "bg-go-soft text-go" : "bg-cond-soft text-cond"
            }`}>
              {pursuit.closed ? "Closed" : `Due: ${pursuit.dueDate}`}
            </div>
          )}
        </div>
        <div className="p-4">
          {[
            { label: "Intake & shredding", done: true },
            { label: "Triage scored", done: true },
            { label: "Go/No-Go decision", done: pursuit.closed || pursuit.rec === "go", current: !pursuit.closed && pursuit.rec !== "go" },
            { label: "Gap analysis", done: pursuit.gaps.length === 0 && !pursuit.closed },
            { label: "Response drafting", done: false, current: pursuit.rec === "go" && !pursuit.closed },
            { label: "Review & submission", done: false },
          ].map((step, i, arr) => (
            <div key={i} className="flex gap-2.5 relative pb-5 last:pb-0">
              {i < arr.length - 1 && (
                <div className="absolute left-[5px] top-4 bottom-0 w-px bg-line-strong" />
              )}
              <div className={`w-[11px] h-[11px] rounded-full border-2 shrink-0 mt-0.5 z-10 ${
                step.done ? "bg-brand border-brand" :
                step.current ? "bg-white border-brand shadow-[0_0_0_3px_var(--color-brand-soft)]" :
                "bg-white border-line-strong"
              }`} />
              <span className={`text-xs leading-snug ${
                step.done ? "text-ink" : step.current ? "font-bold text-brand" : "text-ink-soft"
              }`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
