"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { FormField, TextInput, SelectInput, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { DocumentDropzone } from "@/components/pursuit/document-dropzone";

export type AddPursuitValues = {
  name: string;
  lane: "B" | "C";
  solicitationRef: string;
  files: File[];
};

export function AddPursuitForm({
  open,
  extraFields,
  submitLabel = "Add Project",
  busyLabel = "Parsing & scoring…",
  onCancel,
  onSubmit,
}: {
  open: boolean;
  extraFields?: ReactNode;
  submitLabel?: string;
  busyLabel?: string;
  onCancel: () => void;
  onSubmit: (values: AddPursuitValues) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [lane, setLane] = useState<"B" | "C">("B");
  const [solicitationRef, setSolicitationRef] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setLane("B");
    setSolicitationRef("");
    setFiles([]);
    setBusy(false);
    setError(null);
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() && files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        lane,
        solicitationRef: solicitationRef.trim(),
        files,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add this project.");
      setBusy(false);
    }
  }

  const canSubmit = Boolean(name.trim() || files.length) && !busy;

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {extraFields}
      <FormField label="Project name" hint={files.length ? "Leave blank to use the title extracted from the document." : undefined}>
        <TextInput value={name} onChange={setName} placeholder="e.g. Claims Platform Modernization" />
      </FormField>
      <FormField label="Type">
        <SelectInput
          value={lane}
          onChange={v => setLane(v as "B" | "C")}
          options={[
            { value: "B", label: "Government RFP" },
            { value: "C", label: "Private SOW" },
          ]}
        />
      </FormField>
      <FormField label="Solicitation reference (optional)">
        <TextInput value={solicitationRef} onChange={setSolicitationRef} placeholder="e.g. RFP 24-118" />
      </FormField>
      <FormField
        label="RFP / SOW document"
        hint="We'll parse the document, map requirements to DataBillity capabilities, and score Go / No-Go. That packet also grounds a later response if you confirm Go."
      >
        <DocumentDropzone files={files} onChange={setFiles} disabled={busy} />
      </FormField>
      {error && (
        <p className="text-xs text-destructive bg-[hsl(var(--status-nogo-soft))] border border-destructive/20 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <SecondaryButton type="button" onClick={onCancel} disabled={busy}>Cancel</SecondaryButton>
        <PrimaryButton type="submit" disabled={!canSubmit}>
          {busy ? busyLabel : files.length ? "Add & score" : submitLabel}
        </PrimaryButton>
      </div>
    </form>
  );
}
