"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  GAP_TYPE_LABELS,
  sortGapLogRows,
  type GapLogRow,
  type GapLogSortKey,
} from "@/lib/gap-log";

const SORT_OPTIONS: { key: GapLogSortKey; label: string }[] = [
  { key: "owner_group", label: "By owner" },
  { key: "id", label: "ID" },
  { key: "owner", label: "Owner" },
  { key: "priority", label: "Priority" },
  { key: "due", label: "Due" },
  { key: "status", label: "Status" },
];

function PriorityBadge({ priority }: { priority: GapLogRow["priority"] }) {
  return (
    <span className={cn(
      "inline-flex text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap",
      priority === "High" ? "oe-status-nogo" : priority === "Medium" ? "oe-status-cond" : "oe-status-pending",
    )}>{priority}</span>
  );
}

function StatusBadge({ status }: { status: GapLogRow["status"] }) {
  return (
    <span className={cn(
      "inline-flex text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap",
      status === "Resolved" ? "oe-status-go" : status === "In progress" ? "oe-status-trace" : "oe-status-cond",
    )}>{status}</span>
  );
}

function Details({ row }: { row: GapLogRow }) {
  const meta = [row.location, GAP_TYPE_LABELS[row.type] ?? row.type].filter(Boolean).join(" · ");
  return (
    <>
      <div className="text-foreground">{row.description}</div>
      {meta && <div className="text-[11px] text-muted-foreground mt-0.5">{meta}</div>}
      {row.status === "Resolved" && (row.resolution || row.documentName) && (
        <div className="text-[11px] text-go mt-1 line-clamp-2">
          Response: {row.resolution || `File ${row.documentName}`}
        </div>
      )}
    </>
  );
}

export function GapLogActionItems({
  rows,
  onOpen,
  emptyText = "No gaps or action items yet.",
  className,
  primeOwner,
}: {
  rows: GapLogRow[];
  onOpen?: (id: string) => void;
  emptyText?: string;
  className?: string;
  /** Set for proposals: items are grouped by owner, the Prime Partner first, then by priority and due date. */
  primeOwner?: string;
}) {
  const grouped = primeOwner !== undefined;
  const sortOptions = grouped ? SORT_OPTIONS : SORT_OPTIONS.filter(option => option.key !== "owner_group");
  const [sortKey, setSortKey] = useState<GapLogSortKey>(grouped ? "owner_group" : "priority");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [hideResolved, setHideResolved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [expanded]);

  const visible = useMemo(
    () => sortGapLogRows(hideResolved ? rows.filter(row => row.status !== "Resolved") : rows, sortKey, direction, primeOwner),
    [rows, hideResolved, sortKey, direction, primeOwner],
  );
  const groupStart = (index: number) => sortKey === "owner_group" && (index === 0 || visible[index - 1]!.owner !== visible[index]!.owner);
  const groupCount = (owner: string) => visible.filter(row => row.owner === owner).length;
  const open = rows.filter(row => row.status !== "Resolved").length;
  const high = rows.filter(row => row.status !== "Resolved" && row.priority === "High").length;
  const resolved = rows.length - open;

  function sortBy(key: GapLogSortKey) {
    if (key === sortKey) setDirection(dir => (dir === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setDirection("asc"); }
  }

  const header = (
    <div className="px-4 sm:px-5 py-3.5 border-b border-border flex flex-wrap items-center gap-x-3 gap-y-2">
      <h3 className="oe-card-title mr-auto">Gap Log - Action Items</h3>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-cond whitespace-nowrap">
        {open} open · {high} high{resolved ? ` · ${resolved} resolved` : ""}
      </span>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        Sort
        <select
          value={sortKey}
          onChange={e => { setSortKey(e.target.value as GapLogSortKey); setDirection("asc"); }}
          className="oe-select text-[11px] w-24"
          aria-label="Sort gap log by"
        >
          {sortOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setDirection(dir => (dir === "asc" ? "desc" : "asc"))}
          className="px-2 py-1 rounded-md border border-input bg-card text-foreground cursor-pointer hover:bg-secondary"
          aria-label={direction === "asc" ? "Sorted ascending" : "Sorted descending"}
          title={direction === "asc" ? "Ascending" : "Descending"}
        >
          {direction === "asc" ? "↑" : "↓"}
        </button>
      </label>
      {resolved > 0 && (
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={hideResolved} onChange={e => setHideResolved(e.target.checked)} />
          Hide resolved
        </label>
      )}
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-input bg-card text-foreground cursor-pointer hover:bg-secondary"
      >
        {expanded ? "Exit full screen" : "Full screen"}
      </button>
    </div>
  );

  const body = visible.length === 0 ? (
    <p className="px-5 py-6 text-xs text-muted-foreground">{rows.length ? "All items are resolved." : emptyText}</p>
  ) : (
    <>
      {/* Small screens: one full-width card per item */}
      <ul className="md:hidden divide-y divide-border">
        {visible.map((row, index) => (
          <li key={row.id}>
            {groupStart(index) && (
              <div className="px-4 py-2 bg-muted/40 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                {row.owner} · {groupCount(row.owner)}
              </div>
            )}
            <button
              type="button"
              onClick={() => onOpen?.(row.id)}
              className="w-full text-left px-4 py-3 text-xs hover:bg-muted/30 cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="font-mono font-semibold text-foreground">{row.id}</span>
                <PriorityBadge priority={row.priority} />
                <StatusBadge status={row.status} />
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">{row.dueAt || "No due date"}</span>
              </div>
              <Details row={row} />
              <div className="text-[11px] text-muted-foreground mt-1">Owner: <span className="text-foreground">{row.owner}</span></div>
            </button>
          </li>
        ))}
      </ul>
      {/* Wider screens: a table that fills the available width and wraps text */}
      <table className="hidden md:table w-full text-xs table-auto">
        <thead>
          <tr className="oe-table-header">
            {([
              ["id", "ID", "w-[90px]"],
              [null, "Description", ""],
              ["owner", "Owner", "w-[18%]"],
              ["priority", "Priority", "w-[90px]"],
              ["due", "Due", "w-[110px]"],
              ["status", "Status", "w-[110px]"],
            ] as const).map(([key, label, width]) => (
              <th key={label} className={cn("text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5", width)}>
                {key ? (
                  <button
                    type="button"
                    onClick={() => sortBy(key)}
                    className={cn("inline-flex items-center gap-1 uppercase tracking-wider cursor-pointer hover:text-foreground", sortKey === key && "text-foreground")}
                    aria-sort={sortKey === key ? (direction === "asc" ? "ascending" : "descending") : "none"}
                  >
                    {label}
                    <span className="text-[9px]">{sortKey === key ? (direction === "asc" ? "▲" : "▼") : "↕"}</span>
                  </button>
                ) : label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, index) => [
            groupStart(index) && (
              <tr key={`group-${row.id}`} className="bg-muted/40 border-b border-border">
                <td colSpan={6} className="px-4 py-2 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                  {row.owner} · {groupCount(row.owner)}
                </td>
              </tr>
            ),
            <tr
              key={row.id}
              className="oe-table-row border-b border-border last:border-b-0 cursor-pointer align-top"
              onClick={() => onOpen?.(row.id)}
            >
              <td className="px-4 py-3 font-mono text-foreground whitespace-nowrap">{row.id}</td>
              <td className="px-4 py-3 break-words"><Details row={row} /></td>
              <td className="px-4 py-3 text-muted-foreground break-words">{row.owner}</td>
              <td className="px-4 py-3"><PriorityBadge priority={row.priority} /></td>
              <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">{row.dueAt || "—"}</td>
              <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
            </tr>,
          ])}
        </tbody>
      </table>
    </>
  );

  if (expanded) {
    return (
      <>
        <div className={cn("bg-card rounded-xl border shadow-sm px-5 py-3 text-xs text-muted-foreground", className)}>
          Gap Log - Action Items is open in full screen.
        </div>
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto" role="dialog" aria-modal="true" aria-label="Gap Log - Action Items">
          <div className="bg-card min-h-full">
            {header}
            {body}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className={cn("bg-card rounded-xl border shadow-sm overflow-hidden w-full", className)}>
      {header}
      {body}
    </div>
  );
}
