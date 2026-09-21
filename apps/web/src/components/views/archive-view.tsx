"use client";

import type { Organization, Partner, Pursuit } from "@/lib/mock-data";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

function getOrgPursuits(org: Organization, allPursuits: Record<string, Pursuit>): Pursuit[] {
  return org.pursuits.map(pid => allPursuits[pid]).filter(Boolean) as Pursuit[];
}

function TeamingBadge({ value }: { value: boolean | null }) {
  if (value === true) {
    return <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-go">Signed</span>;
  }
  if (value === false) {
    return <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-cond">Pending</span>;
  }
  return <span className="text-muted-foreground">N/A</span>;
}

export function ArchiveView({
  orgs,
  partners,
  allPursuits,
  onOrgSelect,
  onReinstateOrg,
  onReinstatePartner,
}: {
  orgs: Organization[];
  partners: Partner[];
  allPursuits: Record<string, Pursuit>;
  onOrgSelect: (id: string) => void;
  onReinstateOrg: (orgId: string) => void;
  onReinstatePartner: (partnerId: string) => void;
}) {
  const { toast } = useToast();
  const archivedLeads = orgs.filter(org => org.archived);
  const archivedPartners = partners.filter(partner => partner.status === "Archived");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="oe-page-title">Archive</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Archived leads and partners keep their full history. Reinstate to return them to the active pipeline or partner directory.
        </p>
      </div>

      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-border">
          <h3 className="oe-card-title">Archived Leads</h3>
          <span className="text-xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{archivedLeads.length}</span> archived
          </span>
        </div>
        {archivedLeads.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No archived leads.</div>
        ) : (
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Organization</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Industry</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Channel</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Projects</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Score</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedLeads.map(org => {
                  const pursuits = getOrgPursuits(org, allPursuits);
                  return (
                    <tr key={org.id} className="oe-table-row border-b border-border last:border-b-0">
                      <td className="px-4 py-3 font-semibold text-foreground">{org.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{org.industry || "—"}</td>
                      <td className="px-4 py-3 text-foreground">{org.channel}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{pursuits.length}</td>
                      <td className="px-4 py-3 font-mono font-bold text-foreground">{org.score}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => onOrgSelect(org.id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
                          >
                            View history
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onReinstateOrg(org.id);
                              toast(`"${org.name}" reinstated with full history`, "success");
                            }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm"
                          >
                            Reinstate
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-border">
          <h3 className="oe-card-title">Archived Partners</h3>
          <span className="text-xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{archivedPartners.length}</span> archived
          </span>
        </div>
        {archivedPartners.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No archived partners.</div>
        ) : (
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Partner</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Type</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Contact</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Teaming Agreement</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedPartners.map(partner => (
                  <tr key={partner.id} className="oe-table-row border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-semibold text-foreground">{partner.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{partner.type}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{partner.contact || "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      <TeamingBadge value={partner.teamingAgreementSigned} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          onReinstatePartner(partner.id);
                          toast(`"${partner.name}" reinstated with full history`, "success");
                        }}
                        className={cn(
                          "text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm"
                        )}
                      >
                        Reinstate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
