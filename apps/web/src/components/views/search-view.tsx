"use client";

import { searchResults } from "@/lib/mock-data";

export function SearchView() {
  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Search & Discovery</h1>
      <p className="text-[13px] text-ink-soft mb-5">
        Candidate organizations sourced from firmographic feeds and public signal harvesting (DISC-01 through DISC-04).
        Both model tiers behind one gateway — Gemini for extraction, Claude for fit judgment.
      </p>

      {/* Search bar */}
      <div className="bg-panel border border-line p-4 mb-4 flex flex-wrap gap-2.5 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[10.5px] uppercase tracking-wider text-ink-soft font-bold">Industry</label>
          <select className="text-xs px-2.5 py-2 border border-line-strong min-w-[150px]">
            <option>All industries</option>
            <option>Public Transit</option>
            <option>Insurance</option>
            <option>Healthcare</option>
            <option>Utilities</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10.5px] uppercase tracking-wider text-ink-soft font-bold">Signal keyword</label>
          <input type="text" placeholder="e.g. legacy, modernization" className="text-xs px-2.5 py-2 border border-line-strong min-w-[150px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10.5px] uppercase tracking-wider text-ink-soft font-bold">Min score</label>
          <input type="text" placeholder="e.g. 60" className="text-xs px-2.5 py-2 border border-line-strong min-w-[70px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10.5px] uppercase tracking-wider text-ink-soft font-bold">Sources</label>
          <div className="flex gap-1.5">
            {["Firmographic", "Filings", "Press", "LinkedIn"].map(s => (
              <span key={s} className="font-mono text-[11px] px-2 py-1.5 border border-trace bg-trace-soft text-trace rounded-sm cursor-pointer">
                {s}
              </span>
            ))}
          </div>
        </div>
        <button className="text-xs font-semibold px-3.5 py-2 rounded-sm bg-brand border-brand text-white cursor-pointer hover:bg-[#233049]">
          Run search
        </button>
        <button className="text-xs font-semibold px-3.5 py-2 rounded-sm border border-line-strong bg-white text-ink cursor-pointer hover:bg-paper ml-auto">
          Bulk upload a list
        </button>
      </div>

      {/* Results */}
      <div className="bg-panel border border-line">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-[13px] font-bold">Candidates</h3>
          <span className="text-[11.5px] text-ink-soft">{searchResults.length} candidates</span>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#FBFBF9]">
              <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong w-[20%]">Organization</th>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong w-[14%]">Industry</th>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Latest Signal</th>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong w-[10%]">Score</th>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong w-[12%]">Refreshed</th>
              <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong w-[16%]"></th>
            </tr>
          </thead>
          <tbody>
            {searchResults.map(r => (
              <tr key={r.id} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2.5 text-[13px] font-semibold">{r.org}</td>
                <td className="px-3 py-2.5 text-[13px] text-ink-soft">{r.industry}</td>
                <td className="px-3 py-2.5">
                  <div className="font-mono text-[10px] text-ink-soft uppercase tracking-tight">{r.source}</div>
                  <div className="text-xs mt-0.5">{r.signal}</div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-[70px] h-[5px] bg-[#EAEAE3] rounded-sm overflow-hidden">
                      <span className="block h-full bg-brand" style={{ width: `${r.score}%` }} />
                    </div>
                    <span className="font-mono font-bold text-[13px]">{r.score}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-[11px] text-ink-soft">{r.updated}</td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-1.5">
                    <button className="text-xs font-semibold px-2.5 py-1.5 rounded-sm border border-line-strong bg-white text-ink cursor-pointer hover:bg-paper">
                      Refresh
                    </button>
                    <button className="text-xs font-semibold px-2.5 py-1.5 rounded-sm bg-brand border-brand text-white cursor-pointer hover:bg-[#233049]">
                      Add
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-soft mt-4 px-3.5 py-2.5 bg-white border-l-[3px] border-brand">
        Refreshing re-runs enrichment and re-scores against the current graph. Scores are appended, never overwritten (SCORE-08).
      </p>
    </div>
  );
}
