"use client";

import { useState } from "react";
import type { Organization, Pursuit } from "@/lib/mock-data";
import { Modal, FormField, TextArea, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { OutreachComposer } from "@/components/outreach/outreach-composer";
import { AddPursuitForm } from "@/components/pursuit/add-pursuit-form";
import { createPursuitFromForm, recLabel } from "@/lib/create-pursuit";
import { cn } from "@/lib/cn";

function getOrgPursuits(org: Organization, allPursuits: Record<string, Pursuit>): Pursuit[] {
  return org.pursuits.map(pid => allPursuits[pid]).filter(Boolean) as Pursuit[];
}

function getOrgTopScore(org: Organization, allPursuits: Record<string, Pursuit>): number {
  const active = getOrgPursuits(org, allPursuits).filter(p => !p.closed);
  if (active.length) return Math.max(...active.map(p => p.score));
  return org.score;
}

function RecPill({ rec, closed }: { rec: string; closed?: boolean }) {
  if (closed) return <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-closed">CLOSED</span>;
  const map: Record<string, [string, string]> = {
    go: ["GO", "oe-status-go"],
    nogo: ["NO-GO", "oe-status-nogo"],
    cond: ["CONDITIONS", "oe-status-cond"],
    pending: ["PENDING", "oe-status-pending"],
  };
  const [label, cls] = map[rec] ?? map.pending!;
  return <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md ${cls}`}>{label}</span>;
}

export function OrgDetailView({
  org,
  allPursuits,
  onPursuitSelect,
  onBack,
  onAddPursuit,
}: {
  org: Organization;
  allPursuits: Record<string, Pursuit>;
  onPursuitSelect: (id: string) => void;
  onBack: () => void;
  onAddPursuit: (pursuit: Pursuit) => void;
}) {
  const pursuits = getOrgPursuits(org, allPursuits);
  const score = getOrgTopScore(org, allPursuits);
  const { toast } = useToast();

  const [outreachOpen, setOutreachOpen] = useState(false);

  const [addPursuitOpen, setAddPursuitOpen] = useState(false);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [localNotes, setLocalNotes] = useState(org.notes);

  function openOutreach() {
    setOutreachOpen(true);
  }

  async function handleCreatePursuit(values: { name: string; lane: "B" | "C"; solicitationRef: string; files: File[] }) {
    const { pursuit, ingested, warning } = await createPursuitFromForm({
      org,
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
      toast(`Added project "${pursuit.name}" for ${org.name}`, "success");
    }
    if (warning) toast(warning, "warning");
    setAddPursuitOpen(false);
  }

  function handleAddNote() {
    if (!noteText.trim()) return;
    const newNote = {
      author: "J. Tran",
      date: new Date().toISOString().slice(0, 10),
      text: noteText.trim(),
    };
    setLocalNotes(prev => [...prev, newNote]);
    toast("Note added", "success");
    setNoteOpen(false);
    setNoteText("");
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
        <button onClick={onBack} className="text-primary font-medium cursor-pointer hover:underline bg-transparent border-none shrink-0">
          Pipeline
        </button>
        <span>/</span>
        <span className="text-foreground font-medium truncate">{org.name}</span>
      </nav>

      {/* Header card */}
      <div className="bg-card rounded-xl border shadow-sm p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 sm:gap-5">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground mb-1">{org.name}</h1>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
              <span>{org.industry || "Industry not set"}</span>
              <span>·</span>
              <span>Channel: {org.channel}</span>
              <span>·</span>
              <span>Score <strong className="font-mono text-foreground">{score}</strong></span>
              {org.domain && <><span>·</span><span className="font-mono">{org.domain}</span></>}
              {org.registryId && <><span>·</span><span className="font-mono">{org.registryId}</span></>}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={openOutreach}
              className="text-xs font-medium px-3.5 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
            >
              Outreach
            </button>
            <button
              onClick={() => setAddPursuitOpen(true)}
              className="text-xs font-semibold px-3.5 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm"
            >
              + Add Project
            </button>
          </div>
        </div>
      </div>

      {/* Summary card */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Summary</h3>
          </div>
          <div className="p-4 sm:p-5 text-sm text-foreground">
          {org.summary || <span className="text-muted-foreground italic">No summary yet.</span>}
        </div>
      </div>

      {/* Score factors card */}
      {org.scoreFactors.length > 0 && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Why this is a good opportunity</h3>
            <span className="text-[11px] text-muted-foreground font-mono">SCORE-07</span>
          </div>
          <div className="p-5">
            <ul className="list-disc pl-4 text-sm space-y-2 text-foreground">
              {org.scoreFactors.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Score history card */}
      {org.scoreHistory.length > 0 && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Score History</h3>
          </div>
          <div className="divide-y divide-border">
            {org.scoreHistory.map((h, i) => (
              <div key={i} className="px-4 sm:px-5 py-3 flex flex-col xs:flex-row xs:items-center gap-1 xs:gap-4">
                <span className="font-mono font-bold text-primary text-sm w-8">{h.score}</span>
                <span className="text-[11px] text-muted-foreground font-mono w-24 shrink-0">{h.at}</span>
                <span className="text-xs text-foreground">{h.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contacts card */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="oe-card-title">Key Contacts</h3>
        </div>
        <div className="p-5">
          {org.contacts.length > 0 ? org.contacts.map((c, i) => (
            <div key={i} className="py-3 border-b border-border last:border-b-0 text-xs space-y-1.5">
              <div className="text-foreground">
                <span className="font-semibold">{c.name}</span>
                {c.title ? <span className="text-muted-foreground"> — {c.title}</span> : null}
              </div>
              <dl className="grid gap-1 text-muted-foreground">
                {c.company && c.company !== org.name ? (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium text-foreground/80 w-24 shrink-0">Company</dt>
                    <dd>{c.company}</dd>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-foreground/80 w-24 shrink-0">Email</dt>
                  <dd className="font-mono break-all">{c.email || (org.channel === "LinkedIn" ? "Not in LinkedIn export" : "—")}</dd>
                </div>
                {c.linkedinUrl ? (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium text-foreground/80 w-24 shrink-0">LinkedIn</dt>
                    <dd>
                      <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                        {c.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {c.connectedOn ? (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium text-foreground/80 w-24 shrink-0">Connected</dt>
                    <dd className="font-mono">{c.connectedOn}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          )) : (
            <div className="text-xs text-muted-foreground italic">No contacts on file yet.</div>
          )}
        </div>
      </div>

      {/* Notes card */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="oe-card-title">Notes</h3>
          <button
            onClick={() => setNoteOpen(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
          >
            + Add Note
          </button>
        </div>
        <div className="p-5">
          {localNotes.length > 0 ? localNotes.map((n, i) => (
            <div key={i} className="py-2.5 border-b border-border last:border-b-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-foreground">{n.author}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{n.date}</span>
              </div>
              <p className="text-xs text-foreground">{n.text}</p>
            </div>
          )) : (
            <div className="text-xs text-muted-foreground italic">No notes yet.</div>
          )}
        </div>
      </div>

      {/* Projects card */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="oe-card-title">Projects — current and history</h3>
        </div>
        <div className="lg:hidden divide-y divide-border">
          {pursuits.length > 0 ? pursuits.map(p => (
            <div key={p.id} className={cn("p-4 space-y-2", p.closed && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{p.solicitationRef} · {p.typeLabel}</div>
                </div>
                <span className="font-mono font-semibold text-foreground shrink-0">{p.score}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <RecPill rec={p.rec} closed={p.closed} />
                  <span className="text-xs text-muted-foreground truncate">{p.status}</span>
                </div>
                <button
                  onClick={() => onPursuitSelect(p.id)}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary shrink-0"
                >
                  View
                </button>
              </div>
            </div>
          )) : (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground italic">
              No projects yet. Click <strong className="text-foreground">+ Add Project</strong> to add one.
            </div>
          )}
        </div>
        <div className="hidden lg:block overflow-x-auto oe-touch-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="oe-table-header">
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Project</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Type</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Score</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Decision</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Status</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {pursuits.length > 0 ? pursuits.map(p => (
                <tr key={p.id} className={cn(
                  "oe-table-row border-b border-border last:border-b-0",
                  p.closed && "opacity-60"
                )}>
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {p.name} <span className="text-muted-foreground font-normal font-mono text-[11px]">({p.solicitationRef})</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.typeLabel}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-foreground">{p.score}</td>
                  <td className="px-4 py-3"><RecPill rec={p.rec} closed={p.closed} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{p.status}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onPursuitSelect(p.id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
                    >
                      View
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground italic">
                    No projects yet. Click <strong className="text-foreground">+ Add Project</strong> to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <OutreachComposer
        open={outreachOpen}
        org={org}
        pursuits={pursuits}
        onClose={() => setOutreachOpen(false)}
      />

      {/* Add Project Modal */}
      <Modal open={addPursuitOpen} onClose={() => setAddPursuitOpen(false)} title={`Add Project — ${org.name}`} wide>
        <AddPursuitForm
          open={addPursuitOpen}
          onCancel={() => setAddPursuitOpen(false)}
          onSubmit={handleCreatePursuit}
        />
      </Modal>

      {/* Add Note Modal */}
      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="Add Note">
        <div className="space-y-4">
          <FormField label="Note">
            <TextArea value={noteText} onChange={setNoteText} placeholder="Type your note here…" rows={4} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setNoteOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleAddNote} disabled={!noteText.trim()}>Add Note</PrimaryButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
