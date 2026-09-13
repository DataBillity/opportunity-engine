"use client";

import { useState } from "react";
import type { Organization, Pursuit } from "@/lib/mock-data";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { OutreachComposer } from "@/components/outreach/outreach-composer";
import { AddPursuitForm } from "@/components/pursuit/add-pursuit-form";
import { createPursuitFromForm, recLabel } from "@/lib/create-pursuit";
import { cn } from "@/lib/cn";

function laneLabel(l: string) {
  return { A: "Prospect", B: "RFP", C: "SOW", D: "Partner" }[l] ?? l;
}

function getOrgPursuits(org: Organization, allPursuits: Record<string, Pursuit>): Pursuit[] {
  return org.pursuits.map(pid => allPursuits[pid]).filter(Boolean) as Pursuit[];
}

function getOrgTopScore(org: Organization, allPursuits: Record<string, Pursuit>): number {
  const active = getOrgPursuits(org, allPursuits).filter(p => !p.closed);
  if (active.length) return Math.max(...active.map(p => p.score));
  return org.score;
}

export function PipelineView({
  laneFilter,
  onOrgSelect,
  orgs,
  allPursuits,
  onAddPursuit,
}: {
  laneFilter: string;
  onOrgSelect: (id: string) => void;
  orgs: Organization[];
  allPursuits: Record<string, Pursuit>;
  onAddPursuit: (pursuit: Pursuit) => void;
}) {
  const { toast } = useToast();

  const [outreachOpen, setOutreachOpen] = useState(false);
  const [outreachOrg, setOutreachOrg] = useState<Organization | null>(null);

  const [addPursuitOpen, setAddPursuitOpen] = useState(false);
  const [addPursuitOrg, setAddPursuitOrg] = useState<Organization | null>(null);

  let rows = orgs;
  if (laneFilter && laneFilter !== "all") {
    if (laneFilter === "A") rows = orgs.filter(o => o.pursuits.length === 0);
    else rows = orgs.filter(o => getOrgPursuits(o, allPursuits).some(p => p.lane === laneFilter));
  }

  function openOutreach(org: Organization) {
    setOutreachOrg(org);
    setOutreachOpen(true);
  }

  function openAddPursuit(org: Organization) {
    setAddPursuitOrg(org);
    setAddPursuitOpen(true);
  }

  async function handleCreatePursuit(values: { name: string; lane: "B" | "C"; solicitationRef: string; files: File[] }) {
    if (!addPursuitOrg) return;
    const { pursuit, ingested, warning } = await createPursuitFromForm({
      org: addPursuitOrg,
      name: values.name,
      lane: values.lane,
      solicitationRef: values.solicitationRef,
      files: values.files,
    });
    onAddPursuit(pursuit);
    if (ingested) {
      toast(
        `"${pursuit.name}" scored ${pursuit.score} — ${recLabel(pursuit.rec)}. Confirm Go/No-Go on the opportunity.`,
        pursuit.rec === "nogo" ? "warning" : "success",
      );
    } else {
      toast(`Added project "${pursuit.name}" for ${addPursuitOrg.name}`, "success");
    }
    if (warning) toast(warning, "warning");
    setAddPursuitOpen(false);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="oe-page-title">Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every organization currently being worked — from search &amp; discovery, direct leads, or partner introductions.
        </p>
      </div>

      {/* Table card */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        {/* Mobile / tablet cards */}
        <div className="lg:hidden divide-y divide-border">
          {rows.map(org => {
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
                      {org.industry || "—"} · {org.channel}
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
                        p.lane === "B"
                          ? "text-primary border-primary/30 bg-primary/5"
                          : "text-trace border-trace/30 bg-trace/5"
                      )}
                    >
                      {laneLabel(p.lane)}
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
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden lg:block overflow-x-auto oe-touch-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="oe-table-header">
                <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-3">Organization</th>
                <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-3 hidden lg:table-cell">Industry</th>
                <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-3">Channel</th>
                <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-3">Score</th>
                <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-3">Projects</th>
                <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(org => {
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
                              p.lane === "B"
                                ? "text-primary border-primary/30 bg-primary/5"
                                : "text-trace border-trace/30 bg-trace/5"
                            )}
                          >
                            {laneLabel(p.lane)}
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
          <strong className="text-foreground">Add Project</strong> right from the row.
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
