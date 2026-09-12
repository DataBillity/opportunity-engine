"use client";

import { organizations, getOrgPursuits, getOrgTopScore } from "@/lib/mock-data";

const lanes = [
  { key: "all", label: "All" },
  { key: "A", label: "Prospects" },
  { key: "B", label: "RFPs" },
  { key: "C", label: "SOWs" },
  { key: "D", label: "Partner-sourced" },
];

function RecPill({ rec, closed }: { rec: string; closed?: boolean }) {
  if (closed) return <span className="text-[10.5px] font-bold px-1.5 py-px rounded-sm bg-closed-soft text-closed">CLOSED</span>;
  const map: Record<string, [string, string]> = {
    go: ["GO", "bg-go-soft text-go"],
    nogo: ["NO-GO", "bg-nogo-soft text-nogo"],
    cond: ["CONDITIONS", "bg-cond-soft text-cond"],
    pending: ["PENDING", "bg-[#EEEEE9] text-ink-soft"],
  };
  const [label, cls] = map[rec] ?? map.pending!;
  return <span className={`text-[10.5px] font-bold px-1.5 py-px rounded-sm ${cls}`}>{label}</span>;
}

export function Sidebar({
  currentOrgId,
  laneFilter,
  onLaneFilter,
  onOrgSelect,
}: {
  currentOrgId: string;
  laneFilter: string;
  onLaneFilter: (l: string) => void;
  onOrgSelect: (id: string) => void;
}) {
  return (
    <aside className="w-[270px] shrink-0 bg-panel border-r border-line overflow-y-auto">
      <div className="px-4 pt-3.5 pb-1.5">
        <div className="text-[11px] uppercase tracking-wider text-ink-soft font-semibold mb-2">
          Pipeline filter
        </div>
        <div className="flex flex-wrap gap-1.5 pb-3">
          {lanes.map(l => (
            <button
              key={l.key}
              onClick={() => onLaneFilter(l.key)}
              className={`text-[11.5px] px-2.5 py-1 rounded-sm border cursor-pointer transition-colors ${
                laneFilter === l.key
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-ink-soft border-line-strong hover:bg-paper"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-line">
        {organizations.map(org => {
          const active = getOrgPursuits(org).filter(p => !p.closed);
          const headlineRec = active.length > 0
            ? active.sort((a, b) => b.score - a.score)[0]!.rec
            : "pending";

          return (
            <button
              key={org.id}
              onClick={() => onOrgSelect(org.id)}
              className={`block w-full text-left bg-none border-none border-b border-line px-4 py-3 cursor-pointer font-sans hover:bg-[#FAFAF7] ${
                org.id === currentOrgId
                  ? "bg-brand-soft shadow-[inset_3px_0_0_var(--color-brand)]"
                  : ""
              }`}
            >
              <div className="text-[13px] font-semibold text-ink mb-0.5">{org.name}</div>
              <div className="text-[11.5px] text-ink-soft flex justify-between items-center">
                <span>{org.industry || org.channel}</span>
                <span className="font-mono font-bold">{getOrgTopScore(org)}</span>
              </div>
              <div className="mt-1.5 flex gap-1.5 items-center">
                <RecPill rec={headlineRec} />
                {active.length > 1 && (
                  <span className="inline-flex items-center gap-1 text-[11px] bg-brand-soft text-brand px-2 py-0.5 rounded-full font-semibold">
                    {active.length} active
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
