/**
 * Copy demonstration data into one new organization's workspace.
 *
 *   TENANT_ID=northwind TENANT_NAME="Northwind" pnpm db:seed
 *
 * DataBillity, the platform owner, is not seeded. TENANT_ID=operator is that
 * same organization. An existing workspace is left unchanged.
 */
import { DATABILLITY_ORG_ID, resolveWorkspaceOrganizationId } from "@opportunity-engine/db";
import { provisionTenant } from "./shared-workspace-store";
import { describeTenantSeed } from "./tenant-seed";

const id = resolveWorkspaceOrganizationId(process.env.TENANT_ID);
const configuredName = (process.env.TENANT_NAME ?? "").trim();
const name = configuredName || id;

if (id === DATABILLITY_ORG_ID) {
  console.log("DataBillity is the platform owner organization. Demonstration data is not copied there.");
  console.log("New organizations receive it when they are created. Set TENANT_ID to seed a different organization.");
  process.exit(0);
}

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
