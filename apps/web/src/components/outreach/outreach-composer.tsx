"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Organization, Pursuit } from "@/lib/mock-data";
import { Modal, FormField, TextInput, TextArea, SelectInput, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { buildOutreachBriefing, preferredPursuitId } from "@/lib/outreach-briefing";
import { cn } from "@/lib/cn";

type GroundingInsight = {
  id: string;
  source: "lead" | "rfp";
  text: string;
};

type DraftResponse = {
  subject: string;
  body: string;
  insights: GroundingInsight[];
  modelVersion: string;
  provider: "claude" | "gemini";
  promptVersion: string;
};

function contactLabel(contact: Organization["contacts"][number]) {
  const dest = contact.email || contact.linkedinUrl?.replace(/^https?:\/\/(www\.)?/, "") || "LinkedIn";
  return `${contact.name} <${dest}>`;
}

function providerLabel(provider?: string, model?: string) {
  if (!provider) return null;
  const name = provider === "claude" ? "Claude" : "Gemini";
  const short = model?.replace(/^claude-/, "").replace(/^gemini-/, "") ?? "";
  return short ? `${name} · ${short}` : name;
}

export function OutreachComposer({
  open,
  org,
  pursuits,
  initialPursuitId,
  onClose,
}: {
  open: boolean;
  org: Organization;
  pursuits: Pursuit[];
  initialPursuitId?: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [contactIndex, setContactIndex] = useState(0);
  const [pursuitId, setPursuitId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [insights, setInsights] = useState<GroundingInsight[]>([]);
  const [provider, setProvider] = useState<string | undefined>();
  const [modelVersion, setModelVersion] = useState<string | undefined>();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groundingHint, setGroundingHint] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);

  const activePursuits = useMemo(
    () => pursuits.filter(p => !p.closed),
    [pursuits],
  );
  const selectablePursuits = activePursuits.length ? activePursuits : pursuits;
  const contact = org.contacts[contactIndex] ?? org.contacts[0];

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      return;
    }
    const nextPursuitId = initialPursuitId && selectablePursuits.some(p => p.id === initialPursuitId)
      ? initialPursuitId
      : preferredPursuitId(selectablePursuits) ?? "";
    setContactIndex(0);
    setPursuitId(nextPursuitId);
    setSubject("");
    setBody("");
    setInsights([]);
    setProvider(undefined);
    setModelVersion(undefined);
    setError(null);
    void generateDraft(nextPursuitId, 0);
    return () => {
      abortRef.current?.abort();
    };
    // selectablePursuits is derived from org/pursuits; org.id + initialPursuitId are the open trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, org.id, initialPursuitId]);

  async function generateDraft(nextPursuitId = pursuitId, nextContactIndex = contactIndex) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeq.current;
    setGenerating(true);
    setError(null);

    const pursuit = selectablePursuits.find(p => p.id === nextPursuitId) ?? null;
    setGroundingHint(
      pursuit
        ? `Grounded in ${org.name} and ${pursuit.solicitationRef || pursuit.name}`
        : `Grounded in ${org.name} lead profile`,
    );
    const briefing = buildOutreachBriefing({
      org,
      pursuit,
      contactIndex: nextContactIndex,
      senderName: "J. Tran",
      senderTitle: "Bid Manager",
    });

    try {
      const res = await fetch("/api/outreach/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefing }),
        signal: controller.signal,
      });
      const data = await res.json() as DraftResponse & { error?: string };
      if (seq !== requestSeq.current) return;
      if (!res.ok) {
        setError(data.error || "Unable to generate outreach.");
        return;
      }
      setSubject(data.subject);
      setBody(data.body);
      setInsights(data.insights ?? []);
      setProvider(data.provider);
      setModelVersion(data.modelVersion);
    } catch (err) {
      if (controller.signal.aborted || seq !== requestSeq.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unable to generate outreach.");
    } finally {
      if (seq === requestSeq.current) setGenerating(false);
    }
  }

  function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    toast(`Outreach email queued for ${org.name}`, "success");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Outreach — ${org.name}`} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/5 border border-primary/20 rounded-md px-2 py-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 3v3M12 18v3M4.9 6.3l2.1 2.1M17 15.6l2.1 2.1M3 12h3M18 12h3M4.9 17.7l2.1-2.1M17 8.4l2.1-2.1" />
            </svg>
            AI draft
          </span>
          {provider && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {providerLabel(provider, modelVersion)}
            </span>
          )}
        </div>

        {org.contacts.length > 1 && (
          <FormField label="To">
            <SelectInput
              value={String(contactIndex)}
              onChange={v => {
                const next = Number(v);
                setContactIndex(next);
                void generateDraft(pursuitId, next);
              }}
              options={org.contacts.map((c, i) => ({
                value: String(i),
                label: contactLabel(c),
              }))}
            />
          </FormField>
        )}
        {org.contacts.length <= 1 && (
          <FormField label="To">
            <div className="text-xs text-foreground px-3 py-2 rounded-md border border-input bg-muted/30">
              {contact
                ? contactLabel(contact)
                : <span className="text-muted-foreground italic">No contacts on file</span>}
            </div>
          </FormField>
        )}

        {selectablePursuits.length > 0 && (
          <FormField label="Ground in project">
            <SelectInput
              value={pursuitId}
              onChange={id => {
                setPursuitId(id);
                void generateDraft(id, contactIndex);
              }}
              options={[
                { value: "", label: "Lead profile only — no project" },
                ...selectablePursuits.map(p => ({
                  value: p.id,
                  label: `${p.name} (${p.solicitationRef})`,
                })),
              ]}
            />
          </FormField>
        )}

        <FormField label="Subject">
          <TextInput value={subject} onChange={setSubject} placeholder={generating ? "Drafting subject…" : "Subject"} />
        </FormField>
        <FormField label="Message">
          <div className="relative">
            <TextArea
              value={body}
              onChange={setBody}
              rows={10}
              placeholder={generating ? "Drafting a message from the lead profile and selected project…" : "Generate a grounded draft to start."}
            />
            {generating && (
              <div className="absolute inset-0 rounded-md bg-card/70 flex items-center justify-center text-xs text-muted-foreground">
                {groundingHint || "Drafting a grounded message"}…
              </div>
            )}
          </div>
        </FormField>

        {insights.length > 0 && !generating && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Grounded in
            </div>
            <div className="flex flex-wrap gap-1.5">
              {insights.map(insight => (
                <span
                  key={insight.id}
                  className={cn(
                    "inline-flex items-start gap-1.5 max-w-full text-[11px] leading-snug px-2 py-1 rounded-md border",
                    insight.source === "rfp"
                      ? "text-primary border-primary/30 bg-primary/5"
                      : "text-foreground border-border bg-muted/40",
                  )}
                  title={insight.text}
                >
                  <span className="font-bold uppercase tracking-wider shrink-0">
                    {insight.source === "rfp" ? "Project" : "Lead"}
                  </span>
                  <span className="truncate max-w-[280px]">{insight.text}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-nogo bg-nogo-soft border border-nogo/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-2 pt-2">
          <SecondaryButton onClick={() => void generateDraft()} disabled={generating}>
            {generating ? "Generating…" : "Regenerate"}
          </SecondaryButton>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSend} disabled={generating || !subject.trim() || !body.trim()}>
              Send Outreach
            </PrimaryButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}
