"use client";

import { useState, useRef, useEffect } from "react";
import type { ViewId } from "@/app/page";
import type { Organization, Pursuit } from "@/lib/mock-data";
import { Modal, FormField, TextInput, TextArea, SelectInput, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { navItems } from "@/components/layout/nav-items";
import { cn } from "@/lib/cn";

function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const items = [
    { label: "Profile Settings", icon: "👤", action: () => toast("Profile settings coming soon", "info") },
    { label: "Notification Preferences", icon: "🔔", action: () => toast("Notification preferences coming soon", "info") },
    { label: "Team Management", icon: "👥", action: () => toast("Team management coming soon", "info") },
    { label: "API & Integrations", icon: "🔗", action: () => toast("API settings coming soon", "info") },
    { label: "divider", icon: "", action: () => {} },
    { label: "Sign Out", icon: "🚪", action: () => toast("Sign out — not implemented in demo mode", "warning") },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-white/15 text-white flex items-center justify-center text-[12px] font-semibold ring-2 ring-white/10 cursor-pointer hover:ring-white/30 transition-all"
      >
        JT
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-56 max-w-[calc(100vw-1.5rem)] bg-card rounded-xl border shadow-xl z-50 py-1.5 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <div className="text-xs font-semibold text-foreground">J. Tran</div>
            <div className="text-[11px] text-muted-foreground">Bid Manager · DEMO POV</div>
          </div>
          {items.map((item, i) =>
            item.label === "divider" ? (
              <div key={i} className="border-t border-border my-1" />
            ) : (
              <button
                key={item.label}
                onClick={() => { item.action(); setOpen(false); }}
                className="w-full text-left px-4 py-2 text-xs text-foreground hover:bg-muted/40 cursor-pointer transition-all flex items-center gap-2.5"
              >
                <span className="text-sm">{item.icon}</span>
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

const LEAD_CHANNELS = [
  { value: "Direct inquiry", label: "Direct inquiry" },
  { value: "Outbound", label: "Outbound" },
  { value: "Inbound", label: "Inbound" },
  { value: "Partner", label: "Partner" },
  { value: "Referral", label: "Referral" },
  { value: "Event", label: "Event" },
];

export function TopBar({
  activeView,
  onNav,
  orgs,
  onAddPursuit,
  onAddOrg,
  menuOpen,
  onMenuToggle,
}: {
  activeView: ViewId;
  onNav: (v: ViewId) => void;
  orgs: Organization[];
  onAddPursuit: (pursuit: Pursuit) => void;
  onAddOrg: (org: Organization) => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
}) {
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const [showNewPursuit, setShowNewPursuit] = useState(false);
  const [showNewLead, setShowNewLead] = useState(false);
  const [npOrg, setNpOrg] = useState(orgs[0]?.id ?? "");
  const [npName, setNpName] = useState("");
  const [npType, setNpType] = useState<"B" | "C">("B");
  const [npRef, setNpRef] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadIndustry, setLeadIndustry] = useState("");
  const [leadChannel, setLeadChannel] = useState("Direct inquiry");
  const [leadContact, setLeadContact] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadSummary, setLeadSummary] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (!newMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) setNewMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setNewMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [newMenuOpen]);

  function handleCreatePursuit() {
    if (!npName.trim()) return;
    const id = `OPP-${Date.now().toString().slice(-4)}`;
    const pursuit: Pursuit = {
      id,
      orgId: npOrg,
      name: npName.trim(),
      typeLabel: npType === "B" ? "Government RFP" : "Private SOW",
      solicitationRef: npRef.trim() || (npType === "B" ? `RFP-${id.slice(-4)}` : "Direct SOW"),
      lane: npType,
      score: 50,
      status: "New — awaiting triage",
      rec: "pending",
      confidence: 0,
      closed: false,
      dueDate: null,
      documents: [],
      docSummary: { objective: [], services: [], deliverables: [] },
      rationale: ["Awaiting initial triage and scoring."],
      reqmap: [],
      gaps: [],
      rfund: { lane: npType, tier: "pending", score: 0, note: "Not yet assessed." },
      decisionRecord: {
        id: `DEC-${Date.now().toString().slice(-5)}`,
        type: "D4 — Go/No-Go triage",
        subject: `Pursuit ${id}`,
        model: "triage-v3 / prompt v1.9 / graph v213",
        reviewer: "— not yet assigned",
        action: "Awaiting triage",
        retention: "3 years minimum",
      },
    };
    onAddPursuit(pursuit);
    toast(`Created pursuit "${npName.trim()}" (${id})`, "success");
    setShowNewPursuit(false);
    setNpName("");
    setNpRef("");
  }

  function handleCreateLead() {
    if (!leadName.trim()) return;
    const id = `ORG-${Date.now().toString().slice(-4)}`;
    const org: Organization = {
      id,
      name: leadName.trim(),
      industry: leadIndustry.trim(),
      channel: leadChannel,
      score: 50,
      domain: "",
      registryId: "",
      summary: leadSummary.trim(),
      contacts: leadContact.trim()
        ? [{ name: leadContact.trim(), title: "", email: leadEmail.trim() }]
        : [],
      whyGoodFit: "",
      scoreFactors: [],
      scoreHistory: [{
        score: 50,
        at: new Date().toISOString().slice(0, 10),
        reason: "Added as a sales lead.",
      }],
      notes: [],
      pursuits: [],
    };
    onAddOrg(org);
    toast(`Added sales lead "${leadName.trim()}" to the pipeline`, "success");
    setShowNewLead(false);
    setLeadName("");
    setLeadIndustry("");
    setLeadChannel("Direct inquiry");
    setLeadContact("");
    setLeadEmail("");
    setLeadSummary("");
    onNav("pipeline");
  }

  return (
    <>
      <header className="flex items-center gap-2 sm:gap-3 md:gap-4 lg:gap-6 px-3 sm:px-4 lg:px-5 h-14 shrink-0 bg-[var(--billity-navy)] text-white shadow-md">
        <button
          type="button"
          onClick={onMenuToggle}
          className="lg:hidden w-10 h-10 -ml-1 rounded-md flex flex-col items-center justify-center gap-[5px] cursor-pointer hover:bg-white/10 transition-colors touch-manipulation"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
        >
          <span className={cn("block h-[1.75px] w-[18px] bg-white rounded-full transition-transform duration-200 origin-center", menuOpen && "translate-y-[6.75px] rotate-45")} />
          <span className={cn("block h-[1.75px] w-[18px] bg-white rounded-full transition-opacity duration-200", menuOpen && "opacity-0")} />
          <span className={cn("block h-[1.75px] w-[18px] bg-white rounded-full transition-transform duration-200 origin-center", menuOpen && "-translate-y-[6.75px] -rotate-45")} />
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[var(--billity-bright)] flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <span className="font-bold tracking-tight text-[14px] sm:text-[15px] truncate">
            <span className="xs:hidden">OE</span>
            <span className="hidden xs:inline">Opportunity Engine</span>
          </span>
        </div>

        {/* Navigation */}
        <nav className="hidden lg:flex items-center gap-1 flex-1 min-w-0 overflow-x-auto oe-touch-scroll">
          {navItems.map((item, i) => (
            <span key={item.id} className="contents">
              {i > 0 && navItems[i - 1]!.group !== item.group && (
                <span className="w-px h-5 bg-white/15 mx-1.5 shrink-0" />
              )}
              <button
                onClick={() => onNav(item.id)}
                className={cn(
                  "relative px-2.5 xl:px-3 py-1.5 rounded-md text-[12px] xl:text-[13px] font-medium transition-all cursor-pointer whitespace-nowrap",
                  "hover:bg-white/10 hover:text-white",
                  activeView === item.id
                    ? "bg-white/[0.12] text-white font-semibold shadow-sm"
                    : "text-white/70"
                )}
              >
                <span className="xl:hidden">{item.shortLabel}</span>
                <span className="hidden xl:inline">{item.label}</span>
                {activeView === item.id && (
                  <span className="absolute bottom-0 left-2.5 right-2.5 xl:left-3 xl:right-3 h-[2px] rounded-full bg-[var(--billity-bright)]" />
                )}
              </button>
            </span>
          ))}
        </nav>

        <div className="flex-1 lg:hidden" />

        {/* Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 shrink-0">
          <div className="relative" ref={newMenuRef}>
            <button
              type="button"
              onClick={() => setNewMenuOpen(open => !open)}
              aria-haspopup="menu"
              aria-expanded={newMenuOpen}
              className="inline-flex items-center gap-1.5 bg-[var(--billity-bright)] text-[var(--billity-navy)] font-semibold text-xs px-2.5 sm:px-3.5 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--billity-sky)] shadow-sm min-h-9"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="hidden sm:inline">New</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="hidden sm:block opacity-80"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {newMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-11 w-52 max-w-[calc(100vw-1.5rem)] bg-card rounded-xl border shadow-xl z-50 py-1.5 overflow-hidden"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setNewMenuOpen(false);
                    setNpOrg(orgs[0]?.id ?? "");
                    setShowNewPursuit(true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-foreground hover:bg-muted/40 cursor-pointer transition-all"
                >
                  <div className="font-semibold">Pursuit</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">RFP or SOW against an account</div>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setNewMenuOpen(false);
                    setShowNewLead(true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-foreground hover:bg-muted/40 cursor-pointer transition-all"
                >
                  <div className="font-semibold">Sales Lead</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">New organization on the pipeline</div>
                </button>
              </div>
            )}
          </div>
          <span className="hidden lg:inline-flex font-mono text-[11px] text-white/50 border border-white/20 px-2.5 py-1 rounded-md">
            DEMO POV
          </span>
          <UserMenu />
        </div>
      </header>

      {/* New Pursuit Modal */}
      <Modal open={showNewPursuit} onClose={() => setShowNewPursuit(false)} title="Create Pursuit">
        <div className="space-y-4">
          <FormField label="Organization">
            <SelectInput
              value={npOrg}
              onChange={setNpOrg}
              options={orgs.map(o => ({ value: o.id, label: o.name }))}
            />
          </FormField>
          <FormField label="Pursuit name">
            <TextInput
              value={npName}
              onChange={setNpName}
              placeholder="e.g. Claims Platform Modernization"
            />
          </FormField>
          <FormField label="Type">
            <SelectInput
              value={npType}
              onChange={v => setNpType(v as "B" | "C")}
              options={[
                { value: "B", label: "Government RFP" },
                { value: "C", label: "Private SOW" },
              ]}
            />
          </FormField>
          <FormField label="Solicitation reference (optional)">
            <TextInput
              value={npRef}
              onChange={setNpRef}
              placeholder="e.g. RFP 24-118 or Direct SOW"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setShowNewPursuit(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleCreatePursuit} disabled={!npName.trim()}>
              Create Pursuit
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* New Sales Lead Modal */}
      <Modal open={showNewLead} onClose={() => setShowNewLead(false)} title="Create Sales Lead">
        <div className="space-y-4">
          <FormField label="Organization">
            <TextInput
              value={leadName}
              onChange={setLeadName}
              placeholder="e.g. Westshore Municipal Utility"
            />
          </FormField>
          <FormField label="Industry">
            <TextInput
              value={leadIndustry}
              onChange={setLeadIndustry}
              placeholder="e.g. Utilities"
            />
          </FormField>
          <FormField label="Channel">
            <SelectInput
              value={leadChannel}
              onChange={setLeadChannel}
              options={LEAD_CHANNELS}
            />
          </FormField>
          <FormField label="Contact name (optional)">
            <TextInput
              value={leadContact}
              onChange={setLeadContact}
              placeholder="e.g. Jordan Hale"
            />
          </FormField>
          <FormField label="Contact email (optional)">
            <TextInput
              value={leadEmail}
              onChange={setLeadEmail}
              placeholder="e.g. jhale@example.gov"
              type="email"
            />
          </FormField>
          <FormField label="Notes (optional)">
            <TextArea
              value={leadSummary}
              onChange={setLeadSummary}
              placeholder="Why this account, and what they need"
              rows={3}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setShowNewLead(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleCreateLead} disabled={!leadName.trim()}>
              Create Lead
            </PrimaryButton>
          </div>
        </div>
      </Modal>
    </>
  );
}
