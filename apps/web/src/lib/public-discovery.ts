/**
 * No-cost public sources for Lane A (DISC-03, DISC-08, DISC-09, DISC-11).
 * Company websites and SEC EDGAR. Professional networks stay a manual CSV import.
 */
import type { DiscoveryField } from "@opportunity-engine/core";

const USER_AGENT = "OpportunityEngine/1.4 (bryan@databillity.com)";
const MAX_FILING_HITS = 6;
const MAX_TEXT = 8000;

export interface PublicCompanyRecord {
  name: string;
  domain: string;
  text: string;
  fields: DiscoveryField[];
  sources: string[];
}

export interface PublicSearchInput {
  company: string;
  domain: string;
  keyword: string;
  sources: { website: boolean; filings: boolean };
}

export async function discoverPublicCompanies(input: PublicSearchInput): Promise<{
  records: PublicCompanyRecord[];
  notes: string[];
}> {
  const notes: string[] = [];
  const capturedAt = new Date().toISOString();
  const records: PublicCompanyRecord[] = [];

  const domain = cleanDomain(input.domain);
  const company = input.company.trim();
  const keyword = input.keyword.trim();

  if (input.sources.website && domain) {
    const site = await readCompanySite(domain, capturedAt);
    if (site) {
      records.push({
        name: company || titleFromDomain(domain),
        domain,
        text: site.text,
        fields: site.fields,
        sources: ["Company website"],
      });
    } else {
      notes.push(`Company website for ${domain} did not return readable public text.`);
    }
  } else if (input.sources.website && !domain && company) {
    notes.push("Add a domain to read the company website. Name-only search uses SEC filings.");
  }

  if (input.sources.filings) {
    const query = [company && `"${company}"`, keyword].filter(Boolean).join(" ");
    if (!query) {
      notes.push("SEC search needs a company name or a signal keyword.");
    } else {
      try {
        const hits = await searchEdgar(query, capturedAt);
        if (!hits.length) notes.push("SEC EDGAR returned no matching 10-K, 10-Q, or 8-K filings for this search.");
        for (const hit of hits) {
          const existing = records.find((record) => sameIssuer(record.name, hit.name));
          if (existing) {
            existing.text = `${existing.text}\n${hit.text}`.slice(0, MAX_TEXT);
            existing.fields.push(...hit.fields);
            if (!existing.sources.includes("SEC filings")) existing.sources.push("SEC filings");
          } else if (!company || sameIssuer(company, hit.name) || !domain) {
            records.push({
              name: company && sameIssuer(company, hit.name) ? company : hit.name,
              domain: domain && (sameIssuer(company, hit.name) || !company) ? domain : "",
              text: hit.text,
              fields: hit.fields,
              sources: ["SEC filings"],
            });
          }
        }
      } catch (error) {
        notes.push(error instanceof Error ? error.message : "SEC EDGAR search failed.");
      }
    }
  }

  if (!records.length && company) {
    records.push({
      name: company,
      domain,
      text: "",
      fields: [],
      sources: [],
    });
    notes.push("No public source satisfied enrichment. The score uses only the name and industry you entered.");
  }

  const deduped = dedupeRecords(records).slice(0, MAX_FILING_HITS);
  return { records: deduped, notes };
}

function dedupeRecords(records: PublicCompanyRecord[]): PublicCompanyRecord[] {
  const kept: PublicCompanyRecord[] = [];
  for (const record of records) {
    const prior = kept.find((item) => sameIssuer(item.name, record.name) || (item.domain && item.domain === record.domain));
    if (!prior) {
      kept.push(record);
      continue;
    }
    prior.text = `${prior.text}\n${record.text}`.trim().slice(0, MAX_TEXT);
    prior.fields.push(...record.fields);
    for (const source of record.sources) {
      if (!prior.sources.includes(source)) prior.sources.push(source);
    }
    if (!prior.domain && record.domain) prior.domain = record.domain;
  }
  return kept;
}

async function readCompanySite(domain: string, capturedAt: string): Promise<{ text: string; fields: DiscoveryField[] } | null> {
  const pages = [`https://${domain}`, `https://${domain}/about`];
  const chunks: string[] = [];
  const fields: DiscoveryField[] = [];
  for (const page of pages) {
    const text = await fetchPublicText(page);
    if (!text) continue;
    chunks.push(text);
    if (!fields.length) {
      fields.push({
        field: "Overview",
        value: text.slice(0, 420),
        source: "Company website",
        sourceRef: page,
        capturedAt,
      });
    }
    if (chunks.join(" ").length > 2500) break;
  }
  const text = chunks.join("\n").slice(0, MAX_TEXT);
  return text ? { text, fields } : null;
}

async function searchEdgar(query: string, capturedAt: string): Promise<Array<{ name: string; text: string; fields: DiscoveryField[] }>> {
  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  const url = new URL("https://efts.sec.gov/LATEST/search-index");
  url.searchParams.set("q", query);
  url.searchParams.set("forms", "10-K,10-Q,8-K");
  url.searchParams.set("dateRange", "custom");
  url.searchParams.set("startdt", start.toISOString().slice(0, 10));
  url.searchParams.set("enddt", new Date().toISOString().slice(0, 10));

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`SEC EDGAR returned ${response.status}.`);
  const body = await response.json() as {
    hits?: { hits?: EdgarHit[] };
  };
  const hits = body.hits?.hits ?? [];
  const seen = new Set<string>();
  const records: Array<{ name: string; text: string; fields: DiscoveryField[] }> = [];
  for (const hit of hits) {
    const source = hit._source;
    if (!source) continue;
    const name = issuerName(source.display_names?.[0] ?? "");
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const location = source.biz_locations?.[0] ?? "";
    const form = source.form || "filing";
    const filed = source.file_date || "";
    const cik = (source.ciks?.[0] ?? "").replace(/^0+/, "");
    const file = (hit._id ?? "").split(":")[1] ?? "";
    const adsh = (source.adsh ?? "").replace(/-/g, "");
    const sourceRef = cik && adsh && file
      ? `https://www.sec.gov/Archives/edgar/data/${cik}/${adsh}/${file}`
      : `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(query)}`;
    const summary = `${name} filed a ${form}${filed ? ` on ${filed}` : ""}${location ? ` (${location})` : ""}.`;
    records.push({
      name,
      text: summary,
      fields: [
        {
          field: "Recent filing",
          value: summary,
          source: "SEC EDGAR",
          sourceRef,
          capturedAt,
        },
        ...(location
          ? [{ field: "Location", value: location, source: "SEC EDGAR", sourceRef, capturedAt }]
          : []),
      ],
    });
    if (records.length >= MAX_FILING_HITS) break;
  }
  return records;
}

async function fetchPublicText(raw: string, depth = 0): Promise<string> {
  if (depth > 2) return "";
  const url = assertPublicHttpsUrl(raw);
  const response = await fetch(url, {
    redirect: "manual",
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) return "";
    return fetchPublicText(new URL(location, url).toString(), depth + 1);
  }
  if (!response.ok) return "";
  const type = response.headers.get("content-type") ?? "";
  if (type && !/text|html|xml/i.test(type)) return "";
  const html = await response.text();
  return htmlToText(html);
}

function assertPublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Company website address is not a valid URL.");
  }
  if (url.protocol !== "https:") throw new Error("Company websites are read over HTTPS only.");
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (
    host === "localhost"
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host === "0.0.0.0"
    || isBlockedIp(host)
  ) {
    throw new Error("That address is not a public company website.");
  }
  return url;
}

function isBlockedIp(host: string): boolean {
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return host === "::1" || host.startsWith("[");
  const parts = ipv4.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

function issuerName(display: string): string {
  return display.replace(/\s+\([^)]*\)\s*$/g, "").replace(/\s+\([^)]*\)\s*$/g, "").trim();
}

function sameIssuer(a: string, b: string): boolean {
  const left = a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const right = b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function cleanDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] ?? "";
}

function titleFromDomain(domain: string): string {
  const label = domain.split(".")[0] ?? domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface EdgarHit {
  _id?: string;
  _source?: {
    display_names?: string[];
    form?: string;
    file_date?: string;
    biz_locations?: string[];
    ciks?: string[];
    adsh?: string;
  };
}
