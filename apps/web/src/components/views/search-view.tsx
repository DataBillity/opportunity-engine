"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  ICP_VERTICALS,
  graphVersionOf,
  matchExistingAccount,
  scoreDiscoveredAccount,
  screenInboundLead,
  buildPlaysFromPartners,
  scoreFitAgainstPlays,
  type DiscoveryAssessment,
  type DiscoveryField,
  type Play,
  type FitScoreBreakdown,
} from "@opportunity-engine/core";
import type { GraphData, Organization, Partner } from "@/lib/mock-data";
import { Modal, FormField, TextArea, SelectInput, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { parseBulkLeads, LEAD_CHANNELS } from "@/lib/create-lead";
import { graphNodesFrom, organizationFromDiscovery } from "@/lib/discovery-score";
import { useToast } from "@/components/ui/toast";
import { useOperator } from "@/components/auth/operator-provider";
import {
  loadSearchCandidates,
  saveSearchCandidates,
  type DiscoveryCandidate,
} from "@/lib/search-candidates";
import {
  extractCsvHeaders,
  autoDetectMappings,
  parseLeadListCsv,
  csvRowCount,
  cleanOrgName,
  isNonOrganization,
  checkPartnerExclusion,
  RELATIONSHIP_LEVELS,
  LIST_SOURCE_TYPES,
  MAPPABLE_COLUMNS,
  type ColumnMapping,
  type ListSettings,
  type ListSourceType,
  type ImportedLead,
  type LeadStatus,
} from "@/lib/lead-import";
import type { RelationshipLevel } from "@opportunity-engine/core";
import { cn } from "@/lib/cn";

const SOURCE_OPTIONS = ["Company website", "SEC filings"] as const;

type ImportStep = "upload" | "map" | "review";

const STATUS_COLORS: Record<LeadStatus, string> = {
  Imported: "bg-slate-100 text-slate-700",
  Identified: "bg-blue-100 text-blue-700",
  Classified: "bg-amber-100 text-amber-700",
  Enriched: "bg-emerald-100 text-emerald-700",
  Reviewed: "bg-purple-100 text-purple-700",
};

export function SearchView({
  onAddOrg,
  graph,
  pipelineOrgs,
  partners,
  seededPlays,
  seededDiscovery,
}: {
  onAddOrg: (org: Organization) => void;
  graph: GraphData;
  pipelineOrgs: Organization[];
  partners?: Partner[];
  seededPlays?: Play[];
  seededDiscovery?: DiscoveryCandidate[];
  onAddOrgs?: (orgs: Organization[]) => void;
  onImportedLeads?: () => void;
}) {
  const { toast } = useToast();
  const { profile } = useOperator();
  const operatorEmail = profile?.email ?? "";

  /* ---- Search state ---- */
  const [industry, setIndustry] = useState("all");
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [keyword, setKeyword] = useState("");
  const [minScore, setMinScore] = useState("");
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set(SOURCE_OPTIONS));
  const [searching, setSearching] = useState(false);
  const [searchNotes, setSearchNotes] = useState<string[]>([]);
  const [results, setResults] = useState<DiscoveryCandidate[]>(() => seededDiscovery ?? []);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(() => (seededDiscovery?.length ?? 0) > 0);

  /* ---- Bulk import state ---- */
  const [bulkOpen, setBulkOpen] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>("upload");
  const [bulkText, setBulkText] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkDragOver, setBulkDragOver] = useState(false);
  const bulkFileRef = useRef<HTMLInputElement>(null);

  // Step 2: Column mapping + list settings
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [sourceType, setSourceType] = useState<ListSourceType>("event");
  const [sourceProvider, setSourceProvider] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventTheme, setEventTheme] = useState("");
  const [relLevel, setRelLevel] = useState<RelationshipLevel>("Network connection");
  const [relOwner, setRelOwner] = useState("");
  const [listContext, setListContext] = useState("");
  const [fitThreshold, setFitThreshold] = useState("60");
  const [enrichLimit, setEnrichLimit] = useState("25");

  // Step 3: Imported leads review
  const [importedLeads, setImportedLeads] = useState<ImportedLead[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [expandedLead, setExpandedLead] = useState<string | null>(null);

  /* ---- Plays ---- */
  const [plays, setPlays] = useState<Play[]>(() => seededPlays ?? []);

  /* ---- Inbound state ---- */
  const [inboundOpen, setInboundOpen] = useState(false);
  const [inboundName, setInboundName] = useState("");
  const [inboundEmail, setInboundEmail] = useState("");
  const [inboundContact, setInboundContact] = useState("");
  const [inboundChannel, setInboundChannel] = useState("Inbound");
  const [inboundSummary, setInboundSummary] = useState("");
  const [inboundFlags, setInboundFlags] = useState<string[]>([]);

  /* ---- Plays: use the tenant seed, otherwise build from Partner data ---- */
  useEffect(() => {
    if (seededPlays && seededPlays.length > 0) {
      setPlays(seededPlays);
      return;
    }
    const partnerList = partners ?? [];
    if (!graph.capabilities.length && !graph.experience.length) {
      setPlays([]);
      return;
    }
    setPlays(buildPlaysFromPartners({
      partners: partnerList.map(p => ({ id: p.id, name: p.name, type: p.type })),
      capabilities: graph.capabilities,
      experiences: graph.experience,
      credentials: graph.credentials,
      people: graph.people,
    }));
  }, [graph, partners, seededPlays]);

  const csvHeaders = useMemo(() => {
    if (!bulkText.trim()) return [];
    return extractCsvHeaders(bulkText);
  }, [bulkText]);

  const rowCount = useMemo(() => csvRowCount(bulkText), [bulkText]);

  const persistSession = useCallback((candidates: DiscoveryCandidate[], added: Set<string>) => {
    if (!operatorEmail) return;
    saveSearchCandidates(operatorEmail, {
      candidates,
      addedIds: Array.from(added),
    });
  }, [operatorEmail]);

  useEffect(() => {
    if (!operatorEmail) return;
    const stored = loadSearchCandidates(operatorEmail);
    if (stored) {
      setResults(stored.candidates);
      setAddedIds(new Set(stored.addedIds));
      setHasSearched(true);
      return;
    }
    if (seededDiscovery && seededDiscovery.length > 0) {
      setResults(seededDiscovery);
      setAddedIds(new Set());
      setHasSearched(true);
      return;
    }
    setResults([]);
    setAddedIds(new Set());
    setHasSearched(false);
  }, [operatorEmail, seededDiscovery]);

  function replaceCandidates(next: DiscoveryCandidate[]) {
    setResults(next);
    setAddedIds(new Set());
    setHasSearched(true);
    persistSession(next, new Set());
  }

  function toggleSource(s: string) {
    setActiveSources(prev => {
      const next = new Set(prev);
      if (next.has(s)) {
        if (next.size > 1) next.delete(s);
      } else {
        next.add(s);
      }
      return next;
    });
  }

  async function runDiscovery(input: { company: string; domain: string; keyword: string }) {
    const response = await fetch("/api/discovery/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: input.company,
        domain: input.domain,
        keyword: input.keyword,
        industry,
        minScore: minScore ? Number(minScore) : 0,
        website: activeSources.has("Company website"),
        filings: activeSources.has("SEC filings"),
        graph: graphNodesFrom(graph),
        accounts: pipelineOrgs.map(org => ({ id: org.id, name: org.name, domain: org.domain })),
      }),
    });
    const data = await response.json() as {
      error?: string;
      notes?: string[];
      candidates?: Array<DiscoveryCandidate & {
        fields?: DiscoveryField[];
        assessment?: DiscoveryAssessment;
      }>;
    };
    if (!response.ok) throw new Error(data.error || "Discovery search failed.");
    const next: DiscoveryCandidate[] = (data.candidates ?? []).map(candidate => {
      const assessment = candidate.assessment;
      const leadDraft = assessment
        ? organizationFromDiscovery({
          id: candidate.id,
          name: candidate.org,
          domain: candidate.domain,
          channel: assessment.channelLens === "channel" ? "Partner" : "Outbound",
          source: candidate.source,
          summary: candidate.signal,
          assessment,
          fields: candidate.fields,
        })
        : undefined;
      return { ...candidate, leadDraft };
    });
    return { next, notes: data.notes ?? [] };
  }

  async function handleRunSearch() {
    if (!company.trim() && !domain.trim() && !keyword.trim()) {
      toast("Enter a company, a domain, or a signal keyword.", "warning");
      return;
    }
    setSearching(true);
    try {
      const { next, notes } = await runDiscovery({ company, domain, keyword });
      setSearchNotes(notes);
      replaceCandidates(next);
      toast(`Search complete — ${next.length} candidate${next.length === 1 ? "" : "s"} found`, "info");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Discovery search failed.", "error");
    } finally {
      setSearching(false);
    }
  }

  async function handleRefresh(id: string) {
    const current = results.find(result => result.id === id);
    if (!current) return;
    setRefreshing(prev => new Set(prev).add(id));
    try {
      const { next } = await runDiscovery({
        company: current.org,
        domain: current.domain ?? "",
        keyword: "",
      });
      const refreshed = next[0];
      setResults(prev => {
        const updated = prev.map(result => result.id === id && refreshed
          ? { ...refreshed, id: result.id }
          : result);
        persistSession(updated, addedIds);
        return updated;
      });
      toast(refreshed ? "Enrichment refreshed from public sources" : "No public source returned new text", refreshed ? "success" : "warning");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Refresh failed.", "error");
    } finally {
      setRefreshing(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function handleAdd(r: DiscoveryCandidate) {
    if (r.existingAccountId) {
      toast(r.existingReason || `${r.org} is already in the pipeline`, "warning");
      return;
    }
    const newOrg: Organization = r.leadDraft ?? {
      id: `ORG-${Date.now().toString().slice(-4)}`,
      name: r.org,
      industry: r.industry,
      channel: "Discovery",
      score: r.score,
      domain: "",
      registryId: "",
      summary: r.signal,
      contacts: [],
      whyGoodFit: r.signal,
      scoreFactors: [r.signal],
      scoreHistory: [{ score: r.score, at: new Date().toISOString().slice(0, 10), reason: "Added from search & discovery." }],
      notes: [],
      pursuits: [],
    };
    onAddOrg(newOrg);
    setAddedIds(prev => {
      const next = new Set(prev).add(r.id);
      persistSession(results, next);
      return next;
    });
    toast(`${r.org} added to pipeline`, "success");
  }

  /* ---- Bulk import handlers ---- */

  function resetBulkForm() {
    setBulkOpen(false);
    setImportStep("upload");
    setBulkText("");
    setBulkFileName("");
    setColumnMappings([]);
    setSourceType("event");
    setSourceProvider("");
    setEventName("");
    setEventDate("");
    setEventLocation("");
    setEventTheme("");
    setRelLevel("Network connection");
    setRelOwner("");
    setListContext("");
    setFitThreshold("60");
    setEnrichLimit("25");
    setImportedLeads([]);
    setImportWarnings([]);
    setSelectedLeads(new Set());
    setExpandedLead(null);
  }

  async function readLeadFile(file: File) {
    const text = await file.text();
    setBulkFileName(file.name);
    setBulkText(text);
  }

  function handleStepToMap() {
    if (!bulkText.trim()) {
      toast("Upload or paste a lead list first.", "warning");
      return;
    }
    const headers = extractCsvHeaders(bulkText);
    if (headers.length === 0) {
      toast("Could not detect column headers.", "warning");
      return;
    }
    setColumnMappings(autoDetectMappings(headers));
    setImportStep("map");
  }

  function handleStepToReview() {
    const hasOrgCol = columnMappings.some(m => m.mappedTo === "organization");
    if (!hasOrgCol) {
      toast("Map at least one column to Organization name.", "warning");
      return;
    }

    const settings: ListSettings = {
      source: {
        type: sourceType,
        provider: sourceProvider,
        ...(sourceType === "event" && {
          eventName,
          eventDate,
          eventLocation,
          eventTheme,
        }),
      },
      relationshipLevel: relLevel,
      relationshipOwner: relOwner || operatorEmail,
      context: listContext,
    };

    const { leads, warnings } = parseLeadListCsv(bulkText, columnMappings, settings);

    // Run partner exclusion check
    const partnerList = (partners ?? []).map(p => ({ id: p.id, name: p.name, website: p.website }));
    const excludedPartnerNames: string[] = [];
    for (const lead of leads) {
      const check = checkPartnerExclusion(lead.cleanedName, partnerList);
      if (check.isPartner) {
        lead.action = "excluded";
        lead.identity = {
          canonicalName: lead.cleanedName,
          division: "",
          website: "",
          hqLocation: "",
          confidence: "High",
          needsConfirmation: false,
          notAnOrganization: false,
          duplicateOf: null,
          isPartner: true,
          isCustomer: false,
          excluded: true,
          excludedReason: `Partner organization: ${check.partnerName}`,
        };
        lead.identityConfidence = "High";
        excludedPartnerNames.push(lead.cleanedName);
      }
    }

    // Run existing pipeline duplicate check
    const pipeAccounts = pipelineOrgs.map(o => ({ id: o.id, name: o.name, domain: o.domain }));
    for (const lead of leads) {
      if (lead.action === "excluded") continue;
      const existing = matchExistingAccount({ name: lead.cleanedName }, pipeAccounts);
      if (existing) {
        lead.identity = {
          ...(lead.identity ?? {
            canonicalName: lead.cleanedName, division: "", website: "", hqLocation: "",
            confidence: "High" as const, needsConfirmation: false, notAnOrganization: false,
            duplicateOf: null, isPartner: false, isCustomer: false, excluded: false, excludedReason: "",
          }),
          duplicateOf: existing.id,
        };
        lead.identityConfidence = "High";
      }
    }

    // Run Fit scoring against plays for non-excluded leads
    for (const lead of leads) {
      if (lead.action === "excluded") continue;
      if (lead.identity?.duplicateOf) continue;

      const fitResult = scoreFitAgainstPlays({
        orgName: lead.cleanedName,
        orgType: lead.orgType ?? "organization",
        sector: lead.sector ?? "unknown",
        sizeBand: lead.sizeBand ?? "unknown",
        orgText: [lead.cleanedName, lead.notes, ...(lead.contacts.map(c => c.title))].filter(Boolean).join(" "),
        contactCount: lead.contacts.length,
        hasDecisionMaker: lead.contacts.some(c => c.roleLevel === "decision-maker" ||
          /chief|director|vp|vice president|head of|cio|cto|cdo/i.test(c.title)),
        hasInfluencer: lead.contacts.some(c => c.roleLevel === "influencer" ||
          /manager|architect|analyst|lead/i.test(c.title)),
        relationshipLevel: settings.relationshipLevel,
        plays,
      });

      lead.fitScore = fitResult;
      lead.bestPlayId = fitResult.bestPlayId ?? undefined;
      lead.bestPlayName = fitResult.bestPlayName ?? undefined;
      lead.status = "Classified";

      const threshold = Number(fitThreshold) || 60;
      if (fitResult.total >= threshold) {
        lead.action = "enrich";
      } else if (fitResult.total >= 40) {
        lead.action = "nurture";
      } else {
        lead.action = "park";
      }
    }

    if (excludedPartnerNames.length) {
      warnings.push(`Excluded ${excludedPartnerNames.length} Partner organization(s): ${excludedPartnerNames.join(", ")}`);
    }

    setImportedLeads(leads);
    setImportWarnings(warnings);
    setSelectedLeads(new Set(leads.filter(l => l.action === "enrich").map(l => l.id)));
    setImportStep("review");
  }

  function handleImportSelected() {
    const selected = importedLeads.filter(l => selectedLeads.has(l.id) && l.action !== "excluded");
    if (selected.length === 0) {
      toast("No leads selected for import.", "warning");
      return;
    }
    const stamp = Date.now();
    const next: DiscoveryCandidate[] = selected.map((lead, index) => ({
      id: `${lead.id}-import-${stamp}-${index}`,
      org: lead.cleanedName,
      industry: lead.sector ?? "",
      signal: lead.bestPlayName
        ? `Fit: ${lead.fitScore?.total ?? 0} — ${lead.bestPlayName}`
        : `Imported lead — ${lead.listSettings.source.type}`,
      source: lead.listSettings.source.provider || lead.listSettings.source.type,
      score: lead.fitScore?.total ?? 0,
      updated: "just now",
      domain: lead.identity?.website ?? "",
      factors: lead.fitScore
        ? Object.entries(lead.fitScore.reasons).map(([k, v]) => `${k}: ${v}`)
        : undefined,
      leadDraft: {
        id: `ORG-${stamp.toString().slice(-4)}-${index}`,
        name: lead.cleanedName,
        industry: lead.sector ?? "",
        channel: "Outbound",
        source: lead.listSettings.source.provider || lead.listSettings.source.type,
        score: lead.fitScore?.total ?? 0,
        domain: lead.identity?.website ?? "",
        registryId: "",
        summary: lead.bestPlayName
          ? `Play match: ${lead.bestPlayName}. Fit ${lead.fitScore?.total ?? 0}.`
          : "Imported lead — awaiting enrichment.",
        contacts: lead.contacts.map(c => ({
          name: c.name,
          title: c.title,
          email: c.email,
        })),
        whyGoodFit: lead.fitScore
          ? Object.values(lead.fitScore.reasons).join(". ")
          : "Imported lead",
        scoreFactors: lead.fitScore
          ? Object.entries(lead.fitScore.reasons).map(([k, v]) => `${k}: ${v}`)
          : [],
        scoreHistory: [{
          score: lead.fitScore?.total ?? 0,
          at: new Date().toISOString().slice(0, 10),
          reason: "Imported from lead list — Fit score from play matching.",
        }],
        notes: lead.notes ? [{ author: lead.relationshipOwner, date: new Date().toISOString().slice(0, 10), text: lead.notes }] : [],
        pursuits: [],
      },
    }));

    replaceCandidates(next);
    toast(`${next.length} lead${next.length !== 1 ? "s" : ""} imported — previous candidates cleared`, "success");
    resetBulkForm();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="oe-page-title">Search & Discovery</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search by company name or domain, or bulk-import a lead list to score against consortium plays. LinkedIn stays a manual Connections.csv import.
        </p>
      </div>

      {/* Search bar card */}
      <div className="bg-card rounded-xl border shadow-sm p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 items-stretch sm:items-end">
          <div className="flex flex-col gap-1.5 w-full sm:flex-1 sm:min-w-[180px]">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Company</label>
            <input
              type="text"
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="e.g. Alaska Airlines"
              className="oe-field w-full"
              onKeyDown={e => e.key === "Enter" && void handleRunSearch()}
            />
          </div>
          <div className="flex flex-col gap-1.5 w-full sm:w-[180px]">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Domain</label>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="alaskaair.com"
              className="oe-field w-full"
              onKeyDown={e => e.key === "Enter" && void handleRunSearch()}
            />
          </div>
          <div className="flex flex-col gap-1.5 w-full xs:w-auto xs:flex-1 sm:flex-none">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Industry</label>
            <SelectInput
              value={industry}
              onChange={setIndustry}
              className="w-full sm:min-w-[180px]"
              options={[
                { value: "all", label: "All industries" },
                ...ICP_VERTICALS.map(vertical => ({ value: vertical.industry, label: vertical.industry })),
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5 w-full xs:w-auto xs:flex-1 sm:flex-none">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Signal keyword</label>
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="e.g. loyalty platform"
              className="oe-field w-full sm:min-w-[160px]"
              onKeyDown={e => e.key === "Enter" && void handleRunSearch()}
            />
          </div>
          <div className="flex flex-col gap-1.5 w-full xs:w-auto">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Min score</label>
            <input
              type="number"
              value={minScore}
              onChange={e => setMinScore(e.target.value)}
              placeholder="e.g. 60"
              className="oe-field w-full xs:min-w-[80px]"
            />
          </div>
          <div className="flex flex-col gap-1.5 w-full lg:w-auto">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Sources</label>
            <div className="flex gap-1.5 flex-wrap">
              {SOURCE_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => toggleSource(s)}
                  className={cn(
                    "font-mono text-[10px] px-2.5 py-1.5 border rounded-md cursor-pointer transition-all",
                    activeSources.has(s)
                      ? "border-trace/40 bg-trace-soft text-trace hover:bg-trace/10"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col xs:flex-row gap-2 w-full lg:w-auto lg:ml-auto">
            <button
              onClick={() => void handleRunSearch()}
              disabled={searching}
              className="text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm disabled:opacity-50"
            >
              {searching ? "Searching…" : "Run search"}
            </button>
            <button
              onClick={() => { setInboundFlags([]); setInboundOpen(true); }}
              className="text-xs font-medium px-4 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
            >
              Inbound lead
            </button>
            <button
              onClick={() => setBulkOpen(true)}
              className="text-xs font-medium px-4 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
            >
              Bulk import leads
            </button>
          </div>
        </div>
      </div>

      {/* Plays summary */}
      {plays.length > 0 && (
        <div className="bg-card rounded-xl border shadow-sm px-4 sm:px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Consortium Plays</h3>
            <span className="text-xs text-muted-foreground"><span className="font-mono font-semibold text-foreground">{plays.length}</span> plays built from Partner records</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {plays.map(play => (
              <div key={play.playId} className={cn(
                "text-[11px] px-2.5 py-1.5 rounded-md border",
                play.proven
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              )}>
                <span className="font-semibold">{play.name}</span>
                <span className="ml-1.5 text-[10px] opacity-70">
                  {play.proven ? "✓ proven" : "○ unproven"} · {play.strength.experienceCount} exp · {play.strength.partnerCount} partner{play.strength.partnerCount !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {searchNotes.length > 0 && (
        <div className="text-xs text-muted-foreground bg-card border border-border rounded-lg px-4 py-3 space-y-1">
          {searchNotes.map(note => <p key={note}>{note}</p>)}
        </div>
      )}

      {/* Results card */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-border">
          <h3 className="oe-card-title">Candidates</h3>
          <span className="text-xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{results.length}</span> candidates
          </span>
        </div>
        {/* Mobile cards */}
        <div className="lg:hidden divide-y divide-border">
          {results.map(r => (
            <div key={r.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">{r.org}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.industry}</div>
                </div>
                <span className="font-mono font-bold text-foreground shrink-0">{r.score}</span>
              </div>
              <div>
                <div className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">{r.source}</div>
                <div className="text-xs text-foreground mt-0.5">{r.signal}</div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">{r.updated}</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleRefresh(r.id)}
                    disabled={refreshing.has(r.id)}
                    className={cn(
                      "text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary",
                      refreshing.has(r.id) && "opacity-50 cursor-wait"
                    )}
                  >
                    {refreshing.has(r.id) ? "Refreshing…" : "Refresh"}
                  </button>
                  <button
                    onClick={() => handleAdd(r)}
                    disabled={addedIds.has(r.id) || Boolean(r.existingAccountId)}
                    className={cn(
                      "text-xs font-semibold px-3 py-1.5 rounded-md shadow-sm cursor-pointer transition-all",
                      addedIds.has(r.id)
                        ? "bg-[hsl(var(--status-go-soft))] text-[hsl(var(--status-go))] border border-[hsl(var(--status-go))]/30"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    {addedIds.has(r.id) ? "Added ✓" : r.existingAccountId ? "In pipeline" : "Add"}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {hasSearched
                ? "No candidates in this result set. Run a new search or bulk import to replace the list."
                : "Run a search or bulk-import leads to load candidates. Starting a new search or upload clears any previous candidates for your account."}
            </div>
          )}
        </div>
        {/* Desktop table */}
        <div className="hidden lg:block overflow-x-auto oe-touch-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="oe-table-header">
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-2.5 w-[18%]">Organization</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-2.5 w-[12%]">Industry</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-2.5">Signal / Play</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-2.5 w-[8%]">Fit</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-2.5 w-[8%] hidden xl:table-cell">Opp.</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-2.5 w-[10%] hidden xl:table-cell">Updated</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-2.5 w-[14%]"></th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.id} className="oe-table-row border-b border-border last:border-b-0">
                  <td className="px-3 lg:px-4 py-3 font-semibold text-foreground">{r.org}</td>
                  <td className="px-3 lg:px-4 py-3 text-muted-foreground">{r.industry}</td>
                  <td className="px-3 lg:px-4 py-3">
                    <div className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">{r.source}</div>
                    <div className="text-xs text-foreground mt-0.5">{r.signal}</div>
                  </td>
                  <td className="px-3 lg:px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden hidden xl:block">
                        <span className="block h-full bg-primary rounded-full" style={{ width: `${r.score}%` }} />
                      </div>
                      <span className="font-mono font-bold text-foreground">{r.score}</span>
                    </div>
                  </td>
                  <td className="px-3 lg:px-4 py-3 hidden xl:table-cell">
                    <span className="font-mono text-muted-foreground">{r.opportunityScore ?? "—"}</span>
                  </td>
                  <td className="px-3 lg:px-4 py-3 text-[11px] text-muted-foreground hidden xl:table-cell">{r.updated}</td>
                  <td className="px-3 lg:px-4 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleRefresh(r.id)}
                        disabled={refreshing.has(r.id)}
                        className={cn(
                          "text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary",
                          refreshing.has(r.id) && "opacity-50 cursor-wait"
                        )}
                      >
                        {refreshing.has(r.id) ? "Refreshing…" : "Refresh"}
                      </button>
                      <button
                        onClick={() => handleAdd(r)}
                        disabled={addedIds.has(r.id) || Boolean(r.existingAccountId)}
                        className={cn(
                          "text-xs font-semibold px-3 py-1.5 rounded-md shadow-sm cursor-pointer transition-all",
                          addedIds.has(r.id)
                            ? "bg-[hsl(var(--status-go-soft))] text-[hsl(var(--status-go))] border border-[hsl(var(--status-go))]/30"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        )}
                      >
                        {addedIds.has(r.id) ? "Added ✓" : r.existingAccountId ? "In pipeline" : "Add"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {hasSearched
                      ? "No candidates in this result set. Run a new search or bulk import to replace the list."
                      : "Run a search or bulk-import leads to load candidates. Starting a new search or upload clears any previous candidates for your account."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hint */}
      <div className="flex items-start gap-2.5 text-xs text-muted-foreground bg-card border border-border rounded-lg px-4 py-3 shadow-sm">
        <div className="w-1 self-stretch bg-primary rounded-full shrink-0" />
        <p>
          Bulk import now scores each organization against consortium plays built from Partner details. Fit score measures whether the consortium can help; Opportunity score (after enrichment) measures whether the organization needs it now. LinkedIn connections are imported from your own export, not scraped.
        </p>
      </div>

      {/* ── Bulk Import Leads Modal ── */}
      <Modal open={bulkOpen} onClose={resetBulkForm} title={`Bulk Import Leads — ${importStep === "upload" ? "Step 1: Upload" : importStep === "map" ? "Step 2: Map & Settings" : "Step 3: Review & Import"}`} wide>
        {importStep === "upload" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Upload a CSV lead list or paste it directly. The list needs at least an organization name column. Optional columns: contact name, title, website, email, profile URL, notes, and date of last contact.
            </p>
            <div
              onDragOver={e => { e.preventDefault(); setBulkDragOver(true); }}
              onDragLeave={() => setBulkDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setBulkDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) void readLeadFile(file);
              }}
              className={cn(
                "border-2 border-dashed rounded-lg px-4 py-6 text-center transition-colors",
                bulkDragOver ? "border-primary bg-primary/5" : "border-border bg-muted/10",
              )}
            >
              <input
                ref={bulkFileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) void readLeadFile(file);
                  e.target.value = "";
                }}
              />
              <p className="text-xs font-medium text-foreground">
                {bulkFileName ? bulkFileName : "Drop a CSV file here"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Any CSV with an organization name column works — event lists, agency exports, CRM exports, or network data.
              </p>
              <button
                type="button"
                onClick={() => bulkFileRef.current?.click()}
                className="mt-3 text-xs font-semibold px-3.5 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
              >
                Choose CSV
              </button>
            </div>
            <FormField label="Or paste a lead list">
              <TextArea
                value={bulkFileName ? "" : bulkText}
                onChange={value => { setBulkFileName(""); setBulkText(value); }}
                placeholder={"Organization,Contact Name,Title,Website,Email\nCascade Transit,Jordan Hale,IT Director,cascadetransit.gov,jhale@cascadetransit.gov"}
                rows={6}
              />
            </FormField>
            {bulkText.trim() && (
              <div className="text-xs text-muted-foreground">
                Detected <span className="font-mono font-semibold text-foreground">{csvHeaders.length}</span> columns, <span className="font-mono font-semibold text-foreground">{rowCount}</span> data rows.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton onClick={resetBulkForm}>Cancel</SecondaryButton>
              <PrimaryButton onClick={handleStepToMap} disabled={!bulkText.trim()}>
                Next: Map columns →
              </PrimaryButton>
            </div>
          </div>
        )}

        {importStep === "map" && (
          <div className="space-y-5">
            {/* Column mapping */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Column Mapping</h4>
              <div className="space-y-2 max-h-[200px] overflow-y-auto border border-border rounded-lg p-3">
                {columnMappings.map((mapping, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-[140px] truncate font-mono" title={mapping.headerName}>
                      {mapping.headerName}
                    </span>
                    <span className="text-muted-foreground text-xs">→</span>
                    <select
                      value={mapping.mappedTo}
                      onChange={e => {
                        setColumnMappings(prev => prev.map((m, i) =>
                          i === idx ? { ...m, mappedTo: e.target.value as ColumnMapping["mappedTo"] } : m
                        ));
                      }}
                      className="oe-field text-xs flex-1"
                    >
                      {MAPPABLE_COLUMNS.map(col => (
                        <option key={col.value} value={col.value}>{col.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {!columnMappings.some(m => m.mappedTo === "organization") && (
                <p className="text-xs text-amber-700 mt-1">⚠ Map at least one column to "Organization name"</p>
              )}
            </div>

            {/* List settings */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">List Settings</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="List source">
                  <SelectInput
                    value={sourceType}
                    onChange={v => setSourceType(v as ListSourceType)}
                    options={LIST_SOURCE_TYPES.map(t => ({ value: t.value, label: t.label }))}
                  />
                </FormField>
                <FormField label="Provider / agency">
                  <input
                    value={sourceProvider}
                    onChange={e => setSourceProvider(e.target.value)}
                    placeholder="e.g. ZoomInfo, conference name"
                    className="oe-field text-xs"
                  />
                </FormField>
                {sourceType === "event" && (
                  <>
                    <FormField label="Event name">
                      <input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="e.g. GovTech Summit 2026" className="oe-field text-xs" />
                    </FormField>
                    <FormField label="Event date">
                      <input value={eventDate} onChange={e => setEventDate(e.target.value)} placeholder="2026-09-15" className="oe-field text-xs" />
                    </FormField>
                    <FormField label="Event location">
                      <input value={eventLocation} onChange={e => setEventLocation(e.target.value)} placeholder="Seattle, WA" className="oe-field text-xs" />
                    </FormField>
                    <FormField label="Event theme">
                      <input value={eventTheme} onChange={e => setEventTheme(e.target.value)} placeholder="State IT modernization" className="oe-field text-xs" />
                    </FormField>
                  </>
                )}
                <FormField label="Relationship level">
                  <SelectInput
                    value={relLevel}
                    onChange={v => setRelLevel(v as RelationshipLevel)}
                    options={RELATIONSHIP_LEVELS.map(l => ({ value: l.value, label: `${l.label} (${l.points} pts)` }))}
                  />
                </FormField>
                <FormField label="Relationship owner">
                  <input
                    value={relOwner}
                    onChange={e => setRelOwner(e.target.value)}
                    placeholder={operatorEmail || "Team member name"}
                    className="oe-field text-xs"
                  />
                </FormField>
                <FormField label="Context">
                  <input
                    value={listContext}
                    onChange={e => setListContext(e.target.value)}
                    placeholder="Theme, region, or industry focus"
                    className="oe-field text-xs"
                  />
                </FormField>
              </div>
            </div>

            {/* Scoring controls */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Scoring Controls</h4>
              <div className="flex gap-4">
                <FormField label="Fit threshold">
                  <input
                    type="number"
                    value={fitThreshold}
                    onChange={e => setFitThreshold(e.target.value)}
                    placeholder="60"
                    className="oe-field text-xs w-20"
                  />
                </FormField>
                <FormField label="Per-run enrichment limit">
                  <input
                    type="number"
                    value={enrichLimit}
                    onChange={e => setEnrichLimit(e.target.value)}
                    placeholder="25"
                    className="oe-field text-xs w-20"
                  />
                </FormField>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Organizations at or above the Fit threshold are marked for enrichment. Enrichment is capped to {enrichLimit || "25"} per run.
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <SecondaryButton onClick={() => setImportStep("upload")}>← Back</SecondaryButton>
              <PrimaryButton onClick={handleStepToReview}>
                Next: Classify & Score →
              </PrimaryButton>
            </div>
          </div>
        )}

        {importStep === "review" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono font-semibold text-foreground">{importedLeads.length}</span> organizations parsed ·{" "}
                  <span className="font-mono font-semibold text-foreground">{importedLeads.filter(l => l.action === "enrich").length}</span> above Fit threshold ·{" "}
                  <span className="font-mono font-semibold text-foreground">{importedLeads.filter(l => l.action === "excluded").length}</span> excluded ·{" "}
                  <span className="font-mono font-semibold text-foreground">{selectedLeads.size}</span> selected
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedLeads(new Set(importedLeads.filter(l => l.action !== "excluded").map(l => l.id)))}
                  className="text-[11px] text-primary cursor-pointer hover:underline"
                >
                  Select all
                </button>
                <button
                  onClick={() => setSelectedLeads(new Set(importedLeads.filter(l => l.action === "enrich").map(l => l.id)))}
                  className="text-[11px] text-primary cursor-pointer hover:underline"
                >
                  Above threshold
                </button>
                <button
                  onClick={() => setSelectedLeads(new Set())}
                  className="text-[11px] text-muted-foreground cursor-pointer hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            {importWarnings.length > 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-1">
                {importWarnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            )}

            <div className="max-h-[350px] overflow-y-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="oe-table-header sticky top-0 bg-card z-10">
                    <th className="px-3 py-2 text-left w-8">
                      <input
                        type="checkbox"
                        checked={selectedLeads.size === importedLeads.filter(l => l.action !== "excluded").length}
                        onChange={e => {
                          if (e.target.checked) setSelectedLeads(new Set(importedLeads.filter(l => l.action !== "excluded").map(l => l.id)));
                          else setSelectedLeads(new Set());
                        }}
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground font-semibold">Organization</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground font-semibold">ID Conf.</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground font-semibold">Best Play</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground font-semibold">Fit</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground font-semibold">Contacts</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importedLeads.map(lead => (
                    <tr
                      key={lead.id}
                      className={cn(
                        "border-b border-border last:border-b-0 cursor-pointer transition-colors",
                        lead.action === "excluded" ? "opacity-50" : "hover:bg-muted/30",
                        expandedLead === lead.id && "bg-muted/20"
                      )}
                      onClick={() => setExpandedLead(prev => prev === lead.id ? null : lead.id)}
                    >
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedLeads.has(lead.id)}
                          disabled={lead.action === "excluded"}
                          onChange={e => {
                            setSelectedLeads(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(lead.id) : next.delete(lead.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-foreground">{lead.cleanedName}</div>
                        {lead.originalName !== lead.cleanedName && (
                          <div className="text-[10px] text-muted-foreground">was: {lead.originalName}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn(
                          "text-[10px] font-medium px-1.5 py-0.5 rounded",
                          lead.identityConfidence === "High" ? "bg-emerald-100 text-emerald-700" :
                          lead.identityConfidence === "Medium" ? "bg-amber-100 text-amber-700" :
                          lead.identityConfidence === "Low" ? "bg-red-100 text-red-700" :
                          "bg-slate-100 text-slate-600"
                        )}>
                          {lead.identityConfidence}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {lead.bestPlayName || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {lead.fitScore ? (
                          <span className="font-mono font-bold text-foreground">{lead.fitScore.total}</span>
                        ) : lead.action === "excluded" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground font-mono">
                        {lead.contacts.length}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", STATUS_COLORS[lead.status])}>
                          {lead.status}
                        </span>
                        {lead.action === "excluded" && (
                          <span className="ml-1 text-[10px] text-red-600">Excluded</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {importedLeads.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No organizations parsed from the list.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Expanded detail */}
            {expandedLead && (() => {
              const lead = importedLeads.find(l => l.id === expandedLead);
              if (!lead) return null;
              return (
                <div className="bg-muted/20 border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <h4 className="text-sm font-semibold text-foreground">{lead.cleanedName}</h4>
                    <button onClick={() => setExpandedLead(null)} className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Close</button>
                  </div>
                  {lead.identity?.excluded && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                      Excluded: {lead.identity.excludedReason}
                    </div>
                  )}
                  {lead.identity?.duplicateOf && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      Duplicate of existing pipeline organization ({lead.identity.duplicateOf})
                    </div>
                  )}
                  {lead.contacts.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Contacts</div>
                      {lead.contacts.map((c, i) => (
                        <div key={i} className="text-xs text-foreground">
                          {c.name}{c.title ? ` — ${c.title}` : ""}{c.email ? ` (${c.email})` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                  {lead.fitScore && (
                    <div>
                      <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Fit Score Breakdown</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(["experience", "capability", "credentialsAccess", "sizeType", "relationship"] as const).map(key => (
                          <div key={key} className="text-xs">
                            <span className="text-muted-foreground">{key}:</span>{" "}
                            <span className="font-mono font-semibold">{lead.fitScore![key]}</span>
                            <div className="text-[10px] text-muted-foreground">{lead.fitScore!.reasons[key]}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 text-xs">
                        <span className="text-muted-foreground">Total Fit:</span>{" "}
                        <span className="font-mono font-bold text-foreground">{lead.fitScore.total}</span>
                      </div>
                    </div>
                  )}
                  {lead.bestPlayName && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Best play:</span>{" "}
                      <span className="font-semibold text-foreground">{lead.bestPlayName}</span>
                    </div>
                  )}
                  {lead.notes && (
                    <div className="text-xs text-muted-foreground">Notes: {lead.notes}</div>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-between pt-2">
              <SecondaryButton onClick={() => setImportStep("map")}>← Back</SecondaryButton>
              <PrimaryButton onClick={handleImportSelected} disabled={selectedLeads.size === 0}>
                Import {selectedLeads.size} Lead{selectedLeads.size !== 1 ? "s" : ""} to Candidates
              </PrimaryButton>
            </div>
          </div>
        )}
      </Modal>

      {/* Inbound lead modal */}
      <Modal open={inboundOpen} onClose={() => setInboundOpen(false)} title="Inbound lead">
        <InboundLeadForm
          name={inboundName}
          email={inboundEmail}
          contact={inboundContact}
          channel={inboundChannel}
          summary={inboundSummary}
          flags={inboundFlags}
          onName={setInboundName}
          onEmail={setInboundEmail}
          onContact={setInboundContact}
          onChannel={setInboundChannel}
          onSummary={setInboundSummary}
          onFlags={setInboundFlags}
          onClose={() => setInboundOpen(false)}
          onAdd={(org, message) => {
            const existing = matchExistingAccount(
              { name: org.name, domain: org.domain },
              pipelineOrgs.map(item => ({ id: item.id, name: item.name, domain: item.domain })),
            );
            if (existing) {
              toast(`${existing.name} is already in the pipeline. ${existing.reason}.`, "warning");
              return;
            }
            onAddOrg(org);
            toast(message, org.screenFlags?.length ? "warning" : "success");
            setInboundOpen(false);
            setInboundName("");
            setInboundEmail("");
            setInboundContact("");
            setInboundSummary("");
            setInboundFlags([]);
          }}
          graph={graph}
        />
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inbound Lead Form (unchanged)                                      */
/* ------------------------------------------------------------------ */

function InboundLeadForm({
  name, email, contact, channel, summary, flags,
  onName, onEmail, onContact, onChannel, onSummary, onFlags, onClose, onAdd, graph,
}: {
  name: string;
  email: string;
  contact: string;
  channel: string;
  summary: string;
  flags: string[];
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onContact: (value: string) => void;
  onChannel: (value: string) => void;
  onSummary: (value: string) => void;
  onFlags: (flags: string[]) => void;
  onClose: () => void;
  onAdd: (org: Organization, message: string) => void;
  graph: GraphData;
}) {
  function submit() {
    const screened = screenInboundLead({ name, email, summary });
    onFlags(screened.flags);
    if (!name.trim()) return;
    const nodes = graphNodesFrom(graph);
    const assessment = scoreDiscoveredAccount({
      name: name.trim(),
      text: summary,
      isInbound: true,
      priorRelationship: false,
      graph: nodes,
      graphVersion: graphVersionOf(nodes),
    });
    const org = organizationFromDiscovery({
      name: name.trim(),
      channel,
      source: "Inbound intake",
      summary,
      contactName: contact,
      contactEmail: email,
      assessment,
      screenFlags: screened.flags,
    });
    const message = screened.flags.length
      ? `${org.name} added for review — automated screening did not decline it.`
      : `${org.name} scored ${org.score} and added to the pipeline.`;
    onAdd(org, message);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Web, email, referral, event, and partner inquiries land on the same ranked board. Screening flags a weak submission for you to review. It does not reject the lead.
      </p>
      <FormField label="Company">
        <input value={name} onChange={e => onName(e.target.value)} className="oe-field text-xs" placeholder="Company name" />
      </FormField>
      <FormField label="Contact">
        <input value={contact} onChange={e => onContact(e.target.value)} className="oe-field text-xs" placeholder="Name" />
      </FormField>
      <FormField label="Email">
        <input value={email} onChange={e => onEmail(e.target.value)} className="oe-field text-xs" placeholder="name@company.com" />
      </FormField>
      <FormField label="Channel">
        <SelectInput
          value={channel}
          onChange={onChannel}
          options={[
            { value: "Inbound", label: "Web or inbox" },
            { value: "Referral", label: "Referral" },
            { value: "Event", label: "Event" },
            { value: "Partner", label: "Partner introduction" },
            { value: "Direct inquiry", label: "Direct inquiry" },
          ]}
        />
      </FormField>
      <FormField label="What they asked">
        <TextArea value={summary} onChange={onSummary} rows={4} placeholder="The inquiry, in their words" />
      </FormField>
      {flags.length > 0 && (
        <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-1">
          {flags.map(flag => <li key={flag}>{flag}</li>)}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton onClick={submit} disabled={!name.trim()}>Add to pipeline</PrimaryButton>
      </div>
    </div>
  );
}
