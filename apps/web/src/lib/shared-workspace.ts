import type { GraphData, Organization, Partner, Pursuit } from "@/lib/mock-data";

/** Leads, their opportunities, partners, and the graph those partners contribute to. */
export type WorkspaceState = {
  organizations: Organization[];
  pursuits: Record<string, Pursuit>;
  partners: Partner[];
  graph: GraphData;
};

export type SharedWorkspace = WorkspaceState & {
  revision: number;
};

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = normalize(source[key]);
    return sorted;
  }
  return value;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export function sameWorkspace(a: WorkspaceState, b: WorkspaceState): boolean {
  return sameValue(a, b);
}

function pick<T>(local: T | undefined, baseline: T | undefined, server: T | undefined): T | undefined {
  const localChanged = !sameValue(local, baseline);
  const serverChanged = !sameValue(server, baseline);
  if (local === undefined && server === undefined) return undefined;
  if (local !== undefined && server === undefined) {
    if (baseline === undefined) return local;
    return localChanged ? local : undefined;
  }
  if (local === undefined && server !== undefined) {
    if (baseline === undefined) return server;
    return serverChanged ? server : undefined;
  }
  if (serverChanged && !localChanged) return server;
  return local;
}

function mergeById<T extends { id: string }>(local: T[], baseline: T[], server: T[]): T[] {
  const baselineById = new Map(baseline.map(item => [item.id, item]));
  const serverById = new Map(server.map(item => [item.id, item]));
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const item of local) {
    seen.add(item.id);
    const chosen = pick(item, baselineById.get(item.id), serverById.get(item.id));
    if (chosen) merged.push(chosen);
  }
  for (const item of server) {
    if (seen.has(item.id)) continue;
    const chosen = pick(undefined, baselineById.get(item.id), item);
    if (chosen) merged.push(chosen);
  }
  return merged;
}

function mergeRecord<T>(
  local: Record<string, T>,
  baseline: Record<string, T>,
  server: Record<string, T>,
): Record<string, T> {
  const keys = new Set([...Object.keys(local), ...Object.keys(baseline), ...Object.keys(server)]);
  const merged: Record<string, T> = {};
  for (const key of keys) {
    const chosen = pick(local[key], baseline[key], server[key]);
    if (chosen !== undefined) merged[key] = chosen;
  }
  return merged;
}

/** Keep this operator's edits and fold in records another operator saved first. */
export function mergeWorkspace(local: WorkspaceState, baseline: WorkspaceState, server: WorkspaceState): WorkspaceState {
  return {
    organizations: mergeById(local.organizations, baseline.organizations, server.organizations),
    pursuits: mergeRecord(local.pursuits, baseline.pursuits, server.pursuits),
    partners: mergeById(local.partners, baseline.partners, server.partners),
    graph: {
      capabilities: mergeById(local.graph.capabilities, baseline.graph.capabilities, server.graph.capabilities),
      experience: mergeById(local.graph.experience, baseline.graph.experience, server.graph.experience),
      credentials: mergeById(local.graph.credentials, baseline.graph.credentials, server.graph.credentials),
      people: mergeById(local.graph.people, baseline.graph.people, server.graph.people),
    },
  };
}
