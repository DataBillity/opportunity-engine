"use client";

import type { RfiResponseMeta } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

const GAP_LABELS: Record<string, string> = {
  missing_information: "Missing information",
  unverified_claim: "Unverified claim",
  capability_gap: "Capability gap",
  partner_input: "Partner input",
  decision_needed: "Decision needed",
  clarification: "Clarification for the issuer",
  compliance_risk: "Compliance risk",
};

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

function sortGaps(gaps: RfiResponseMeta["gaps"]) {
  return [...gaps].sort((a, b) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    || a.dueAt.localeCompare(b.dueAt)
    || a.id.localeCompare(b.id));
}

export function RfiResponsePackagePanel({
  packet,
  onOpenGap,
}: {
  packet: RfiResponseMeta;
  onOpenGap?: (gapId: string) => void;
}) {
  const gaps = sortGaps(packet.gaps);
  const high = gaps.filter(gap => gap.priority === "High" && gap.status !== "Resolved").length;
  const byOwner = new Map<string, typeof gaps>();
  for (const gap of gaps) {
    const list = byOwner.get(gap.owner) ?? [];
    list.push(gap);
    byOwner.set(gap.owner, list);
  }

  return (
    <div className="space-y-3">
      <div className="bg-card rounded-xl border shadow-sm px-5 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="oe-card-title">Reviewer summary</h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-cond">
            {gaps.filter(gap => gap.status !== "Resolved").length} open · {high} high
          </span>
        </div>
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{packet.reviewerSummary}</p>
        {packet.questions.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1.5">Suggested questions for the issuer</div>
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
                  {["Requirement", "RFI ref", "Response section", "Owner", "Status"].map(label => (
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

      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h3 className="oe-card-title">Gap log</h3>
        </div>
        <div className="overflow-x-auto oe-touch-scroll">
          <table className="w-full text-xs min-w-[880px]">
            <thead>
              <tr className="oe-table-header">
                {["ID", "Location", "Type", "Description", "Owner", "Priority", "Due", "Status"].map(label => (
                  <th key={label} className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gaps.map(gap => (
                <tr
                  key={gap.id}
                  className="oe-table-row border-b border-border last:border-b-0 cursor-pointer"
                  onClick={() => onOpenGap?.(gap.id)}
                >
                  <td className="px-4 py-3 font-mono text-foreground">{gap.id}</td>
                  <td className="px-4 py-3 text-muted-foreground">{gap.location}</td>
                  <td className="px-4 py-3 text-muted-foreground">{GAP_LABELS[gap.gapType] ?? gap.gapType}</td>
                  <td className="px-4 py-3 text-foreground">{gap.description}</td>
                  <td className="px-4 py-3 text-muted-foreground">{gap.owner}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md", gap.priority === "High" ? "oe-status-nogo" : gap.priority === "Medium" ? "oe-status-cond" : "oe-status-pending")}>{gap.priority}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{gap.dueAt || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md", gap.status === "Resolved" ? "oe-status-go" : "oe-status-cond")}>{gap.status}</span>
                  </td>
                </tr>
              ))}
              {gaps.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-muted-foreground">No open gaps yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {byOwner.size > 0 && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h3 className="oe-card-title">Action items by owner</h3>
          </div>
          <div className="divide-y divide-border">
            {[...byOwner.entries()].map(([owner, items]) => (
              <div key={owner} className="px-5 py-3">
                <div className="text-xs font-semibold text-foreground mb-1.5">{owner}</div>
                <ul className="space-y-1">
                  {items.map(item => (
                    <li key={item.id} className="text-xs text-muted-foreground">
                      <span className="font-mono text-foreground">{item.id}</span>
                      {" · "}
                      {item.priority}
                      {" · "}
                      {item.description}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
