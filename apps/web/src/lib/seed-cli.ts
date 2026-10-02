/**
 * Copy demonstration data into one organization's workspace.
 *
 *   pnpm db:seed
 *   TENANT_ID=northwind TENANT_NAME="Northwind" pnpm db:seed
 *
 * The default organization is DataBillity. TENANT_ID=operator is the legacy
 * workspace id and is stored on that same organization, not a second row.
 * An existing workspace is left unchanged.
 */
import { DATABILLITY_ORG_ID, resolveWorkspaceOrganizationId } from "@opportunity-engine/db";
import { provisionTenant } from "./shared-workspace-store";
import { describeTenantSeed } from "./tenant-seed";

const id = resolveWorkspaceOrganizationId(process.env.TENANT_ID);
const configuredName = (process.env.TENANT_NAME ?? "").trim();
const name = configuredName || (id === DATABILLITY_ORG_ID ? "DataBillity" : id);

const result = await provisionTenant({ id, name });
if (!result) {
  console.error("DATABASE_URL is not set, so the organization was not seeded.");
  process.exit(1);
}

if (result.created) {
  console.log(`Seeded organization ${id} (${name}).`);
  for (const line of describeTenantSeed()) console.log(`  ${line}`);
} else {
  console.log(`Organization ${id} already has a workspace. Left existing records in place.`);
}
