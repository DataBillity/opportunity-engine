/**
 * Entity Resolution — §2.5
 * Stage 1: Blocking (cheap candidate generation)
 * Stage 2: Pairwise scoring (pure function, unit-tested)
 * Stage 3: Bands (auto-merge ≥ 0.92, review 0.70–0.92, distinct < 0.70)
 * Stage 4: Non-destructive merge with un-merge support
 */

export interface EntityCandidate {
  id: string;
  normalizedDomain: string | null;
  registryId: string | null;
  registryAuthority: string | null;
  legalName: string;
  country: string | null;
  region: string | null;
  address: string | null;
}

export interface PairwiseScore {
  score: number;
  features: {
    registryIdMatch: number;
    normalizedDomainMatch: number;
    legalNameSimilarity: number;
    countryRegionAgreement: number;
    addressAgreement: number;
  };
  band: "auto_merge" | "review" | "distinct";
}

const WEIGHTS = {
  registryIdMatch: 0.45,
  normalizedDomainMatch: 0.30,
  legalNameSimilarity: 0.15,
  countryRegionAgreement: 0.05,
  addressAgreement: 0.05,
} as const;

const THRESHOLDS = {
  autoMerge: 0.92,
  review: 0.70,
} as const;

export function computePairwiseScore(a: EntityCandidate, b: EntityCandidate): PairwiseScore {
  const features = {
    registryIdMatch: a.registryId && b.registryId && a.registryAuthority === b.registryAuthority
      ? (a.registryId === b.registryId ? 1.0 : 0.0)
      : 0.0,
    normalizedDomainMatch: a.normalizedDomain && b.normalizedDomain
      ? (a.normalizedDomain === b.normalizedDomain ? 1.0 : 0.0)
      : 0.0,
    legalNameSimilarity: jaroWinkler(normalizeLegalName(a.legalName), normalizeLegalName(b.legalName)),
    countryRegionAgreement: (a.country === b.country ? 0.6 : 0) + (a.region === b.region ? 0.4 : 0),
    addressAgreement: a.address && b.address ? (a.address === b.address ? 1.0 : 0.0) : 0.0,
  };

  const score =
    features.registryIdMatch * WEIGHTS.registryIdMatch +
    features.normalizedDomainMatch * WEIGHTS.normalizedDomainMatch +
    features.legalNameSimilarity * WEIGHTS.legalNameSimilarity +
    features.countryRegionAgreement * WEIGHTS.countryRegionAgreement +
    features.addressAgreement * WEIGHTS.addressAgreement;

  const band =
    score >= THRESHOLDS.autoMerge ? "auto_merge" :
    score >= THRESHOLDS.review ? "review" : "distinct";

  return { score, features, band };
}

function normalizeLegalName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|sa|gmbh|co|company|incorporated|limited|corporation)\b\.?/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

  let commonPrefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) commonPrefix++;
    else break;
  }

  return jaro + commonPrefix * 0.1 * (1 - jaro);
}

export { THRESHOLDS as ENTITY_RESOLUTION_THRESHOLDS };
