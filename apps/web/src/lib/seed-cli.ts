/**
 * Provision a tenant with demonstration data for every core module.
 *
 *   TENANT_ID=northwind TENANT_NAME="Northwind" pnpm db:seed
 *
 * An existing workspace is left unchanged. Omit TENANT_ID to seed the
 * default DataBillity tenant ("operator").
 */
import { provisionTenant } from "./shared-workspace-store";
import { describeTenantSeed } from "./tenant-seed";

const id = (process.env.TENANT_ID ?? "operator").trim().toLowerCase() || "operator";
const name = (process.env.TENANT_NAME ?? "").trim() || (id === "operator" ? "DataBillity" : id);

const result = await provisionTenant({ id, name });
if (!result) {
  console.error("DATABASE_URL is not set, so the tenant was not seeded.");
  process.exit(1);
}

if (result.created) {
  console.log(`Seeded new tenant ${id} (${name}).`);
  for (const line of describeTenantSeed()) console.log(`  ${line}`);
} else {
  console.log(`Tenant ${id} already has a workspace. Left existing records in place.`);
}
