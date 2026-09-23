"use client";

import { useState, useEffect, useRef } from "react";
import type { Organization, Pursuit } from "@/lib/mock-data";
import { recShortLabel } from "@opportunity-engine/core";
import { cn } from "@/lib/cn";

const lanes = [
  { key: "all", label: "All" },
  { key: "A", label: "Prospects" },
  { key: "B", label: "RFPs" },
  { key: "RFI", label: "RFIs" },
  { key: "C", label: "SOWs" },
  { key: "D", label: "Partner" },
];

function pursuitType(p: Pursuit): "rfp" | "rfi" | "sow" {
  return p.projectType ?? (p.lane === "C" ? "sow" : "rfp");
}

function orgMatchesLane(org: Organization, allPursuits: Record<string, Pursuit>, laneFilter: string): boolean {
  if (laneFilter === "A") return org.pursuits.length === 0;
  const pursuits = org.pursuits.map(pid => allPursuits[pid]).filter(Boolean) as Pursuit[];
  if (laneFilter === "RFI") return pursuits.some(p => pursuitType(p) === "rfi");
  if (laneFilter === "B") return pursuits.some(p => pursuitType(p) === "rfp");
  return pursuits.some(p => p.lane === laneFilter);
}

function getOrgPursuits(org: Organization, allPursuits: Record<string, Pursuit>): Pursuit[] {
  return org.pursuits.map(pid => allPursuits[pid]).filter(Boolean) as Pursuit[];
}

function getOrgTopScore(org: Organization, allPursuits: Record<string, Pursuit>): number {
  const active = getOrgPursuits(org, allPursuits).filter(p => !p.closed);
  if (active.length) return Math.max(...active.map(p => p.score));
  return org.score;
}

function RecPill({ rec, closed, projectType = "rfp" }: { rec: string; closed?: boolean; projectType?: "rfp" | "rfi" | "sow" }) {
  if (closed) {
    return (
      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-closed">
        CLOSED
      </span>
    );
  }
  const typed = rec === "go" || rec === "nogo" || rec === "cond" || rec === "pending" ? rec : "pending";
  const cls = { go: "oe-status-go", nogo: "oe-status-nogo", cond: "oe-status-cond", pending: "oe-status-pending" }[typed];
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md ${cls}`}>
      {recShortLabel(typed, projectType)}
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
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  const filteredOrgs = orgs.filter(org => {
    if (search && !org.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (laneFilter && laneFilter !== "all" && !orgMatchesLane(org, allPursuits, laneFilter)) return false;
    return true;
  });

  useEffect(() => {
    const list = listRef.current;
    const item = selectedRef.current;
    if (!list || !item) return;

    const timer = window.setTimeout(() => {
      const listRect = list.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const pad = 8;

      if (itemRect.top < listRect.top) {
        list.scrollTop += itemRect.top - listRect.top - pad;
      } else if (itemRect.bottom > listRect.bottom) {
        list.scrollTop += itemRect.bottom - listRect.bottom + pad;
      }
    }, 50);

    return () => window.clearTimeout(timer);
  }, [currentOrgId]);

  return (
    <aside
      className={cn(
        "bg-card flex flex-col min-h-0 overflow-hidden",
        embedded
          ? "w-full h-full"
          : "hidden lg:flex w-[240px] xl:w-[280px] shrink-0 h-full border-r border-border"
      )}
    >
      <div className="shrink-0 z-10 bg-card border-b border-border">
        <div className="px-4 pt-4 pb-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search organizations…"
            className="oe-field text-[11px]"
          />
        </div>

        <div className="px-4 pt-2 pb-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2.5">
            Pipeline filter
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lanes.map(l => {
              const count = l.key === "all"
                ? orgs.length
                : orgs.filter(o => orgMatchesLane(o, allPursuits, l.key)).length;
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
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto oe-touch-scroll">
        {filteredOrgs.map(org => {
          const active = getOrgPursuits(org, allPursuits).filter(p => !p.closed);
          const headline = active.length > 0
            ? active.slice().sort((a, b) => b.score - a.score)[0]!
            : null;
          const headlineRec = headline?.rec ?? "pending";
          const headlineType = headline ? pursuitType(headline) : "rfp";
          const isSelected = org.id === currentOrgId;

          return (
            <button
              key={org.id}
              ref={isSelected ? selectedRef : undefined}
              onClick={() => onOrgSelect(org.id)}
              aria-current={isSelected ? "true" : undefined}
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
                <RecPill rec={headlineRec} closed={headline?.closed} projectType={headlineType} />
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
