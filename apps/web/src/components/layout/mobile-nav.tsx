"use client";

import { useEffect, useRef } from "react";
import type { ViewId } from "@/app/page";
import type { Organization, Pursuit } from "@/lib/mock-data";
import { Sidebar } from "@/components/layout/sidebar";
import { navItems } from "@/components/layout/nav-items";
import { BrandMark } from "@/components/brand-mark";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { cn } from "@/lib/cn";

export function MobileNav({
  open,
  onClose,
  activeView,
  onNav,
  currentOrgId,
  laneFilter,
  onLaneFilter,
  onOrgSelect,
  orgs,
  allPursuits,
}: {
  open: boolean;
  onClose: () => void;
  activeView: ViewId;
  onNav: (v: ViewId) => void;
  currentOrgId: string;
  laneFilter: string;
  onLaneFilter: (l: string) => void;
  onOrgSelect: (id: string) => void;
  orgs: Organization[];
  allPursuits: Record<string, Pursuit>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    document.body.classList.add("oe-nav-locked");

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("oe-nav-locked");
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    function onChange() {
      if (mq.matches) onClose();
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" id="mobile-nav" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <div
        className="absolute inset-0 bg-[var(--billity-navy)]/50 backdrop-blur-[3px] animate-backdrop-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className="relative flex h-full w-[min(20.5rem,88vw)] max-w-full flex-col bg-card shadow-2xl animate-drawer-in oe-touch-scroll"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between gap-3 px-4 h-14 shrink-0 bg-[var(--billity-navy)] text-white">
          <BrandMark height={24} className="min-w-0" />
          <button
            ref={closeRef}
            onClick={onClose}
            className="w-10 h-10 -mr-1 rounded-md flex items-center justify-center text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            aria-label="Close menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="px-3 py-3 border-b border-border shrink-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-2 mb-2">
            Navigate
          </div>
          <div className="flex flex-col gap-0.5">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => onNav(item.id)}
                className={cn(
                  "flex items-center justify-between w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer min-h-11",
                  activeView === item.id
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-foreground hover:bg-muted/50"
                )}
              >
                {item.label}
                {activeView === item.id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--billity-bright)] shrink-0" />
                )}
              </button>
            ))}
          </div>
        </nav>

        <div className="flex-1 min-h-0 overflow-y-auto oe-touch-scroll">
          <Sidebar
            embedded
            currentOrgId={currentOrgId}
            laneFilter={laneFilter}
            onLaneFilter={onLaneFilter}
            onOrgSelect={onOrgSelect}
            orgs={orgs}
            allPursuits={allPursuits}
          />
        </div>

        <div className="shrink-0 border-t border-border p-3 space-y-1">
          <button
            type="button"
            onClick={() => onNav("settings")}
            className={cn(
              "w-full min-h-11 px-3 rounded-lg text-[13px] font-medium text-left cursor-pointer transition-all",
              activeView === "settings"
                ? "bg-accent text-accent-foreground font-semibold"
                : "text-foreground hover:bg-muted/50"
            )}
          >
            Settings
          </button>
          <SignOutButton
            idleLabel="Sign out"
            className="w-full min-h-11 px-3 rounded-lg text-[13px] font-semibold text-destructive hover:bg-[hsl(var(--status-nogo-soft))] text-left"
          />
        </div>
      </div>
    </div>
  );
}
