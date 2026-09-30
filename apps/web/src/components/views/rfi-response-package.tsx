"use client";

import type { RfiResponseMeta } from "@/lib/mock-data";
import type { GapLogRow } from "@/lib/gap-log";
import { cn } from "@/lib/cn";

export function RfiResponsePackagePanel({
  packet,
  logRows,
  projectType = "rfi",
}: {
  packet: RfiResponseMeta;
  /** Gap Log - Action Items rows, for the open counts in the summary header. */
  logRows: GapLogRow[];
  projectType?: "rfi" | "rfp" | "sow";
}) {
  const open = logRows.filter(row => row.status !== "Resolved");
  const high = open.filter(row => row.priority === "High").length;

  return (
    <div className="space-y-3">
      <div className="bg-card rounded-xl border shadow-sm px-5 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="oe-card-title">Reviewer summary</h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-cond">
            {open.length} open · {high} high
          </span>
        </div>
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{packet.reviewerSummary}</p>
        {packet.questions.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1.5">Suggested questions for the {projectType === "sow" ? "client" : "issuer"}</div>
            <ul className="list-disc pl-4 text-sm text-foreground space-y-1">
              {packet.questions.map(question => <li key={question}>{question}</li>)}
            </ul>
          </div>
        )}
        {packet.strategicNotes.trim() && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1.5">Strategic notes</div>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{packet.strategicNotes}</p>
          </div>
        )}
      </div>

      {packet.compliance.length > 0 && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Compliance matrix</h3>
          </div>
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="oe-table-header">
                  {["Requirement", projectType === "rfi" ? "RFI ref" : projectType === "sow" ? "SOW ref" : "Solicitation ref", "Response section", "Owner", "Status"].map(label => (
                    <th key={label} className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {packet.compliance.map(row => (
                  <tr key={`${row.rfiRef}-${row.requirement}`} className="oe-table-row border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-foreground">{row.requirement}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">{row.rfiRef}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.responseSection}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.owner}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md", row.status === "Addressed" ? "oe-status-go" : "oe-status-cond")}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
