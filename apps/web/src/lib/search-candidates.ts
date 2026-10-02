import type { Organization, SearchResult } from "@/lib/mock-data";

export type DiscoveryCandidate = SearchResult & {
  leadDraft?: Organization;
};

export type StoredSearchSession = {
  candidates: DiscoveryCandidate[];
  addedIds: string[];
};

/** Search candidates stay on this browser for this operator and organization. */
const STORAGE_PREFIX = "oe.search.candidates.";

function storageKey(organizationId: string, email: string): string {
  return `${STORAGE_PREFIX}${organizationId}.${email.trim().toLowerCase()}`;
}

export function loadSearchCandidates(organizationId: string, email: string): StoredSearchSession | null {
  if (typeof window === "undefined" || !organizationId.trim() || !email.trim()) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(organizationId, email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSearchSession;
    if (!parsed || !Array.isArray(parsed.candidates) || !Array.isArray(parsed.addedIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSearchCandidates(organizationId: string, email: string, session: StoredSearchSession): void {
  if (typeof window === "undefined" || !organizationId.trim() || !email.trim()) return;
  try {
    window.localStorage.setItem(storageKey(organizationId, email), JSON.stringify(session));
  } catch {
    /* quota / private mode — candidates still live in this session */
  }
}

export function clearSearchCandidates(organizationId: string, email: string): void {
  if (typeof window === "undefined" || !organizationId.trim() || !email.trim()) return;
  try {
    window.localStorage.removeItem(storageKey(organizationId, email));
  } catch {
    /* ignore */
  }
}
