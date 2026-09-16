import type { ViewId } from "@/app/page";

export const navItems: { id: ViewId; label: string; shortLabel: string; group: number; requiresPursuit?: boolean }[] = [
  { id: "search", label: "Search & Discovery", shortLabel: "Search", group: 1 },
  { id: "pipeline", label: "Pipeline", shortLabel: "Pipeline", group: 1 },
  { id: "decision", label: "Opportunity", shortLabel: "Opportunity", group: 2, requiresPursuit: true },
  { id: "draft", label: "Response Builder", shortLabel: "Response", group: 2, requiresPursuit: true },
  { id: "sources", label: "Capability Sources", shortLabel: "Sources", group: 3 },
  { id: "dashboard", label: "Dashboard", shortLabel: "Dashboard", group: 4 },
];
