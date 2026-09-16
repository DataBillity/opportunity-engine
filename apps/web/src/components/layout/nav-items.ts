import type { ViewId } from "@/app/page";

export const navItems: { id: ViewId; label: string; shortLabel: string; group: number; requiresPursuit?: boolean }[] = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Dashboard", group: 1 },
  { id: "search", label: "Search & Discovery", shortLabel: "Search", group: 2 },
  { id: "pipeline", label: "Pipeline", shortLabel: "Pipeline", group: 2 },
  { id: "decision", label: "Opportunity", shortLabel: "Opportunity", group: 3, requiresPursuit: true },
  { id: "draft", label: "Response Builder", shortLabel: "Response", group: 3, requiresPursuit: true },
  { id: "sources", label: "Capability Sources", shortLabel: "Sources", group: 4 },
];
