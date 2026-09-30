import type { Partner, Pursuit, ResponseActionItem, RfiGapLogItem } from "@/lib/mock-data";
import { getPartner } from "@/lib/mock-data";

export type GapLogStatus = RfiGapLogItem["status"];
export type GapLogPriority = RfiGapLogItem["priority"];

/** One row of the Gap Log - Action Items list: a draft gap and the action item that closes it. */
export interface GapLogRow {
  id: string;
  location: string;
  type: string;
  description: string;
  owner: string;
  priority: GapLogPriority;
  dueAt: string;
  status: GapLogStatus;
  resolution: string;
  documentName?: string;
}

export const GAP_TYPE_LABELS: Record<string, string> = {
  missing_information: "Missing information",
  unverified_claim: "Unverified claim",
  capability_gap: "Capability gap",
  partner_input: "Partner input",
  decision_needed: "Decision needed",
  clarification: "Clarification for the issuer",
  compliance_risk: "Compliance risk",
};

export function isResolvedStatus(status: string | undefined): boolean {
  return /^(done|resolved|closed|complete)/i.test(status ?? "");
}

function asStatus(status: string | undefined): GapLogStatus {
  if (isResolvedStatus(status)) return "Resolved";
  return /progress/i.test(status ?? "") ? "In progress" : "Open";
}

function asPriority(value: string | undefined): GapLogPriority {
  return value === "High" || value === "Low" ? value : "Medium";
}

function actionOwner(item: ResponseActionItem, partners?: Partner[]): string {
  if (item.assignedPartnerId) {
    const name = getPartner(item.assignedPartnerId, partners)?.name ?? item.assignedPartnerId;
    return item.assignedInternal ? `${name} (${item.assignedInternal})` : name;
  }
  return item.assignedInternal ?? "Unassigned";
}

/** Draft gaps and response action items, merged by id so each open item appears once. */
export function gapLogRows(pursuit: Pick<Pursuit, "rfiResponse" | "responseActionItems">, partners?: Partner[]): GapLogRow[] {
  const actions = new Map((pursuit.responseActionItems ?? []).map(item => [item.id, item]));
  const rows: GapLogRow[] = [];
  const seen = new Set<string>();
  for (const gap of pursuit.rfiResponse?.gaps ?? []) {
    const action = actions.get(gap.id);
    const resolved = gap.status === "Resolved" || isResolvedStatus(action?.status);
    rows.push({
      id: gap.id,
      location: gap.location,
      type: gap.gapType,
      description: gap.description,
      owner: gap.owner,
      priority: gap.priority,
      dueAt: gap.dueAt,
      status: resolved ? "Resolved" : gap.status,
      resolution: action?.responseContent?.trim() || (resolved ? gap.notes : ""),
      documentName: action?.responseDocument?.name,
    });
    seen.add(gap.id);
  }
  for (const item of pursuit.responseActionItems ?? []) {
    if (seen.has(item.id)) continue;
    rows.push({
      id: item.id,
      location: item.relatedSection,
      type: item.kind,
      description: item.description,
      owner: actionOwner(item, partners),
      priority: asPriority(item.gates.find(gate => gate === "High" || gate === "Medium" || gate === "Low")),
      dueAt: item.dueAt,
      status: asStatus(item.status),
      resolution: item.responseContent?.trim() ?? "",
      documentName: item.responseDocument?.name,
    });
  }
  return rows;
}

export type GapLogSortKey = "id" | "owner" | "priority" | "due" | "status";

const PRIORITY_RANK: Record<GapLogPriority, number> = { High: 0, Medium: 1, Low: 2 };
const STATUS_RANK: Record<GapLogStatus, number> = { Open: 0, "In progress": 1, Resolved: 2 };

function idNumber(id: string): number {
  const n = Number(id.replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function sortGapLogRows(rows: GapLogRow[], key: GapLogSortKey, direction: "asc" | "desc"): GapLogRow[] {
  const sign = direction === "asc" ? 1 : -1;
  const byId = (a: GapLogRow, b: GapLogRow) => idNumber(a.id) - idNumber(b.id) || a.id.localeCompare(b.id);
  const compare: Record<GapLogSortKey, (a: GapLogRow, b: GapLogRow) => number> = {
    id: byId,
    owner: (a, b) => a.owner.localeCompare(b.owner, undefined, { sensitivity: "base" }),
    priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    // Undated items sort last in ascending order.
    due: (a, b) => (a.dueAt || "9999").localeCompare(b.dueAt || "9999"),
    status: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
  };
  return [...rows].sort((a, b) => sign * compare[key](a, b) || byId(a, b));
}

/** Action items for draft gaps, keeping answers and assignments already recorded under the same id. */
export function gapsToActionItems(
  gaps: RfiGapLogItem[],
  partners: Partner[] | undefined,
  existing: ResponseActionItem[] = [],
): ResponseActionItem[] {
  const prior = new Map(existing.map(item => [item.id, item]));
  return gaps.map(gap => {
    const named = gap.owner.replace(/^Partner:\s*/i, "").trim().toLowerCase();
    const partner = /^prime\b/i.test(gap.owner)
      ? undefined
      : partners?.find(item => item.name.toLowerCase() === named);
    const before = prior.get(gap.id);
    return {
      id: gap.id,
      kind: gap.gapType,
      description: gap.description,
      expectedResponseType: before?.expectedResponseType ?? gap.gapType,
      relatedSection: gap.location,
      assignedPartnerId: before?.assignedPartnerId ?? partner?.id ?? null,
      assignedInternal: before ? before.assignedInternal : partner ? null : gap.owner,
      dueAt: gap.dueAt,
      status: gap.status === "Resolved" ? "Done" : before && isResolvedStatus(before.status) ? before.status : gap.status,
      gates: [gap.priority],
      responseContent: before?.responseContent || gap.notes,
      responseDocument: before?.responseDocument ?? null,
    };
  });
}

/**
 * The Gap Log after a full regeneration: resolved items stay on record, the new draft's open
 * gaps replace the old open list, and in-progress items the draft dropped are kept for their owner.
 */
export function mergeRegeneratedGaps(
  prior: RfiGapLogItem[],
  incoming: RfiGapLogItem[],
  actionItems: ResponseActionItem[] = [],
): { gaps: RfiGapLogItem[]; carriedResolved: number; kept: number; dropped: number } {
  const actions = new Map(actionItems.map(item => [item.id, item]));
  const isResolved = (gap: RfiGapLogItem) => gap.status === "Resolved" || isResolvedStatus(actions.get(gap.id)?.status);
  const resolved = prior.filter(isResolved).map(gap => ({ ...gap, status: "Resolved" as const }));
  const resolvedIds = new Set(resolved.map(gap => gap.id));
  const fresh = incoming.filter(gap => !resolvedIds.has(gap.id));
  const freshIds = new Set(fresh.map(gap => gap.id));
  const kept = prior.filter(gap => !isResolved(gap) && !freshIds.has(gap.id) && gap.status === "In progress");
  const dropped = prior.filter(gap => !isResolved(gap) && !freshIds.has(gap.id) && gap.status !== "In progress").length;
  return {
    gaps: [...fresh, ...kept, ...resolved],
    carriedResolved: resolved.length,
    kept: kept.length,
    dropped,
  };
}

/** Saves an answer to one Gap Log - Action Items entry, keeping the action item and its draft gap in step. */
export function applyActionItemUpdate(
  pursuit: Pick<Pursuit, "rfiResponse" | "responseActionItems">,
  id: string,
  updates: Partial<ResponseActionItem>,
  partners?: Partner[],
): Partial<Pursuit> {
  const listed = pursuit.responseActionItems ?? [];
  const packet = pursuit.rfiResponse;
  const base = listed.some(item => item.id === id)
    ? listed
    : [...listed, ...gapsToActionItems((packet?.gaps ?? []).filter(gap => gap.id === id), partners, listed)];
  const responseActionItems = base.map(item => item.id === id ? { ...item, ...updates } : item);
  if (!packet) return { responseActionItems };
  const resolved = isResolvedStatus(updates.status);
  return {
    responseActionItems,
    rfiResponse: {
      ...packet,
      gaps: packet.gaps.map(gap => gap.id === id
        ? {
          ...gap,
          notes: updates.responseContent ?? gap.notes,
          status: resolved ? "Resolved" : updates.status && gap.status === "Resolved" ? "Open" : gap.status,
        }
        : gap),
    },
  };
}
