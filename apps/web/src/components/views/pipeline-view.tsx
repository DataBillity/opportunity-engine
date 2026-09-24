"use client";

import { useState, useMemo } from "react";
import type { Organization, Pursuit } from "@/lib/mock-data";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { OutreachComposer } from "@/components/outreach/outreach-composer";
import { AddPursuitForm } from "@/components/pursuit/add-pursuit-form";
import { createPursuitFromForm, recLabel } from "@/lib/create-pursuit";
import type { ProjectType } from "@opportunity-engine/contracts";
import { cn } from "@/lib/cn";

function pursuitType(p: Pursuit): "rfp" | "rfi" | "sow" {
  return p.projectType ?? (p.lane === "C" ? "sow" : "rfp");
}

function typeChip(p: Pursuit) {
  return { rfp: "RFP", rfi: "RFI", sow: "SOW" }[pursuitType(p)];
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

type SortColumn = "name" | "industry" | "channel" | "source" | "score" | "projects";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className={cn("inline-block ml-1 transition-opacity", active ? "opacity-100" : "opacity-30")}>
      <path d="M5 1l3 3.5H2z" fill={active && dir === "asc" ? "currentColor" : "currentColor"} opacity={active && dir === "asc" ? 1 : 0.3} />
      <path d="M5 9l3-3.5H2z" fill={active && dir === "desc" ? "currentColor" : "currentColor"} opacity={active && dir === "desc" ? 1 : 0.3} />
    </svg>
  );
}

export function PipelineView({
  laneFilter,
  onOrgSelect,
  orgs,
  allPursuits,
  onAddPursuit,
  onArchiveOrg,
  onRefreshAllScores,
}: {
  laneFilter: string;
  onOrgSelect: (id: string) => void;
  orgs: Organization[];
  allPursuits: Record<string, Pursuit>;
  onAddPursuit: (pursuit: Pursuit) => void;
  onArchiveOrg?: (orgId: string) => void;
  onRefreshAllScores?: () => void;
}) {
  const { toast } = useToast();

  const [outreachOpen, setOutreachOpen] = useState(false);
  const [outreachOrg, setOutreachOrg] = useState<Organization | null>(null);

  const [addPursuitOpen, setAddPursuitOpen] = useState(false);
  const [addPursuitOrg, setAddPursuitOrg] = useState<Organization | null>(null);

  const [sortCol, setSortCol] = useState<SortColumn>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [filterCol, setFilterCol] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");

  function toggleSort(col: SortColumn) {
    if (sortCol === col) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "score" ? "desc" : "asc");
    }
  }

  const visibleOrgs = orgs.filter(o => !o.archived);

  let rows = visibleOrgs;
  if (laneFilter && laneFilter !== "all") {
    rows = visibleOrgs.filter(o => orgMatchesLane(o, allPursuits, laneFilter));
  }

  if (filterText.trim()) {
    const q = filterText.toLowerCase();
    rows = rows.filter(org => {
      if (filterCol === "name") return org.name.toLowerCase().includes(q);
      if (filterCol === "industry") return (org.industry || "").toLowerCase().includes(q);
      if (filterCol === "channel") return org.channel.toLowerCase().includes(q);
      if (filterCol === "source") return (org.source || "").toLowerCase().includes(q);
      return org.name.toLowerCase().includes(q) || (org.industry || "").toLowerCase().includes(q) || org.channel.toLowerCase().includes(q) || (org.source || "").toLowerCase().includes(q);
    });
  }

  const sortedRows = useMemo(() => {
    const sorted = [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "industry": cmp = (a.industry || "").localeCompare(b.industry || ""); break;
        case "channel": cmp = a.channel.localeCompare(b.channel); break;
        case "source": cmp = (a.source || "").localeCompare(b.source || ""); break;
        case "score": cmp = getOrgTopScore(a, allPursuits) - getOrgTopScore(b, allPursuits); break;
        case "projects": {
          const aCount = getOrgPursuits(a, allPursuits).filter(p => !p.closed).length;
          const bCount = getOrgPursuits(b, allPursuits).filter(p => !p.closed).length;
          cmp = aCount - bCount;
          break;
        }
      }
      return cmp * dir;
    });
    return sorted;
  }, [rows, sortCol, sortDir, allPursuits]);

  function openOutreach(org: Organization) {
    setOutreachOrg(org);
    setOutreachOpen(true);
  }

  function openAddPursuit(org: Organization) {
    setAddPursuitOrg(org);
    setAddPursuitOpen(true);
  }

  async function handleCreatePursuit(values: { name: string; lane: "B" | "C"; projectType: ProjectType; solicitationRef: string; files: File[] }) {
    if (!addPursuitOrg) return;
    const { pursuit, ingested, warning } = await createPursuitFromForm({
      org: addPursuitOrg,
      name: values.name,
      lane: values.lane,
      projectType: values.projectType,
      solicitationRef: values.solicitationRef,
      files: values.files,
    });
    onAddPursuit(pursuit);
    if (ingested) {
      toast(
        `"${pursuit.name}" scored ${pursuit.score} — ${recLabel(pursuit.rec, pursuit.projectType)}. Confirm ${pursuit.projectType === "rfi" ? "Respond / Pass" : "Go/No-Go"} on the opportunity.`,
        pursuit.rec === "nogo" ? "warning" : "success",
      );
    } else {
      toast(`Added project "${pursuit.name}" for ${addPursuitOrg.name}`, "success");
    }
    if (warning) toast(warning, "warning");
    setAddPursuitOpen(false);
  }

  function handleRefreshAll() {
    if (onRefreshAllScores) {
      onRefreshAllScores();
      toast("Refreshing scores for all pipeline leads…", "info");
    }
  }

  function handleArchive(e: React.MouseEvent, orgId: string) {
    e.stopPropagation();
    if (onArchiveOrg) {
      onArchiveOrg(orgId);
      toast("Lead archived — removed from active pipeline", "success");
    }
  }

  const columns: { key: SortColumn; label: string; hideOnMobile?: boolean; minWidth?: string }[] = [
    { key: "name", label: "Organization" },
    { key: "industry", label: "Industry", hideOnMobile: true },
    { key: "channel", label: "Channel" },
    { key: "source", label: "Source", minWidth: "min-w-[7.5rem]" },
    { key: "score", label: "Score" },
    { key: "projects", label: "Projects" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="oe-page-title">Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every organization currently being worked — from search &amp; discovery, direct leads, or partner introductions.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleRefreshAll}
            className="text-xs font-medium px-3.5 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
          >
            Refresh All Scores
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          placeholder="Filter pipeline…"
          className="oe-field text-[11px] w-48"
        />
        <select
          value={filterCol ?? ""}
          onChange={e => setFilterCol(e.target.value || null)}
          className="oe-select text-[11px] w-32"
        >
          <option value="">All columns</option>
          {columns.map(c => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        {filterText && (
          <button
            onClick={() => { setFilterText(""); setFilterCol(null); }}
            className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table card */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        {/* Mobile / tablet cards */}
        <div className="lg:hidden divide-y divide-border">
          {sortedRows.map(org => {
            const active = getOrgPursuits(org, allPursuits).filter(p => !p.closed);
            const score = getOrgTopScore(org, allPursuits);
            return (
              <div
                key={org.id}
                className="p-4 space-y-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => onOrgSelect(org.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground">{org.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {org.industry || "—"} · {org.channel}{org.source ? ` · ${org.source}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                      <span className="block h-full bg-primary rounded-full" style={{ width: `${score}%` }} />
                    </div>
                    <span className="font-mono font-bold text-foreground w-7 text-right">{score}</span>
                  </div>
                </div>
                <div className="flex gap-1.5 items-center flex-wrap">
                  {active.map(p => (
                    <span
                      key={p.id}
                      className={cn(
                        "inline-block text-[10px] px-2 py-0.5 font-semibold rounded-md border",
                        pursuitType(p) === "rfi"
                          ? "text-cond border-cond/30 bg-cond/5"
                          : p.lane === "B"
                            ? "text-primary border-primary/30 bg-primary/5"
                            : "text-trace border-trace/30 bg-trace/5"
                      )}
                    >
                      {typeChip(p)}
                    </span>
                  ))}
                  {active.length > 1 && (
                    <span className="text-[10px] bg-accent text-accent-foreground px-2 py-0.5 rounded-full font-semibold">
                      {active.length} active
                    </span>
                  )}
                  {active.length === 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-pending">
                      PENDING
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => openOutreach(org)}
                    className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
                  >
                    Outreach
                  </button>
                  <button
                    onClick={() => openAddPursuit(org)}
                    className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
                  >
                    Add Project
                  </button>
                  {onArchiveOrg && (
                    <button
                      onClick={e => handleArchive(e, org.id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-destructive cursor-pointer transition-all hover:bg-destructive/10"
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden lg:block overflow-x-auto oe-touch-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="oe-table-header">
                {columns.map(col => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      "text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-3 lg:px-4 py-3 cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap",
                      col.hideOnMobile && "hidden lg:table-cell",
                      col.minWidth
                    )}
                  >
                    {col.label}
                    <SortIcon active={sortCol === col.key} dir={sortDir} />
                  </th>
                ))}
                <th className="text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-3 lg:px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(org => {
                const active = getOrgPursuits(org, allPursuits).filter(p => !p.closed);
                const score = getOrgTopScore(org, allPursuits);
                return (
                  <tr
                    key={org.id}
                    className="oe-table-row cursor-pointer border-b border-border last:border-b-0"
                    onClick={() => onOrgSelect(org.id)}
                  >
                    <td className="px-3 lg:px-4 py-3.5 font-semibold text-foreground">{org.name}</td>
                    <td className="px-3 lg:px-4 py-3.5 text-muted-foreground hidden lg:table-cell">{org.industry || "—"}</td>
                    <td className="px-3 lg:px-4 py-3.5 text-foreground">{org.channel}</td>
                    <td className="px-3 lg:px-4 py-3.5 text-muted-foreground">{org.source || "—"}</td>
                    <td className="px-3 lg:px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <span
                            className="block h-full bg-primary rounded-full transition-all"
                            style={{ width: `${score}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-foreground w-7 text-right">{score}</span>
                      </div>
                    </td>
                    <td className="px-3 lg:px-4 py-3.5">
                      <div className="flex gap-1.5 items-center flex-wrap">
                        {active.map(p => (
                          <span
                            key={p.id}
                            className={cn(
                              "inline-block text-[10px] px-2 py-0.5 font-semibold rounded-md border",
                              pursuitType(p) === "rfi"
                                ? "text-cond border-cond/30 bg-cond/5"
                                : p.lane === "B"
                                  ? "text-primary border-primary/30 bg-primary/5"
                                  : "text-trace border-trace/30 bg-trace/5"
                            )}
                          >
                            {typeChip(p)}
                          </span>
                        ))}
                        {active.length > 1 && (
                          <span className="text-[10px] bg-accent text-accent-foreground px-2 py-0.5 rounded-full font-semibold">
                            {active.length} active
                          </span>
                        )}
                        {active.length === 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-pending">
                            PENDING
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 lg:px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          onClick={() => openOutreach(org)}
                          className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
                        >
                          Outreach
                        </button>
                        <button
                          onClick={() => openAddPursuit(org)}
                          className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
                        >
                          Add Project
                        </button>
                        {onArchiveOrg && (
                          <button
                            onClick={e => handleArchive(e, org.id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-destructive cursor-pointer transition-all hover:bg-destructive/10"
                            title="Archive lead"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hint */}
      <div className="flex items-start gap-2.5 text-xs text-muted-foreground bg-card border border-border rounded-lg px-4 py-3 shadow-sm">
        <div className="w-1 self-stretch bg-primary rounded-full shrink-0" />
        <p>
          Click an organization to open its full record. Use <strong className="text-foreground">Outreach</strong> or{" "}
          <strong className="text-foreground">Add Project</strong> right from the row. Click column headers to sort.
        </p>
      </div>

      {outreachOrg && (
        <OutreachComposer
          open={outreachOpen}
          org={outreachOrg}
          pursuits={getOrgPursuits(outreachOrg, allPursuits)}
          onClose={() => setOutreachOpen(false)}
        />
      )}

      {/* Add Project Modal */}
      <Modal open={addPursuitOpen} onClose={() => setAddPursuitOpen(false)} title={`Add Project — ${addPursuitOrg?.name ?? ""}`} wide>
        <AddPursuitForm
          open={addPursuitOpen}
          onCancel={() => setAddPursuitOpen(false)}
          onSubmit={handleCreatePursuit}
        />
      </Modal>
    </div>
  );
}
