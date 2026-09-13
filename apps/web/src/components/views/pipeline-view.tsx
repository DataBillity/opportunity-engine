"use client";

import { useState } from "react";
import type { Organization, Pursuit } from "@/lib/mock-data";
import { Modal, FormField, TextInput, TextArea, SelectInput, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
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
  const [outreachSubject, setOutreachSubject] = useState("");
  const [outreachBody, setOutreachBody] = useState("");

  const [addPursuitOpen, setAddPursuitOpen] = useState(false);
  const [addPursuitOrg, setAddPursuitOrg] = useState<Organization | null>(null);
  const [npName, setNpName] = useState("");
  const [npType, setNpType] = useState<"B" | "C">("B");
  const [npRef, setNpRef] = useState("");

  let rows = orgs;
  if (laneFilter && laneFilter !== "all") {
    if (laneFilter === "A") rows = orgs.filter(o => o.pursuits.length === 0);
    else rows = orgs.filter(o => getOrgPursuits(o, allPursuits).some(p => p.lane === laneFilter));
  }

  function openOutreach(org: Organization) {
    setOutreachOrg(org);
    setOutreachSubject(`Follow-up: Opportunity Discussion with ${org.name}`);
    setOutreachBody(`Dear ${org.contacts[0]?.name || "Team"},\n\nI'm reaching out regarding potential opportunities for collaboration. Based on our analysis, we see strong alignment with your upcoming needs.\n\nWould you be available for a brief call this week?\n\nBest regards,\nJ. Tran`);
    setOutreachOpen(true);
  }

  function handleSendOutreach() {
    toast(`Outreach email queued for ${outreachOrg?.name}`, "success");
    setOutreachOpen(false);
  }

  function openAddPursuit(org: Organization) {
    setAddPursuitOrg(org);
    setNpName("");
    setNpType("B");
    setNpRef("");
    setAddPursuitOpen(true);
  }

  function handleCreatePursuit() {
    if (!npName.trim() || !addPursuitOrg) return;
    const id = `OPP-${Date.now().toString().slice(-4)}`;
    const pursuit: Pursuit = {
      id,
      orgId: addPursuitOrg.id,
      name: npName.trim(),
      typeLabel: npType === "B" ? "Government RFP" : "Private SOW",
      solicitationRef: npRef.trim() || (npType === "B" ? `RFP-${id.slice(-4)}` : "Direct SOW"),
      lane: npType,
      score: 50,
      status: "New — awaiting triage",
      rec: "pending",
      confidence: 0,
      closed: false,
      dueDate: null,
      documents: [],
      docSummary: { objective: [], services: [], deliverables: [] },
      rationale: ["Awaiting initial triage and scoring."],
      reqmap: [],
      gaps: [],
      rfund: { lane: npType, tier: "pending", score: 0, note: "Not yet assessed." },
      decisionRecord: {
        id: `DEC-${Date.now().toString().slice(-5)}`,
        type: "D4 — Go/No-Go triage",
        subject: `Pursuit ${id}`,
        model: "triage-v3 / prompt v1.9 / graph v213",
        reviewer: "— not yet assigned",
        action: "Awaiting triage",
        retention: "3 years minimum",
      },
    };
    onAddPursuit(pursuit);
    toast(`Created pursuit "${npName.trim()}" for ${addPursuitOrg.name}`, "success");
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
                    Add RFP/SOW
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
                <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-3">Pursuits</th>
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
      </div>

      {/* Hint */}
      <div className="flex items-start gap-2.5 text-xs text-muted-foreground bg-card border border-border rounded-lg px-4 py-3 shadow-sm">
        <div className="w-1 self-stretch bg-primary rounded-full shrink-0" />
        <p>
          Click an organization to open its full record. Use <strong className="text-foreground">Outreach</strong> or{" "}
          <strong className="text-foreground">Add RFP/SOW</strong> right from the row.
        </p>
      </div>

      {/* Outreach Modal */}
      <Modal open={outreachOpen} onClose={() => setOutreachOpen(false)} title={`Outreach — ${outreachOrg?.name ?? ""}`} wide>
        <div className="space-y-4">
          <FormField label="To">
            <div className="text-xs text-foreground px-3 py-2 rounded-md border border-input bg-muted/30">
              {outreachOrg?.contacts[0]
                ? `${outreachOrg.contacts[0].name} <${outreachOrg.contacts[0].email}>`
                : <span className="text-muted-foreground italic">No contacts on file — will send to general inbox</span>
              }
            </div>
          </FormField>
          <FormField label="Subject">
            <TextInput value={outreachSubject} onChange={setOutreachSubject} />
          </FormField>
          <FormField label="Message">
            <TextArea value={outreachBody} onChange={setOutreachBody} rows={6} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setOutreachOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSendOutreach}>Send Outreach</PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Add Pursuit Modal */}
      <Modal open={addPursuitOpen} onClose={() => setAddPursuitOpen(false)} title={`Add RFP/SOW — ${addPursuitOrg?.name ?? ""}`}>
        <div className="space-y-4">
          <FormField label="Pursuit name">
            <TextInput value={npName} onChange={setNpName} placeholder="e.g. Fare Systems Modernization" />
          </FormField>
          <FormField label="Type">
            <SelectInput
              value={npType}
              onChange={v => setNpType(v as "B" | "C")}
              options={[
                { value: "B", label: "Government RFP" },
                { value: "C", label: "Private SOW" },
              ]}
            />
          </FormField>
          <FormField label="Solicitation reference (optional)">
            <TextInput value={npRef} onChange={setNpRef} placeholder="e.g. RFP 24-118" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setAddPursuitOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleCreatePursuit} disabled={!npName.trim()}>Create</PrimaryButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
