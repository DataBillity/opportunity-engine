"use client";

import { useState, useMemo } from "react";
import { searchResults as initialResults, type SearchResult, type Organization } from "@/lib/mock-data";
import { Modal, FormField, TextArea, SelectInput, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export function SearchView({
  onAddOrg,
}: {
  onAddOrg: (org: Organization) => void;
}) {
  const { toast } = useToast();

  const [industry, setIndustry] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [minScore, setMinScore] = useState("");
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set(["Firmographic", "Filings", "Press", "LinkedIn"]));
  const [results, setResults] = useState<SearchResult[]>(initialResults);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const allSources = ["Firmographic", "Filings", "Press", "LinkedIn"];
  const sourceMap: Record<string, string> = {
    "Agency procurement portal": "Firmographic",
    "SEC 10-K filing": "Filings",
    "Press release": "Press",
    "LinkedIn post": "LinkedIn",
  };

  const filteredResults = useMemo(() => {
    return results.filter(r => {
      if (industry !== "all" && r.industry !== industry) return false;
      if (keyword.trim() && !r.signal.toLowerCase().includes(keyword.toLowerCase()) && !r.org.toLowerCase().includes(keyword.toLowerCase())) return false;
      if (minScore && r.score < Number(minScore)) return false;
      const rSource = sourceMap[r.source] ?? "";
      if (!activeSources.has(rSource)) return false;
      return true;
    });
  }, [results, industry, keyword, minScore, activeSources]);

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

  function handleRunSearch() {
    setHasSearched(true);
    toast(`Search complete — ${filteredResults.length} candidates found`, "info");
  }

  function handleRefresh(id: string) {
    setRefreshing(prev => new Set(prev).add(id));
    setTimeout(() => {
      setResults(prev =>
        prev.map(r =>
          r.id === id
            ? { ...r, score: Math.min(100, r.score + Math.floor(Math.random() * 8) - 2), updated: "just now" }
            : r
        )
      );
      setRefreshing(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast("Enrichment refreshed — score updated", "success");
    }, 1200);
  }

  function handleAdd(r: SearchResult) {
    const newOrg: Organization = {
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
    setAddedIds(prev => new Set(prev).add(r.id));
    toast(`${r.org} added to pipeline`, "success");
  }

  function handleBulkUpload() {
    const lines = bulkText.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return;
    let added = 0;
    for (const line of lines) {
      const parts = line.split(",").map(s => s.trim());
      const name = parts[0];
      const ind = parts[1] || "Unknown";
      if (!name) continue;
      const newOrg: Organization = {
        id: `ORG-${Date.now().toString().slice(-4)}-${added}`,
        name,
        industry: ind,
        channel: "Bulk import",
        score: 50,
        domain: "",
        registryId: "",
        summary: "",
        contacts: [],
        whyGoodFit: "",
        scoreFactors: [],
        scoreHistory: [{ score: 50, at: new Date().toISOString().slice(0, 10), reason: "Bulk import — awaiting enrichment." }],
        notes: [],
        pursuits: [],
      };
      onAddOrg(newOrg);
      added++;
    }
    toast(`${added} organization${added !== 1 ? "s" : ""} imported to pipeline`, "success");
    setBulkOpen(false);
    setBulkText("");
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="oe-page-title">Search & Discovery</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Candidate organizations sourced from firmographic feeds and public signal harvesting (DISC-01 through DISC-04).
          Both model tiers behind one gateway — Gemini for extraction, Claude for fit judgment.
        </p>
      </div>

      {/* Search bar card */}
      <div className="bg-card rounded-xl border shadow-sm p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 items-stretch sm:items-end">
          <div className="flex flex-col gap-1.5 w-full xs:w-auto xs:flex-1 sm:flex-none">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Industry</label>
            <SelectInput
              value={industry}
              onChange={setIndustry}
              className="w-full sm:min-w-[160px]"
              options={[
                { value: "all", label: "All industries" },
                { value: "Public Transit", label: "Public Transit" },
                { value: "Insurance", label: "Insurance" },
                { value: "Healthcare", label: "Healthcare" },
                { value: "Utilities", label: "Utilities" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5 w-full xs:w-auto xs:flex-1 sm:flex-none">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Signal keyword</label>
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="e.g. legacy, modernization"
              className="oe-field w-full sm:min-w-[180px]"
              onKeyDown={e => e.key === "Enter" && handleRunSearch()}
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
              {allSources.map(s => (
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
              onClick={handleRunSearch}
              className="text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm"
            >
              Run search
            </button>
            <button
              onClick={() => setBulkOpen(true)}
              className="text-xs font-medium px-4 py-2 rounded-md border border-input bg-card text-foreground cursor-pointer transition-all hover:bg-secondary"
            >
              Bulk upload a list
            </button>
          </div>
        </div>
      </div>

      {/* Results card */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-border">
          <h3 className="oe-card-title">Candidates</h3>
          <span className="text-xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{filteredResults.length}</span> candidates
          </span>
        </div>
        <div className="lg:hidden divide-y divide-border">
          {filteredResults.map(r => (
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
                    disabled={addedIds.has(r.id)}
                    className={cn(
                      "text-xs font-semibold px-3 py-1.5 rounded-md shadow-sm cursor-pointer transition-all",
                      addedIds.has(r.id)
                        ? "bg-[hsl(var(--status-go-soft))] text-[hsl(var(--status-go))] border border-[hsl(var(--status-go))]/30"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    {addedIds.has(r.id) ? "Added ✓" : "Add"}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredResults.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No candidates match your current filters. Try broadening your search criteria.
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
              {filteredResults.map(r => (
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
                        disabled={addedIds.has(r.id)}
                        className={cn(
                          "text-xs font-semibold px-3 py-1.5 rounded-md shadow-sm cursor-pointer transition-all",
                          addedIds.has(r.id)
                            ? "bg-[hsl(var(--status-go-soft))] text-[hsl(var(--status-go))] border border-[hsl(var(--status-go))]/30"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        )}
                      >
                        {addedIds.has(r.id) ? "Added ✓" : "Add"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredResults.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No candidates match your current filters. Try broadening your search criteria.
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
          Refreshing re-runs enrichment and re-scores against the current graph. Scores are appended, never overwritten (SCORE-08).
        </p>
      </div>

      {/* Bulk Upload Modal */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Upload Organizations" wide>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Paste one organization per line. Optionally add the industry after a comma.
          </p>
          <FormField label="Organization list">
            <TextArea
              value={bulkText}
              onChange={setBulkText}
              placeholder={"Acme Transit Authority, Public Transit\nBigCo Insurance, Insurance\nHealthFirst Partners, Healthcare"}
              rows={8}
            />
          </FormField>
          <div className="text-[11px] text-muted-foreground">
            {bulkText.trim().split("\n").filter(Boolean).length} organization{bulkText.trim().split("\n").filter(Boolean).length !== 1 ? "s" : ""} detected
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setBulkOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={handleBulkUpload}
              disabled={bulkText.trim().split("\n").filter(Boolean).length === 0}
            >
              Import to Pipeline
            </PrimaryButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
