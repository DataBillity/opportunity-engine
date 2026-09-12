"use client";

import { organizations, getOrgPursuits, getOrgTopScore } from "@/lib/mock-data";

function laneLabel(l: string) {
  return { A: "Prospect", B: "RFP", C: "SOW", D: "Partner" }[l] ?? l;
}

export function PipelineView({
  laneFilter,
  onOrgSelect,
}: {
  laneFilter: string;
  onOrgSelect: (id: string) => void;
}) {
  let rows = organizations;
  if (laneFilter && laneFilter !== "all") {
    if (laneFilter === "A") rows = organizations.filter(o => o.pursuits.length === 0);
    else rows = organizations.filter(o => getOrgPursuits(o).some(p => p.lane === laneFilter));
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Pipeline</h1>
      <p className="text-[13px] text-ink-soft mb-5">
        Every organization currently being worked — from search & discovery, direct leads, or partner introductions.
      </p>

      <div className="bg-panel border border-line overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#FBFBF9]">
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-soft font-semibold px-3.5 py-2.5 border-b border-line-strong">Organization</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-soft font-semibold px-3.5 py-2.5 border-b border-line-strong">Industry</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-soft font-semibold px-3.5 py-2.5 border-b border-line-strong">Channel</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-soft font-semibold px-3.5 py-2.5 border-b border-line-strong">Score</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-soft font-semibold px-3.5 py-2.5 border-b border-line-strong">Pursuits</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-soft font-semibold px-3.5 py-2.5 border-b border-line-strong">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(org => {
              const active = getOrgPursuits(org).filter(p => !p.closed);
              const score = getOrgTopScore(org);
              return (
                <tr
                  key={org.id}
                  className="cursor-pointer hover:bg-[#FAFAF7] border-b border-line last:border-b-0"
                  onClick={() => onOrgSelect(org.id)}
                >
                  <td className="px-3.5 py-3 text-[13px] font-semibold">{org.name}</td>
                  <td className="px-3.5 py-3 text-[13px] text-ink-soft">{org.industry || "—"}</td>
                  <td className="px-3.5 py-3 text-[13px]">{org.channel}</td>
                  <td className="px-3.5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-[70px] h-[5px] bg-[#EAEAE3] rounded-sm overflow-hidden">
                        <span className="block h-full bg-brand" style={{ width: `${score}%` }} />
                      </div>
                      <span className="font-mono font-bold w-[26px] text-right text-[13px]">{score}</span>
                    </div>
                  </td>
                  <td className="px-3.5 py-3">
                    <div className="flex gap-1 items-center">
                      {active.map(p => (
                        <span key={p.id} className={`inline-block text-[10px] px-1.5 py-px font-semibold rounded-sm border ${
                          p.lane === "B" ? "text-brand border-brand" : "text-trace border-trace"
                        }`}>
                          {laneLabel(p.lane)}
                        </span>
                      ))}
                      {active.length > 1 && (
                        <span className="text-[11px] bg-brand-soft text-brand px-2 py-0.5 rounded-full font-semibold">
                          {active.length} active
                        </span>
                      )}
                      {active.length === 0 && (
                        <span className="text-[10.5px] font-bold px-1.5 py-px rounded-sm bg-[#EEEEE9] text-ink-soft">PENDING</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3.5 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1.5">
                      <button className="text-xs font-semibold px-2.5 py-1.5 rounded-sm border border-line-strong bg-white text-ink cursor-pointer hover:bg-paper">
                        Outreach
                      </button>
                      <button className="text-xs font-semibold px-2.5 py-1.5 rounded-sm border border-line-strong bg-white text-ink cursor-pointer hover:bg-paper">
                        Add RFP/SOW
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-soft mt-4 px-3.5 py-2.5 bg-white border-l-[3px] border-brand">
        Click an organization to open its full record. Use <strong>Outreach</strong> or <strong>Add RFP/SOW</strong> right from the row.
      </p>
    </div>
  );
}
