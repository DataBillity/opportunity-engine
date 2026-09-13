"use client";

import { useState } from "react";
import type { Organization, Pursuit } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

const lanes = [
  { key: "all", label: "All" },
  { key: "A", label: "Prospects" },
  { key: "B", label: "RFPs" },
  { key: "C", label: "SOWs" },
  { key: "D", label: "Partner" },
];

function getOrgPursuits(org: Organization, allPursuits: Record<string, Pursuit>): Pursuit[] {
  return org.pursuits.map(pid => allPursuits[pid]).filter(Boolean) as Pursuit[];
}

function getOrgTopScore(org: Organization, allPursuits: Record<string, Pursuit>): number {
  const active = getOrgPursuits(org, allPursuits).filter(p => !p.closed);
  if (active.length) return Math.max(...active.map(p => p.score));
  return org.score;
}

function RecPill({ rec, closed }: { rec: string; closed?: boolean }) {
  if (closed) {
    return (
      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-closed">
        CLOSED
      </span>
    );
  }
  const map: Record<string, [string, string]> = {
    go: ["GO", "oe-status-go"],
    nogo: ["NO-GO", "oe-status-nogo"],
    cond: ["CONDITIONS", "oe-status-cond"],
    pending: ["PENDING", "oe-status-pending"],
  };
  const [label, cls] = map[rec] ?? map.pending!;
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md ${cls}`}>
      {label}
    </span>
  );
}

export function Sidebar({
  currentOrgId,
  laneFilter,
  onLaneFilter,
  onOrgSelect,
  orgs,
  allPursuits,
  embedded = false,
}: {
  currentOrgId: string;
  laneFilter: string;
  onLaneFilter: (l: string) => void;
  onOrgSelect: (id: string) => void;
  orgs: Organization[];
  allPursuits: Record<string, Pursuit>;
  embedded?: boolean;
}) {
  const [search, setSearch] = useState("");

  const filteredOrgs = orgs.filter(org => {
    if (search && !org.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <aside
      className={cn(
        "bg-card overflow-y-auto oe-touch-scroll",
        embedded
          ? "w-full"
          : "hidden lg:block w-[240px] xl:w-[280px] shrink-0 border-r border-border"
      )}
    >
      {/* Search */}
      <div className="px-4 pt-4 pb-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search organizations…"
          className="oe-field text-[11px]"
        />
      </div>

      {/* Pipeline filter */}
      <div className="px-4 pt-2 pb-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2.5">
          Pipeline filter
        </div>
        <div className="flex flex-wrap gap-1.5">
          {lanes.map(l => {
            const count = l.key === "all"
              ? orgs.length
              : l.key === "A"
                ? orgs.filter(o => o.pursuits.length === 0).length
                : orgs.filter(o => getOrgPursuits(o, allPursuits).some(p => p.lane === l.key)).length;
            return (
              <button
                key={l.key}
                onClick={() => onLaneFilter(l.key)}
                className={cn(
                  "text-[11px] font-medium px-3 py-1.5 rounded-md border transition-all cursor-pointer",
                  laneFilter === l.key
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                )}
              >
                {l.label}
                <span className="ml-1 opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Organization list */}
      <div className="border-t border-border">
        {filteredOrgs.map(org => {
          const active = getOrgPursuits(org, allPursuits).filter(p => !p.closed);
          const headlineRec = active.length > 0
            ? active.sort((a, b) => b.score - a.score)[0]!.rec
            : "pending";
          const isSelected = org.id === currentOrgId;

          return (
            <button
              key={org.id}
              onClick={() => onOrgSelect(org.id)}
              className={cn(
                "block w-full text-left border-b border-border px-4 py-3.5 cursor-pointer transition-all",
                isSelected
                  ? "bg-accent border-l-[3px] border-l-primary"
                  : "bg-card hover:bg-muted/30 border-l-[3px] border-l-transparent"
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-[13px] font-semibold text-foreground leading-tight">
                  {org.name}
                </span>
                <span className="font-mono font-bold text-xs text-primary shrink-0">
                  {getOrgTopScore(org, allPursuits)}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground mb-2">
                {org.industry || org.channel}
              </div>
              <div className="flex gap-1.5 items-center flex-wrap">
                <RecPill rec={headlineRec} />
                {active.length > 1 && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-accent text-accent-foreground px-2 py-0.5 rounded-full font-semibold">
                    {active.length} active
                  </span>
                )}
              </div>
            </button>
          );
        })}
        {filteredOrgs.length === 0 && (
          <div className="px-4 py-6 text-xs text-muted-foreground italic text-center">
            No organizations match your search.
          </div>
        )}
      </div>
    </aside>
  );
}
