"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Pursuit } from "@/lib/mock-data";
import { useToast } from "@/components/ui/toast";

/**
 * Response generation that outlives the Response Builder view. Jobs run at the page level and
 * write their results onto the pursuit, so leaving the view (or switching opportunities) does not
 * cancel or lose a draft. One job per pursuit at a time.
 */

export type ResponseJobKind = "package" | "section" | "cover_letter";

export interface ResponseJobOutcome {
  /** Computed against the latest pursuit when the job finishes, not the one it started from. */
  apply?: (pursuit: Pursuit) => Partial<Pursuit>;
  /** Section drafts the job wrote, so a mounted view can refresh just those. */
  sectionIds?: string[];
  message: string;
  toast: string;
  tone: "success" | "warning" | "error";
  /** Display state for a mounted Response Builder: trace label for written sections, and whether others need re-review. */
  hints?: { tracePct?: string; reviewOthers?: boolean };
}

export interface ResponseJob {
  id: string;
  pursuitId: string;
  pursuitName: string;
  kind: ResponseJobKind;
  sectionId?: string;
  label: string;
  startedAt: number;
}

export interface ResponseJobResult {
  jobId: string;
  pursuitId: string;
  kind: ResponseJobKind;
  sectionId?: string;
  sectionIds: string[];
  message: string;
  tone: ResponseJobOutcome["tone"];
  hints?: ResponseJobOutcome["hints"];
  finishedAt: number;
}

interface ResponseJobsApi {
  /** `run` may report progress; each call replaces the running job's label. */
  start: (job: Omit<ResponseJob, "id" | "startedAt"> & { run: (progress: (label: string) => void) => Promise<ResponseJobOutcome> }) => boolean;
  running: Record<string, ResponseJob>;
  results: Record<string, ResponseJobResult>;
}

const ResponseJobsContext = createContext<ResponseJobsApi | null>(null);

export function ResponseJobsProvider({
  onApply,
  children,
}: {
  onApply: (pursuitId: string, apply: (pursuit: Pursuit) => Partial<Pursuit>) => void;
  children: ReactNode;
}) {
  const { toast } = useToast();
  const [running, setRunning] = useState<Record<string, ResponseJob>>({});
  const [results, setResults] = useState<Record<string, ResponseJobResult>>({});
  const active = useRef(new Set<string>());
  const applyRef = useRef(onApply);
  applyRef.current = onApply;

  const start = useCallback<ResponseJobsApi["start"]>(({ run, ...meta }) => {
    if (active.current.has(meta.pursuitId)) return false;
    active.current.add(meta.pursuitId);
    const job: ResponseJob = { ...meta, id: `JOB-${Date.now().toString(36)}`, startedAt: Date.now() };
    setRunning(prev => ({ ...prev, [job.pursuitId]: job }));

    const finish = (outcome: ResponseJobOutcome) => {
      if (outcome.apply) applyRef.current(job.pursuitId, outcome.apply);
      active.current.delete(job.pursuitId);
      setRunning(prev => {
        const next = { ...prev };
        delete next[job.pursuitId];
        return next;
      });
      setResults(prev => ({
        ...prev,
        [job.pursuitId]: {
          jobId: job.id,
          pursuitId: job.pursuitId,
          kind: job.kind,
          sectionId: job.sectionId,
          sectionIds: outcome.sectionIds ?? [],
          message: outcome.message,
          tone: outcome.tone,
          hints: outcome.hints,
          finishedAt: Date.now(),
        },
      }));
      toast(`${job.pursuitName}: ${outcome.toast}`, outcome.tone);
    };

    const progress = (label: string) => {
      if (!active.current.has(job.pursuitId)) return;
      setRunning(prev => {
        const current = prev[job.pursuitId];
        return current?.id === job.id ? { ...prev, [job.pursuitId]: { ...current, label } } : prev;
      });
    };

    void run(progress).then(finish, (err: unknown) => {
      const message = err instanceof Error ? err.message : "Generation failed";
      finish({ message, toast: message, tone: "error" });
    });
    return true;
  }, [toast]);

  const anyRunning = Object.keys(running).length > 0;
  useEffect(() => {
    if (!anyRunning) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyRunning]);

  const api = useMemo(() => ({ start, running, results }), [start, running, results]);
  const jobs = Object.values(running);

  return (
    <ResponseJobsContext.Provider value={api}>
      {children}
      {jobs.length > 0 && (
        <div className="fixed z-40 inset-x-3 top-16 sm:inset-x-auto sm:top-auto sm:left-5 sm:bottom-5 sm:max-w-sm flex flex-col gap-2 pointer-events-none" aria-live="polite">
          {jobs.map(job => (
            <div key={job.id} className="flex items-center gap-2.5 bg-card border shadow-lg rounded-lg px-3.5 py-2.5 text-xs text-foreground">
              <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="truncate">
                {job.label} — <span className="text-muted-foreground">{job.pursuitName}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </ResponseJobsContext.Provider>
  );
}

export function useResponseJobs(): ResponseJobsApi {
  const api = useContext(ResponseJobsContext);
  if (!api) throw new Error("useResponseJobs must be used inside ResponseJobsProvider");
  return api;
}

export function useResponseJob(pursuitId: string) {
  const { start, running, results } = useResponseJobs();
  return { start, job: running[pursuitId], result: results[pursuitId] };
}
