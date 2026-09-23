"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Keep a typed date, or fold a valid US date into YYYY-MM-DD. */
export function normalizeDateEntry(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const iso = parseIsoDate(trimmed);
  if (iso) return toIsoDate(iso);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!us) return trimmed;
  const month = Number(us[1]);
  const day = Number(us[2]);
  const year = Number(us[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return trimmed;
  return toIsoDate(date);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthCells(view: Date): { date: Date; inMonth: boolean }[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, inMonth: date.getMonth() === view.getMonth() };
  });
}

export function DateField({
  value,
  onChange,
  placeholder = "YYYY-MM-DD",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const selected = parseIsoDate(value);
  const [view, setView] = useState(() => parseIsoDate(value) ?? new Date());

  useEffect(() => {
    if (open) return;
    const parsed = parseIsoDate(value);
    if (parsed) setView(parsed);
  }, [open, value]);

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    function place() {
      const anchor = rootRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = 280;
      const height = 328;
      let left = rect.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      let top = rect.bottom + 6;
      if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);
      setBox({ top, left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    setView(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  const today = new Date();
  const cells = monthCells(view);

  return (
    <div ref={rootRef} className="flex gap-2">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={event => {
          const next = event.target.value;
          onChange(next);
          const parsed = parseIsoDate(next);
          if (parsed) setView(parsed);
        }}
        onBlur={event => {
          const next = normalizeDateEntry(event.target.value);
          if (next !== event.target.value) onChange(next);
        }}
        className="oe-field"
        aria-label="Expiration date"
      />
      <button
        type="button"
        aria-label="Open calendar"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(current => !current)}
        className={cn(
          "shrink-0 w-9 self-stretch rounded-md border border-input bg-card text-foreground inline-flex items-center justify-center cursor-pointer transition-all hover:bg-secondary",
          open && "border-ring ring-ring/50 ring-[3px]"
        )}
      >
        <Calendar size={15} strokeWidth={1.75} />
      </button>
      {open && box && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose a date"
          style={{ top: box.top, left: box.left }}
          className="fixed z-[80] w-[280px] rounded-lg border border-border bg-card shadow-xl p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} className="w-7 h-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer">
              <ChevronLeft size={14} />
            </button>
            <div className="text-xs font-semibold text-foreground">
              {view.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </div>
            <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)} className="w-7 h-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer">
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map(day => (
              <div key={day} className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map(({ date, inMonth }) => {
              const isSelected = selected ? sameDay(date, selected) : false;
              const isToday = sameDay(date, today);
              return (
                <button
                  key={toIsoDate(date)}
                  type="button"
                  onClick={() => commit(toIsoDate(date))}
                  className={cn(
                    "h-8 rounded-md text-xs cursor-pointer transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold"
                      : inMonth
                        ? "text-foreground hover:bg-muted"
                        : "text-muted-foreground/50 hover:bg-muted",
                    isToday && !isSelected && "ring-1 ring-ring"
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 pt-2 border-t border-border">
            <button type="button" onClick={() => commit("")} className="text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer">
              Clear
            </button>
            <button type="button" onClick={() => commit(toIsoDate(today))} className="text-[11px] font-semibold text-primary cursor-pointer hover:underline">
              Today
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
