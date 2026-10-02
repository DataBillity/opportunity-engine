import type { SolicitationPlayEvent } from "@opportunity-engine/core";
import type { Organization, Pursuit } from "@/lib/mock-data";

/** A submitted response, a win, or a loss updates the matched play. */
export function solicitationOutcomeFor(
  prev: Pursuit,
  updates: Partial<Pursuit>,
): SolicitationPlayEvent["outcome"] | null {
  if (updates.outcome === "Won") return "won";
  if (updates.outcome === "Lost") return "lost";
  if (updates.draftStatus === "Submitted" && prev.draftStatus !== "Submitted") return "submitted";
  return null;
}

export function solicitationEventFromPursuit(
  pursuit: Pursuit,
  org: Organization | undefined,
  outcome: SolicitationPlayEvent["outcome"],
  reason?: string,
): SolicitationPlayEvent {
  const type = pursuit.projectType === "rfi" ? "RFI" : pursuit.projectType === "sow" ? "SOW" : "RFP";
  return {
    solicitationId: pursuit.id,
    issuer: org?.name || "Unknown issuer",
    type,
    date: pursuit.outcomeDate || pursuit.draftStatusDate || new Date().toISOString().slice(0, 10),
    outcome,
    title: pursuit.name,
    objective: (pursuit.docSummary?.objective ?? []).join(" "),
    services: pursuit.docSummary?.services ?? [],
    challenges: pursuit.docSummary?.challenges ?? [],
    sector: org?.industry || undefined,
    reason,
  };
}
