"use client";

import { useMemo } from "react";
import type { Organization, Pursuit } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

function getOrgPursuits(org: Organization, allPursuits: Record<string, Pursuit>): Pursuit[] {
  return org.pursuits.map(pid => allPursuits[pid]).filter(Boolean) as Pursuit[];
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-card rounded-xl border shadow-sm p-4 sm:p-5">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">{label}</div>
      <div className={cn("text-2xl sm:text-3xl font-bold", color ?? "text-foreground")}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function BarSegment({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 text-xs text-muted-foreground text-right shrink-0">{label}</div>
      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <div className="w-10 text-xs font-mono text-foreground text-right shrink-0">{Math.round(pct)}%</div>
    </div>
  );
}

export function DashboardView({
  orgs,
  allPursuits,
}: {
  orgs: Organization[];
  allPursuits: Record<string, Pursuit>;
}) {
  const stats = useMemo(() => {
    const activeOrgs = orgs.filter(o => !o.archived);
    const allPursuitList = Object.values(allPursuits);
    const activePursuits = allPursuitList.filter(p => !p.closed);
    const rfps = activePursuits.filter(p => (p.projectType ?? (p.lane === "C" ? "sow" : "rfp")) === "rfp");
    const rfis = activePursuits.filter(p => p.projectType === "rfi");
    const sows = activePursuits.filter(p => (p.projectType ?? (p.lane === "C" ? "sow" : "rfp")) === "sow");
    const goConfirmed = allPursuitList.filter(p => p.rec === "go");
    const submitted = allPursuitList.filter(p => p.draftStatus === "Submitted");
    const won = allPursuitList.filter(p => p.outcome === "Won");
    const lost = allPursuitList.filter(p => p.outcome === "Lost");
    const prospects = activeOrgs.filter(o => o.pursuits.length === 0);

    const channelCounts: Record<string, number> = {};
    for (const org of activeOrgs) {
      const ch = org.channel || "Unknown";
      channelCounts[ch] = (channelCounts[ch] ?? 0) + 1;
    }

    const sourceCounts: Record<string, number> = {};
    for (const org of activeOrgs) {
      const src = org.source || "None";
      sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
    }

    const scoreRanges = [
      { label: "90-100", min: 90, max: 100, count: 0 },
      { label: "70-89", min: 70, max: 89, count: 0 },
      { label: "50-69", min: 50, max: 69, count: 0 },
      { label: "0-49", min: 0, max: 49, count: 0 },
    ];
    for (const org of activeOrgs) {
      for (const range of scoreRanges) {
        if (org.score >= range.min && org.score <= range.max) { range.count++; break; }
      }
    }

    const funnelStages = [
      { label: "Total Leads", count: activeOrgs.length, color: "bg-primary" },
      { label: "Prospects", count: prospects.length, color: "bg-[hsl(var(--status-cond))]" },
      { label: "Active RFPs", count: rfps.length, color: "bg-[hsl(var(--status-trace))]" },
      { label: "Active RFIs", count: rfis.length, color: "bg-[hsl(var(--status-cond))]" },
      { label: "Active SOWs", count: sows.length, color: "bg-[hsl(var(--status-go))]" },
      { label: "Go Confirmed", count: goConfirmed.length, color: "bg-go" },
      { label: "Submitted", count: submitted.length, color: "bg-primary/70" },
    ];

    const winRate = submitted.length > 0 ? Math.round((won.length / (won.length + lost.length || 1)) * 100) : 0;

    return { activeOrgs, allPursuitList, activePursuits, rfps, rfis, sows, goConfirmed, submitted, won, lost, prospects, channelCounts, sourceCounts, scoreRanges, funnelStages, winRate };
  }, [orgs, allPursuits]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="oe-page-title">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Performance overview of leads, opportunities, and submissions — current and historical.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Leads" value={stats.activeOrgs.length} sub={`${stats.prospects.length} prospects`} />
        <StatCard label="Active Pipeline" value={stats.activePursuits.length} sub={`${stats.rfps.length} RFPs · ${stats.rfis.length} RFIs · ${stats.sows.length} SOWs`} />
        <StatCard label="RFPs / RFIs" value={stats.rfps.length + stats.rfis.length} sub={`${stats.rfps.length} RFPs · ${stats.rfis.length} RFIs`} color="text-primary" />
        <StatCard label="SOWs in Progress" value={stats.sows.length} color="text-[hsl(var(--status-trace))]" />
        <StatCard label="Submissions" value={stats.submitted.length} sub={`${stats.won.length} won · ${stats.lost.length} lost`} />
        <StatCard label="Win Rate" value={`${stats.winRate}%`} color={stats.winRate >= 50 ? "text-[hsl(var(--status-go))]" : "text-[hsl(var(--status-cond))]"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline funnel */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Pipeline Funnel</h3>
          </div>
          <div className="p-5 space-y-3">
            {stats.funnelStages.map((stage, i) => {
              const maxCount = stats.funnelStages[0]?.count || 1;
              const pct = (stage.count / maxCount) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-muted-foreground text-right shrink-0">{stage.label}</div>
                  <div className="flex-1 h-7 bg-muted rounded-md overflow-hidden relative">
                    <div
                      className={cn("h-full rounded-md transition-all flex items-center px-2", stage.color)}
                      style={{ width: `${Math.max(pct, 8)}%` }}
                    >
                      <span className="text-[11px] font-bold text-white">{stage.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Score distribution */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Score Distribution</h3>
          </div>
          <div className="p-5 space-y-3">
            {stats.scoreRanges.map((range, i) => {
              const total = stats.activeOrgs.length || 1;
              const pct = (range.count / total) * 100;
              const colors = ["bg-[hsl(var(--status-go))]", "bg-primary", "bg-[hsl(var(--status-cond))]", "bg-[hsl(var(--status-nogo))]"];
              return <BarSegment key={i} pct={pct} color={colors[i]!} label={range.label} />;
            })}
          </div>
        </div>

        {/* Channel breakdown */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Channel Breakdown</h3>
          </div>
          <div className="p-5 space-y-2.5">
            {Object.entries(stats.channelCounts).sort((a, b) => b[1] - a[1]).map(([channel, count]) => {
              const pct = (count / (stats.activeOrgs.length || 1)) * 100;
              return <BarSegment key={channel} pct={pct} color="bg-primary" label={channel} />;
            })}
          </div>
        </div>

        {/* Source breakdown */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Source Breakdown</h3>
          </div>
          <div className="p-5 space-y-2.5">
            {Object.entries(stats.sourceCounts).sort((a, b) => b[1] - a[1]).map(([source, count]) => {
              const pct = (count / (stats.activeOrgs.length || 1)) * 100;
              return <BarSegment key={source} pct={pct} color="bg-[hsl(var(--status-trace))]" label={source} />;
            })}
          </div>
        </div>
      </div>

      {/* Recent activity timeline */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="oe-card-title">Recent Score History</h3>
        </div>
        <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
          {orgs.filter(o => !o.archived).flatMap(org =>
            org.scoreHistory.map((h, i) => ({ org: org.name, ...h, key: `${org.id}-${i}` }))
          ).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20).map(entry => (
            <div key={entry.key} className="px-5 py-3 flex items-center gap-4">
              <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">{entry.at}</span>
              <span className="font-mono font-bold text-primary text-sm w-8">{entry.score}</span>
              <span className="text-xs font-semibold text-foreground">{entry.org}</span>
              <span className="text-xs text-muted-foreground flex-1 truncate">{entry.reason}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Outcome history */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="oe-card-title">Submission Outcomes</h3>
        </div>
        <div className="p-5">
          {stats.allPursuitList.filter(p => p.outcome).length > 0 ? (
            <div className="divide-y divide-border">
              {stats.allPursuitList.filter(p => p.outcome).map(p => (
                <div key={p.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.typeLabel} · {p.solicitationRef}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.outcomeDate && <span className="text-[11px] text-muted-foreground font-mono">{p.outcomeDate}</span>}
                    <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-md",
                      p.outcome === "Won" ? "oe-status-go" : p.outcome === "Lost" ? "oe-status-nogo" : "oe-status-cond"
                    )}>{p.outcome}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic text-center py-4">
              No outcomes recorded yet. Outcomes appear when a submitted response is marked as Won, Lost, Postponed, or Canceled.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
