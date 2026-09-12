"use client";

import type { Organization } from "@/lib/mock-data";
import { getOrgPursuits, getOrgTopScore } from "@/lib/mock-data";

function RecPill({ rec, closed }: { rec: string; closed?: boolean }) {
  if (closed) return <span className="text-[10.5px] font-bold px-1.5 py-px rounded-sm bg-closed-soft text-closed">CLOSED</span>;
  const map: Record<string, [string, string]> = {
    go: ["GO", "bg-go-soft text-go"], nogo: ["NO-GO", "bg-nogo-soft text-nogo"],
    cond: ["CONDITIONS", "bg-cond-soft text-cond"], pending: ["PENDING", "bg-[#EEEEE9] text-ink-soft"],
  };
  const [label, cls] = map[rec] ?? map.pending!;
  return <span className={`text-[10.5px] font-bold px-1.5 py-px rounded-sm ${cls}`}>{label}</span>;
}

export function OrgDetailView({
  org, onPursuitSelect, onBack,
}: {
  org: Organization; onPursuitSelect: (id: string) => void; onBack: () => void;
}) {
  const pursuits = getOrgPursuits(org);
  const score = getOrgTopScore(org);

  return (
    <div>
      <div className="text-xs text-ink-soft mb-2">
        <button onClick={onBack} className="text-brand font-semibold cursor-pointer hover:underline bg-transparent border-none">Pipeline</button>
        {" / "}{org.name}
      </div>

      {/* Header */}
      <div className="bg-panel border border-line p-5 mb-4">
        <div className="flex justify-between items-start gap-5">
          <div>
            <h1 className="text-[19px] font-bold mb-1">{org.name}</h1>
            <div className="text-xs text-ink-soft">
              {org.industry || "Industry not set"} · Channel: {org.channel} · Score <strong className="font-mono">{score}</strong>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="text-xs font-semibold px-3 py-2 rounded-sm border border-line-strong bg-white text-ink cursor-pointer hover:bg-paper">
              Outreach
            </button>
            <button className="text-xs font-semibold px-3 py-2 rounded-sm bg-brand border-brand text-white cursor-pointer hover:bg-[#233049]">
              + Add RFP/SOW
            </button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-panel border border-line mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-[13px] font-bold">Summary</h3>
        </div>
        <div className="p-4 text-[13px]">
          {org.summary || <span className="text-ink-soft">No summary yet.</span>}
        </div>
      </div>

      {/* Score factors */}
      {org.scoreFactors.length > 0 && (
        <div className="bg-panel border border-line mb-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <h3 className="text-[13px] font-bold">Why this is a good opportunity</h3>
            <span className="text-[11.5px] text-ink-soft">SCORE-07</span>
          </div>
          <div className="p-4">
            <ul className="list-disc pl-4 text-[13px] space-y-1.5">
              {org.scoreFactors.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Contacts */}
      <div className="bg-panel border border-line mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-[13px] font-bold">Key Contacts</h3>
        </div>
        <div className="p-4">
          {org.contacts.length > 0 ? org.contacts.map((c, i) => (
            <div key={i} className="flex justify-between items-center py-2.5 border-b border-line last:border-b-0 text-xs">
              <span><span className="font-semibold">{c.name}</span> — {c.title}</span>
              <span className="text-ink-soft">{c.email}</span>
            </div>
          )) : <div className="text-xs text-ink-soft">No contacts on file yet.</div>}
        </div>
      </div>

      {/* Pursuits */}
      <div className="bg-panel border border-line mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-[13px] font-bold">RFPs & SOWs — current and history</h3>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#FBFBF9]">
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-soft font-semibold px-3.5 py-2.5 border-b border-line-strong">Pursuit</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-soft font-semibold px-3.5 py-2.5 border-b border-line-strong">Type</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-soft font-semibold px-3.5 py-2.5 border-b border-line-strong">Score</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-soft font-semibold px-3.5 py-2.5 border-b border-line-strong">Decision</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-soft font-semibold px-3.5 py-2.5 border-b border-line-strong">Status</th>
              <th className="text-left text-[11px] uppercase tracking-wider text-ink-soft font-semibold px-3.5 py-2.5 border-b border-line-strong"></th>
            </tr>
          </thead>
          <tbody>
            {pursuits.map(p => (
              <tr key={p.id} className={`border-b border-line last:border-b-0 ${p.closed ? "text-ink-soft" : ""}`}>
                <td className="px-3.5 py-3 text-[13px] font-semibold">
                  {p.name} <span className="text-ink-soft font-normal">({p.solicitationRef})</span>
                </td>
                <td className="px-3.5 py-3 text-[13px]">{p.typeLabel}</td>
                <td className="px-3.5 py-3 text-[13px]">{p.score}</td>
                <td className="px-3.5 py-3"><RecPill rec={p.rec} closed={p.closed} /></td>
                <td className="px-3.5 py-3 text-ink-soft text-[13px]">{p.status}</td>
                <td className="px-3.5 py-3">
                  <button
                    onClick={() => onPursuitSelect(p.id)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-sm border border-line-strong bg-white text-ink cursor-pointer hover:bg-paper"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
