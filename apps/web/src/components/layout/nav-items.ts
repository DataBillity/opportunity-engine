import type { ViewId } from "@/app/page";

export const navItems: { id: ViewId; label: string; shortLabel: string; group: number }[] = [
  { id: "search", label: "Search & Discovery", shortLabel: "Search", group: 1 },
  { id: "pipeline", label: "Pipeline", shortLabel: "Pipeline", group: 1 },
  { id: "decision", label: "Opportunity", shortLabel: "Opportunity", group: 2 },
  { id: "draft", label: "Response Builder", shortLabel: "Response", group: 2 },
  { id: "sources", label: "Capability Sources", shortLabel: "Sources", group: 3 },
];
