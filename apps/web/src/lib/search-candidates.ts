import type { Organization, SearchResult } from "@/lib/mock-data";

export type DiscoveryCandidate = SearchResult & {
  leadDraft?: Organization;
};

export type StoredSearchSession = {
  candidates: DiscoveryCandidate[];
  addedIds: string[];
};

/** Search candidates stay on this browser for this operator. Partners and leads do not. */
const STORAGE_PREFIX = "oe.search.candidates.";

function storageKey(email: string): string {
  return `${STORAGE_PREFIX}${email.trim().toLowerCase()}`;
}

export function loadSearchCandidates(email: string): StoredSearchSession | null {
  if (typeof window === "undefined" || !email.trim()) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSearchSession;
    if (!parsed || !Array.isArray(parsed.candidates) || !Array.isArray(parsed.addedIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSearchCandidates(email: string, session: StoredSearchSession): void {
  if (typeof window === "undefined" || !email.trim()) return;
  try {
    window.localStorage.setItem(storageKey(email), JSON.stringify(session));
  } catch {
    /* quota / private mode — candidates still live in this session */
  }
}

export function clearSearchCandidates(email: string): void {
  if (typeof window === "undefined" || !email.trim()) return;
  try {
    window.localStorage.removeItem(storageKey(email));
  } catch {
    /* ignore */
  }
}
