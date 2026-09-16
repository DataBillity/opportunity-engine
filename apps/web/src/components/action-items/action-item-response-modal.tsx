"use client";

import { useEffect, useState } from "react";
import type { ResponseActionItem } from "@/lib/mock-data";
import { Modal, FormField, TextArea, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { DocumentDropzone } from "@/components/pursuit/document-dropzone";

export function ActionItemResponseModal({
  open,
  item,
  pursuitName,
  assigneeLabel,
  onClose,
  onSave,
}: {
  open: boolean;
  item: ResponseActionItem | null;
  pursuitName?: string;
  assigneeLabel?: string;
  onClose: () => void;
  onSave: (updates: Partial<ResponseActionItem>) => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!open || !item) return;
    setText(item.responseContent ?? "");
    setFiles([]);
  }, [open, item]);

  if (!item) return null;

  const wantsFile = item.expectedResponseType === "file";
  const canSave = wantsFile ? files.length > 0 || Boolean(item.responseDocument) : Boolean(text.trim());

  return (
    <Modal open={open} onClose={onClose} title="Action Item">
      <div className="space-y-4 text-xs">
        <div>
          <div className="text-sm font-semibold text-foreground">{item.description}</div>
          <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
            {pursuitName && <div>Project: {pursuitName}</div>}
            <div>Assigned: {assigneeLabel || item.assignedInternal || "Unassigned"}</div>
            <div>Due: {item.dueAt}</div>
            {item.gates.length > 0 && <div>Gates: {item.gates.join(", ")}</div>}
            <div>Status: {item.status}</div>
          </div>
        </div>
        {wantsFile ? (
          <FormField label="Upload the requested file" hint={item.responseDocument ? `On file: ${item.responseDocument.name}` : undefined}>
            <DocumentDropzone files={files} onChange={setFiles} />
          </FormField>
        ) : (
          <FormField label="Response">
            <TextArea value={text} onChange={setText} rows={5} placeholder="Provide the requested information" />
          </FormField>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton
            disabled={!canSave}
            onClick={() => {
              onSave({
                responseContent: wantsFile ? item.responseContent : text.trim(),
                responseDocument: wantsFile && files[0] ? { name: files[0].name } : item.responseDocument,
                status: "Done",
              });
              onClose();
            }}
          >
            Save response
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
