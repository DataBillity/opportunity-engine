"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { ProjectType } from "@opportunity-engine/contracts";
import { laneForProjectType } from "@opportunity-engine/core";
import { FormField, TextInput, SelectInput, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { DocumentDropzone } from "@/components/pursuit/document-dropzone";

export type AddPursuitValues = {
  name: string;
  lane: "B" | "C";
  projectType: ProjectType;
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
  const [projectType, setProjectType] = useState<ProjectType>("rfp");
  const [solicitationRef, setSolicitationRef] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setProjectType("rfp");
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
        lane: laneForProjectType(projectType),
        projectType,
        solicitationRef: solicitationRef.trim(),
        files,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add this project.");
      setBusy(false);
    }
  }

  const canSubmit = Boolean(name.trim() || files.length) && !busy;
  const docHint = projectType === "rfi"
    ? "We'll parse the RFI as market research: information requests, topical fit, and a Respond / Pass recommendation — not a bid Go/No-Go."
    : "We'll parse the document, map requirements to DataBillity capabilities, and score Go / No-Go. That packet also grounds a later response if you confirm Go.";

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {extraFields}
      <FormField label="Project name" hint={files.length ? "Leave blank to use the title extracted from the document." : undefined}>
        <TextInput value={name} onChange={setName} placeholder="e.g. Claims Platform Modernization" />
      </FormField>
      <FormField
        label="Type"
        hint={projectType === "rfi"
          ? "RFI = request for information. Questions are not bid requirements we have already answered."
          : undefined}
      >
        <SelectInput
          value={projectType}
          onChange={v => setProjectType(v as ProjectType)}
          options={[
            { value: "rfp", label: "RFP" },
            { value: "rfi", label: "RFI" },
            { value: "sow", label: "SOW" },
          ]}
        />
      </FormField>
      <FormField label="Solicitation reference (optional)">
        <TextInput
          value={solicitationRef}
          onChange={setSolicitationRef}
          placeholder={projectType === "rfi" ? "e.g. RFI 26-014" : projectType === "sow" ? "e.g. Direct SOW" : "e.g. RFP 24-118"}
        />
      </FormField>
      <FormField
        label={projectType === "rfi" ? "RFI document" : "RFP / SOW document"}
        hint={docHint}
      >
        <DocumentDropzone
          files={files}
          onChange={setFiles}
          disabled={busy}
          dropLabel={projectType === "rfi" ? "Drop the RFI here" : projectType === "sow" ? "Drop the SOW here" : "Drop the RFP or SOW here"}
        />
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
