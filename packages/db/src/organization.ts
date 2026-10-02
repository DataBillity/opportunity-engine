/** Stable id for the original DataBillity workspace (`shared_workspace.id` was `operator`). */
export const DATABILLITY_ORG_ID = "databillity";

/** Workspace id used before organizations existed. */
export const LEGACY_WORKSPACE_ID = "operator";

/**
 * Workspace rows are keyed by organization id.
 * The pre-organization id `operator` is the DataBillity organization, not a second tenant.
 */
export function resolveWorkspaceOrganizationId(configured?: string | null): string {
  const id = (configured ?? "").trim().toLowerCase();
  if (!id || id === LEGACY_WORKSPACE_ID) return DATABILLITY_ORG_ID;
  return id;
}
