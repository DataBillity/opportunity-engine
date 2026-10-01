"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { ICP_VERTICALS, graphVersionOf, matchExistingAccount, scoreDiscoveredAccount, screenInboundLead, type DiscoveryAssessment, type DiscoveryField } from "@opportunity-engine/core";
import type { GraphData, Organization } from "@/lib/mock-data";
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
import { cn } from "@/lib/cn";

const SOURCE_OPTIONS = ["Company website", "SEC filings"] as const;

export function SearchView({
  onAddOrg,
  graph,
  pipelineOrgs,
}: {
  onAddOrg: (org: Organization) => void;
  graph: GraphData;
  pipelineOrgs: Organization[];
  onAddOrgs?: (orgs: Organization[]) => void;
  onImportedLeads?: () => void;
}) {
  const { toast } = useToast();
  const { profile } = useOperator();
  const operatorEmail = profile?.email ?? "";

  const [industry, setIndustry] = useState("all");
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [keyword, setKeyword] = useState("");
  const [minScore, setMinScore] = useState("");
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set(SOURCE_OPTIONS));
  const [searching, setSearching] = useState(false);
  const [searchNotes, setSearchNotes] = useState<string[]>([]);
  const [results, setResults] = useState<DiscoveryCandidate[]>([]);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkChannel, setBulkChannel] = useState("Outbound");
  const [bulkSource, setBulkSource] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkDragOver, setBulkDragOver] = useState(false);
  const [bulkMinScore, setBulkMinScore] = useState("");
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);
  const [inboundOpen, setInboundOpen] = useState(false);
  const [inboundName, setInboundName] = useState("");
  const [inboundEmail, setInboundEmail] = useState("");
  const [inboundContact, setInboundContact] = useState("");
  const [inboundChannel, setInboundChannel] = useState("Inbound");
  const [inboundSummary, setInboundSummary] = useState("");
  const [inboundFlags, setInboundFlags] = useState<string[]>([]);
  const bulkFileRef = useRef<HTMLInputElement>(null);
  const parsedBulk = useMemo(() => parseBulkLeads(bulkText, bulkChannel), [bulkText, bulkChannel]);

  const filteredBulkOrgs = useMemo(() => {
    const minVal = bulkMinScore ? Number(bulkMinScore) : 0;
    return parsedBulk.orgs.map((org, idx) => ({ org, idx })).filter(({ org }) => org.score >= minVal);
  }, [parsedBulk.orgs, bulkMinScore]);

  useMemo(() => {
    setBulkSelected(new Set(filteredBulkOrgs.map(f => f.idx)));
  }, [filteredBulkOrgs.length]);

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
    } else {
      setResults([]);
      setAddedIds(new Set());
      setHasSearched(false);
    }
  }, [operatorEmail]);

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

  function resetBulkForm() {
    setBulkOpen(false);
    setBulkText("");
    setBulkChannel("Outbound");
    setBulkSource("");
    setBulkFileName("");
    setBulkMinScore("");
    setBulkSelected(new Set());
  }

  async function readLeadFile(file: File) {
    const text = await file.text();
    setBulkFileName(file.name);
    setBulkText(text);
  }

  function handleBulkUpload() {
    const selectedOrgs = parsedBulk.orgs.filter((_, idx) => bulkSelected.has(idx));
    if (selectedOrgs.length === 0) return;
    const stamp = Date.now();
    const next: DiscoveryCandidate[] = selectedOrgs.map((org, index) => {
      const withSource = bulkSource.trim() ? { ...org, source: bulkSource.trim() } : org;
      return {
        id: `${withSource.id}-bulk-${stamp}-${index}`,
        org: withSource.name,
        industry: withSource.industry,
        signal: withSource.summary || withSource.whyGoodFit || "Imported lead",
        source: withSource.source || (parsedBulk.kind === "linkedin" ? "LinkedIn" : bulkChannel),
        score: withSource.score,
        updated: "just now",
        leadDraft: withSource,
      };
    });
    replaceCandidates(next);
    const toastMsg = parsedBulk.kind === "linkedin"
      ? `${next.length} LinkedIn candidate${next.length !== 1 ? "s" : ""} loaded — previous candidates cleared`
      : `${next.length} candidate${next.length !== 1 ? "s" : ""} loaded — previous candidates cleared`;
    toast(toastMsg, "success");
    resetBulkForm();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="oe-page-title">Search & Discovery</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Looks up a company website and recent SEC filings, then scores fit against the capability graph. LinkedIn stays a manual Connections.csv import.
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
        <div className="hidden lg:block overflow-x-auto oe-touch-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="oe-table-header">
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-2.5 w-[20%]">Organization</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-2.5 w-[14%] hidden lg:table-cell">Industry</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-2.5">Latest Signal</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-2.5 w-[10%]">Score</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-2.5 w-[12%] hidden xl:table-cell">Refreshed</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 lg:px-4 py-2.5 w-[16%]"></th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.id} className="oe-table-row border-b border-border last:border-b-0">
                  <td className="px-3 lg:px-4 py-3 font-semibold text-foreground">{r.org}</td>
                  <td className="px-3 lg:px-4 py-3 text-muted-foreground hidden lg:table-cell">{r.industry}</td>
                  <td className="px-3 lg:px-4 py-3">
                    <div className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">{r.source}</div>
                    <div className="text-xs text-foreground mt-0.5">{r.signal}</div>
                  </td>
                  <td className="px-3 lg:px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden hidden xl:block">
                        <span className="block h-full bg-primary rounded-full" style={{ width: `${r.score}%` }} />
                      </div>
                      <span className="font-mono font-bold text-foreground">{r.score}</span>
                    </div>
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
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
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
          Refreshing re-reads the company website and latest SEC filing, then re-scores against the current graph. A filed fact keeps its source and timestamp. LinkedIn connections are imported from your own export, not scraped.
        </p>
      </div>

      {/* Bulk Import Leads Modal */}
      <Modal open={bulkOpen} onClose={resetBulkForm} title="Bulk Import Leads" wide>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Upload a LinkedIn <span className="font-mono">Connections.csv</span> export, paste that CSV, or paste a simple lead list.
            Qualified connections become sales leads on Prospects — not RFPs, RFIs, or SOWs.
          </p>
          <div
            onDragOver={e => {
              e.preventDefault();
              setBulkDragOver(true);
            }}
            onDragLeave={() => setBulkDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setBulkDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void readLeadFile(file);
            }}
            className={cn(
              "border-2 border-dashed rounded-lg px-4 py-4 text-center transition-colors",
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
              {bulkFileName ? bulkFileName : "Drop Connections.csv here"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              LinkedIn columns: First Name, Last Name, URL, Email Address, Company, Position, Connected On
            </p>
            <button
              type="button"
              onClick={() => bulkFileRef.current?.click()}
              className="mt-3 text-xs font-semibold px-3.5 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
            >
              Choose CSV
            </button>
          </div>
          <FormField label={parsedBulk.kind === "linkedin" ? "Or paste the CSV" : "Lead list"}>
            <TextArea
              value={bulkFileName ? "" : bulkText}
              onChange={value => {
                setBulkFileName("");
                setBulkText(value);
              }}
              placeholder={"First Name,Last Name,URL,Email Address,Company,Position,Connected On\nJordan,Hale,https://www.linkedin.com/in/jordanhale,,Acme Transit,Director of IT,11 Sep 2026"}
              rows={8}
            />
          </FormField>
          {parsedBulk.kind !== "linkedin" && (
            <FormField label="Channel">
              <SelectInput
                value={bulkChannel}
                onChange={setBulkChannel}
                options={LEAD_CHANNELS}
              />
            </FormField>
          )}
          <FormField label="Source (optional)">
            <input
              type="text"
              value={bulkSource}
              onChange={e => setBulkSource(e.target.value)}
              placeholder="e.g. CES 2026 Leads"
              className="oe-field text-xs"
            />
          </FormField>
          <div className="flex items-center gap-3">
            <FormField label="Minimum Score">
              <input
                type="number"
                value={bulkMinScore}
                onChange={e => setBulkMinScore(e.target.value)}
                placeholder="e.g. 50"
                className="oe-field text-xs w-24"
              />
            </FormField>
            <div className="text-[11px] text-muted-foreground mt-4">
              {parsedBulk.error
                ? parsedBulk.error
                : `${filteredBulkOrgs.length} of ${parsedBulk.orgs.length} leads match · ${bulkSelected.size} selected`}
            </div>
          </div>
          {filteredBulkOrgs.length > 0 && (
            <div className="max-h-[200px] overflow-y-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="oe-table-header">
                    <th className="px-3 py-2 text-left w-8">
                      <input type="checkbox" checked={bulkSelected.size === filteredBulkOrgs.length} onChange={e => {
                        if (e.target.checked) setBulkSelected(new Set(filteredBulkOrgs.map(f => f.idx)));
                        else setBulkSelected(new Set());
                      }} />
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground font-semibold">Organization</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground font-semibold">Score</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase text-muted-foreground font-semibold">Industry</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBulkOrgs.map(({ org, idx }) => (
                    <tr key={idx} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={bulkSelected.has(idx)} onChange={e => {
                          setBulkSelected(prev => { const next = new Set(prev); e.target.checked ? next.add(idx) : next.delete(idx); return next; });
                        }} />
                      </td>
                      <td className="px-3 py-1.5 text-foreground">{org.name}</td>
                      <td className="px-3 py-1.5 font-mono font-bold text-primary">{org.score}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{org.industry || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={resetBulkForm}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={handleBulkUpload}
              disabled={bulkSelected.size === 0}
            >
              Import {bulkSelected.size} Candidate{bulkSelected.size !== 1 ? "s" : ""}
            </PrimaryButton>
          </div>
        </div>
      </Modal>

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
