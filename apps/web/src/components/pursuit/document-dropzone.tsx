"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

export function DocumentDropzone({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function merge(next: FileList | File[]) {
    const incoming = Array.from(next);
    const byKey = new Map(files.map(file => [`${file.name}:${file.size}:${file.lastModified}`, file]));
    for (const file of incoming) {
      byKey.set(`${file.name}:${file.size}:${file.lastModified}`, file);
    }
    onChange(Array.from(byKey.values()).slice(0, 5));
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={e => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled && e.dataTransfer.files.length) merge(e.dataTransfer.files);
        }}
        className={cn(
          "border-2 border-dashed rounded-lg px-4 py-5 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/10",
          disabled && "opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={disabled}
          className="sr-only"
          onChange={e => {
            if (e.target.files?.length) merge(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="text-xs text-foreground font-medium">Drop the RFP or SOW here</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          PDF, Word (.docx), or text · up to 5 files, 12 MB each
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="mt-3 text-xs font-semibold px-3.5 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary disabled:opacity-50"
        >
          Choose files
        </button>
      </div>
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map(file => (
            <li
              key={`${file.name}:${file.size}:${file.lastModified}`}
              className="flex items-center gap-2 border border-border rounded-md px-3 py-2 bg-card"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary shrink-0">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="text-xs font-medium text-foreground truncate flex-1">{file.name}</span>
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                {file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(files.filter(item => item !== file))}
                className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
