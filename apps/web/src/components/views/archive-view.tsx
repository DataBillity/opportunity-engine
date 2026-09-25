"use client";

import { useState } from "react";
import type { GraphData, Organization, Partner, Pursuit } from "@/lib/mock-data";
import { Modal, SecondaryButton } from "@/components/ui/modal";
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
  graph,
  allPursuits,
  onOrgSelect,
  onReinstateOrg,
  onReinstatePartner,
}: {
  orgs: Organization[];
  partners: Partner[];
  graph: GraphData;
  allPursuits: Record<string, Pursuit>;
  onOrgSelect: (id: string) => void;
  onReinstateOrg: (orgId: string) => void;
  onReinstatePartner: (partnerId: string) => void;
}) {
  const { toast } = useToast();
  const archivedLeads = orgs.filter(org => org.archived);
  const archivedPartners = partners.filter(partner => partner.status === "Archived");

  const [detailPartnerId, setDetailPartnerId] = useState<string | null>(null);
  const detailPartner = detailPartnerId ? partners.find(p => p.id === detailPartnerId) ?? null : null;

  const partnerName2 = (id: string) => partners.find(p => p.id === id)?.name ?? id;

  const partnerCapabilities = detailPartner
    ? graph.capabilities.filter(c => c.partners.includes(detailPartner.id))
    : [];
  const partnerExperience = detailPartner
    ? graph.experience.filter(e => e.partners.includes(detailPartner.id))
    : [];
  const partnerCredentials = detailPartner
    ? graph.credentials.filter(c => c.partner === detailPartner.id)
    : [];
  const partnerPeople = detailPartner
    ? graph.people.filter(p => p.partner === detailPartner.id)
    : [];

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
                  <tr
                    key={partner.id}
                    className="oe-table-row border-b border-border last:border-b-0 cursor-pointer"
                    onClick={() => setDetailPartnerId(partner.id)}
                  >
                    <td className="px-4 py-3 font-semibold text-foreground">{partner.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{partner.type}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{partner.contact || "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      <TeamingBadge value={partner.teamingAgreementSigned} />
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
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

      <Modal open={detailPartner !== null} onClose={() => setDetailPartnerId(null)} title={detailPartner?.name ?? "Archived Partner"} wide>
        {detailPartner && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-muted-foreground">Type:</span> <strong>{detailPartner.type}</strong></div>
              <div><span className="text-muted-foreground">Status:</span> <strong>{detailPartner.status}</strong></div>
              <div><span className="text-muted-foreground">Teaming agreement:</span> <strong>{detailPartner.teamingAgreementSigned === true ? "Signed" : detailPartner.teamingAgreementSigned === false ? "Pending" : "N/A"}</strong></div>
              <div><span className="text-muted-foreground">Website:</span> {detailPartner.website !== "—" ? <a href={detailPartner.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{detailPartner.website}</a> : "—"}</div>
              <div><span className="text-muted-foreground">Date added:</span> {detailPartner.createdAt || "—"}</div>
              <div><span className="text-muted-foreground">Contact:</span> {detailPartner.contact}</div>
              <div><span className="text-muted-foreground">Email:</span> {detailPartner.contactEmail || "—"}</div>
            </div>
            {(detailPartner.summary || detailPartner.note) && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Summary</h4>
                <p className="text-xs text-muted-foreground">{detailPartner.summary || detailPartner.note}</p>
              </div>
            )}

            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">Capabilities</h4>
              {partnerCapabilities.length === 0 && (
                <div className="text-xs text-muted-foreground italic">None</div>
              )}
              <div className="space-y-1">
                {partnerCapabilities.map(c => {
                  const others = c.partners.filter(id => id !== detailPartner.id).map(id => partnerName2(id));
                  return (
                    <div key={c.id} className="text-xs text-foreground rounded-md px-2 py-1.5 bg-muted/30">
                      <span className="font-mono text-primary">{c.id}</span> — <span className="font-semibold">{c.name}</span>
                      <span className="text-muted-foreground"> · updated {c.updated}{others.length ? ` · also ${others.join(", ")}` : ""}{c.status === "Archived" ? " · Archived" : ""}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">Experience</h4>
              {partnerExperience.length === 0 && (
                <div className="text-xs text-muted-foreground italic">None</div>
              )}
              <div className="space-y-1">
                {partnerExperience.map(e => (
                  <div key={e.id} className="text-xs text-foreground rounded-md px-2 py-1.5 bg-muted/30">
                    <span className="font-mono text-primary">{e.id}</span> — <span className="font-semibold">{e.name}</span>
                    <span className="text-muted-foreground"> · {e.industry || "No industry"} · updated {e.updated}{e.status === "Archived" ? " · Archived" : ""}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">Credentials</h4>
              {partnerCredentials.length === 0 && (
                <div className="text-xs text-muted-foreground italic">None</div>
              )}
              <div className="space-y-1">
                {partnerCredentials.map(c => (
                  <div key={c.id} className="text-xs text-foreground rounded-md px-2 py-1.5 bg-muted/30">
                    <span className="font-mono text-primary">{c.id}</span> — <span className="font-semibold">{c.name}</span>
                    <span className="text-muted-foreground"> · {c.credType}{c.expiration ? `, expires ${c.expiration}` : ""}{c.status === "Archived" ? " · Archived" : ""}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">People</h4>
              {partnerPeople.length === 0 && (
                <div className="text-xs text-muted-foreground italic">None</div>
              )}
              <div className="space-y-1">
                {partnerPeople.map(p => (
                  <div key={p.id} className="text-xs text-foreground rounded-md px-2 py-1.5 bg-muted/30">
                    <span className="font-mono text-primary">{p.id}</span> — <span className="font-semibold">{p.name}</span>
                    <span className="text-muted-foreground"> · {(p.roles ?? [p.role]).filter(Boolean).join(", ") || p.role}{p.status === "Archived" ? " · Archived" : ""}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  onReinstatePartner(detailPartner.id);
                  toast(`"${detailPartner.name}" reinstated with full history`, "success");
                  setDetailPartnerId(null);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm"
              >
                Reinstate
              </button>
              <SecondaryButton onClick={() => setDetailPartnerId(null)}>Close</SecondaryButton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
