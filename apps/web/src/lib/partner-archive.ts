import { isArchivedStatus, type GraphData, type Partner } from "@/lib/mock-data";

function restoreArchivedStatus(status: string): string {
  return isArchivedStatus(status) ? "Verified" : status;
}

function soleOwned(ids: string[], partnerId: string): boolean {
  return ids.length === 1 && ids[0] === partnerId;
}

export function applyPartnerArchive(graph: GraphData, partnerId: string): GraphData {
  return {
    capabilities: graph.capabilities.map(item => {
      if (!item.partners.includes(partnerId)) return item;
      return soleOwned(item.partners, partnerId) ? { ...item, status: "Archived" } : item;
    }),
    experience: graph.experience.map(item => {
      if (!item.partners.includes(partnerId)) return item;
      return soleOwned(item.partners, partnerId) ? { ...item, status: "Archived" } : item;
    }),
    credentials: graph.credentials.map(item =>
      item.partner === partnerId ? { ...item, status: "Archived" } : item
    ),
    people: graph.people.map(item =>
      item.partner === partnerId ? { ...item, status: "Archived" } : item
    ),
  };
}

export function applyPartnerReinstate(graph: GraphData, partnerId: string): GraphData {
  return {
    capabilities: graph.capabilities.map(item => {
      if (!item.partners.includes(partnerId) || !isArchivedStatus(item.status)) return item;
      return soleOwned(item.partners, partnerId) ? { ...item, status: restoreArchivedStatus(item.status) } : item;
    }),
    experience: graph.experience.map(item => {
      if (!item.partners.includes(partnerId) || !isArchivedStatus(item.status)) return item;
      return soleOwned(item.partners, partnerId) ? { ...item, status: restoreArchivedStatus(item.status) } : item;
    }),
    credentials: graph.credentials.map(item =>
      item.partner === partnerId && isArchivedStatus(item.status)
        ? { ...item, status: restoreArchivedStatus(item.status) }
        : item
    ),
    people: graph.people.map(item =>
      item.partner === partnerId && isArchivedStatus(item.status)
        ? { ...item, status: restoreArchivedStatus(item.status) }
        : item
    ),
  };
}

export function setPartnerArchived(partners: Partner[], partnerId: string, archived: boolean): Partner[] {
  return partners.map(partner =>
    partner.id === partnerId ? { ...partner, status: archived ? "Archived" : "Active" } : partner
  );
}
