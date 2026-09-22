"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PipelineView } from "@/components/views/pipeline-view";
import { OpportunityView } from "@/components/views/opportunity-view";
import { OrgDetailView } from "@/components/views/org-detail-view";
import { SearchView } from "@/components/views/search-view";
import { SourcesView } from "@/components/views/sources-view";
import { ResponseBuilderEmptyState, ResponseBuilderView } from "@/components/views/response-builder-view";
import { SettingsView } from "@/components/views/settings-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { ArchiveView } from "@/components/views/archive-view";
import { OperatorProvider } from "@/components/auth/operator-provider";
import { applyPartnerArchive, applyPartnerReinstate, setPartnerArchived } from "@/lib/partner-archive";
import {
  organizations as initialOrgs,
  pursuits as initialPursuits,
  partnerDirectory as initialPartners,
  graphData as initialGraph,
  type Organization,
  type Pursuit,
  type Partner,
  type GraphData,
} from "@/lib/mock-data";
import { mergeLeadOrganizations, mergePipelineLeads } from "@/lib/create-lead";

export type ViewId = "dashboard" | "search" | "pipeline" | "org" | "decision" | "draft" | "sources" | "archive" | "settings";

const STORAGE_KEYS = {
  orgs: "oe_orgs",
  pursuits: "oe_pursuits",
  partners: "oe_partners",
  graph: "oe_graph",
} as const;

function loadFromStorage<T>(key: string, fallback: () => T): T {
  if (typeof window === "undefined") return fallback();
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return fallback();
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function getOrgPursuitsFromState(org: Organization, allPursuits: Record<string, Pursuit>): Pursuit[] {
  return org.pursuits.map(pid => allPursuits[pid]).filter(Boolean) as Pursuit[];
}

function orgPursuitsFromState(org: Organization | undefined, allPursuits: Record<string, Pursuit>): Pursuit[] {
  if (!org) return [];
  return getOrgPursuitsFromState(org, allPursuits);
}

export default function CommandCenter() {
  const [activeView, setActiveView] = useState<ViewId>("pipeline");
  const [currentOrgId, setCurrentOrgId] = useState("ORG-01");
  const [currentPursuitId, setCurrentPursuitId] = useState<string | null>(null);
  const [leadReturnView, setLeadReturnView] = useState<"pipeline" | "archive">("pipeline");
  const [laneFilter, setLaneFilter] = useState("all");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [hydrated, setHydrated] = useState(false);
  const [orgs, setOrgs] = useState<Organization[]>(() => [...initialOrgs]);
  const [allPursuits, setAllPursuits] = useState<Record<string, Pursuit>>(() => ({ ...initialPursuits }));
  const [partners, setPartners] = useState<Partner[]>(() => [...initialPartners]);
  const [graph, setGraph] = useState<GraphData>(() => ({
    capabilities: [...initialGraph.capabilities],
    experience: [...initialGraph.experience],
    credentials: [...initialGraph.credentials],
    people: [...initialGraph.people],
  }));

  useEffect(() => {
    setOrgs(loadFromStorage(STORAGE_KEYS.orgs, () => [...initialOrgs]));
    setAllPursuits(loadFromStorage(STORAGE_KEYS.pursuits, () => ({ ...initialPursuits })));
    setPartners(loadFromStorage(STORAGE_KEYS.partners, () => [...initialPartners]));
    setGraph(loadFromStorage(STORAGE_KEYS.graph, () => ({
      capabilities: [...initialGraph.capabilities],
      experience: [...initialGraph.experience],
      credentials: [...initialGraph.credentials],
      people: [...initialGraph.people],
    })));
    setHydrated(true);
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveToStorage(STORAGE_KEYS.orgs, orgs);
      saveToStorage(STORAGE_KEYS.pursuits, allPursuits);
      saveToStorage(STORAGE_KEYS.partners, partners);
      saveToStorage(STORAGE_KEYS.graph, graph);
    }, 300);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [hydrated, orgs, allPursuits, partners, graph]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    fetch("/api/pipeline/orgs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { organizations?: Organization[] } | null) => {
        if (cancelled || !data?.organizations?.length) return;
        setOrgs((prev) => {
          const seen = new Set(prev.map((o) => o.id));
          const incoming = data.organizations!.filter((o) => !seen.has(o.id));
          return incoming.length ? [...incoming, ...prev] : prev;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  const currentOrg = orgs.find(o => o.id === currentOrgId);
  const currentPursuit = currentPursuitId ? allPursuits[currentPursuitId] : undefined;
  const selectedPursuit = currentPursuit?.orgId === currentOrgId ? currentPursuit : undefined;
  const orgPursuits = orgPursuitsFromState(currentOrg, allPursuits);
  const singlePursuitId = orgPursuits.length === 1 ? orgPursuits[0]!.id : null;
  const pursuitNavEnabled =
    orgPursuits.length === 1 || (orgPursuits.length > 1 && !!selectedPursuit);

  useEffect(() => {
    if (singlePursuitId && currentPursuitId !== singlePursuitId) {
      setCurrentPursuitId(singlePursuitId);
    }
  }, [singlePursuitId, currentPursuitId]);

  function handleOrgSelect(orgId: string, returnView: "pipeline" | "archive" = "pipeline") {
    setCurrentOrgId(orgId);
    setLeadReturnView(returnView);
    const org = orgs.find(o => o.id === orgId);
    if (!org) return;
    const orgPursuits = orgPursuitsFromState(org, allPursuits);
    setCurrentPursuitId(orgPursuits.length === 1 ? orgPursuits[0]!.id : null);
    setActiveView("org");
    setMobileNavOpen(false);
  }

  function handlePursuitSelect(pursuitId: string) {
    setCurrentPursuitId(pursuitId);
    setActiveView("decision");
  }

  function handleNav(view: ViewId) {
    if ((view === "decision" || view === "draft") && !pursuitNavEnabled) return;
    setActiveView(view);
    setMobileNavOpen(false);
  }

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  const handleConfirmDecision = useCallback(
    (pursuitId: string, decision: "go" | "nogo") => {
      setAllPursuits(prev => {
        const p = prev[pursuitId];
        if (!p) return prev;
        return {
          ...prev,
          [pursuitId]: {
            ...p,
            rec: decision,
            confidence: decision === "go" ? Math.max(p.confidence, 90) : Math.max(p.confidence, 85),
            status: decision === "go" ? "Go confirmed" : "No-Go confirmed — closed",
            closed: decision === "nogo",
          },
        };
      });
    },
    []
  );

  const handleAddPursuit = useCallback(
    (pursuit: Pursuit) => {
      setAllPursuits(prev => ({ ...prev, [pursuit.id]: pursuit }));
      setOrgs(prev =>
        prev.map(o =>
          o.id === pursuit.orgId
            ? { ...o, pursuits: o.pursuits.includes(pursuit.id) ? o.pursuits : [...o.pursuits, pursuit.id] }
            : o
        )
      );
      setCurrentOrgId(pursuit.orgId);
      setCurrentPursuitId(pursuit.id);
      setLeadReturnView("pipeline");
      setActiveView("decision");
    },
    []
  );

  const handleAddOrg = useCallback(
    (org: Organization) => {
      setOrgs(prev => mergeLeadOrganizations(prev, [org]));
    },
    []
  );

  const handleUpdatePursuit = useCallback(
    (pursuitId: string, updates: Partial<Pursuit>) => {
      setAllPursuits(prev => {
        const p = prev[pursuitId];
        if (!p) return prev;
        return { ...prev, [pursuitId]: { ...p, ...updates } };
      });
    },
    []
  );

  const handleArchiveOrg = useCallback(
    (orgId: string) => {
      setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, archived: true } : o));
      setCurrentPursuitId(prev => {
        const pursuit = prev ? allPursuits[prev] : undefined;
        return pursuit?.orgId === orgId ? null : prev;
      });
    },
    [allPursuits]
  );

  const handleReinstateOrg = useCallback(
    (orgId: string) => {
      setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, archived: false } : o));
      setLeadReturnView(prev => (currentOrgId === orgId ? "pipeline" : prev));
    },
    [currentOrgId]
  );

  const handleArchivePartner = useCallback(
    (partnerId: string) => {
      setPartners(prev => setPartnerArchived(prev, partnerId, true));
      setGraph(prev => applyPartnerArchive(prev, partnerId));
    },
    []
  );

  const handleReinstatePartner = useCallback(
    (partnerId: string) => {
      setPartners(prev => setPartnerArchived(prev, partnerId, false));
      setGraph(prev => applyPartnerReinstate(prev, partnerId));
    },
    []
  );

  const handleUpdateOrg = useCallback(
    (orgId: string, updates: Partial<Organization>) => {
      setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, ...updates } : o));
    },
    []
  );

  const handleRefreshAllScores = useCallback(
    () => {
      setOrgs(prev => prev.map(o => {
        if (o.archived) return o;
        const delta = Math.floor(Math.random() * 6) - 2;
        const newScore = Math.max(0, Math.min(100, o.score + delta));
        return {
          ...o,
          score: newScore,
          scoreHistory: [
            ...o.scoreHistory,
            { score: newScore, at: new Date().toISOString().slice(0, 10), reason: "Batch score refresh." },
          ],
        };
      }));
    },
    []
  );

  const handleMergeLeads = useCallback(
    (keepId: string, sourceId: string, fields: { name: string; industry: string; summary: string; channel: string }) => {
      setOrgs(prev => {
        const keep = prev.find(org => org.id === keepId);
        const source = prev.find(org => org.id === sourceId);
        if (!keep || !source) return prev;
        const pursuitIds = [...new Set([...keep.pursuits, ...source.pursuits])];
        const activeScores = pursuitIds
          .map(id => allPursuits[id])
          .filter((pursuit): pursuit is Pursuit => pursuit !== undefined && !pursuit.closed)
          .map(pursuit => pursuit.score);
        const score = activeScores.length ? Math.max(...activeScores) : Math.max(keep.score, source.score);
        const merged = mergePipelineLeads({ keep, source, ...fields, score });
        return prev.filter(org => org.id !== sourceId).map(org => org.id === keepId ? merged : org);
      });
      setAllPursuits(prev => {
        const next = { ...prev };
        for (const pursuit of Object.values(next)) {
          if (pursuit.orgId === sourceId) next[pursuit.id] = { ...pursuit, orgId: keepId };
        }
        return next;
      });
      if (currentOrgId === sourceId) setCurrentOrgId(keepId);
    },
    [allPursuits, currentOrgId]
  );

  return (
    <OperatorProvider>
      <div className="flex flex-col h-dvh overflow-hidden">
      <TopBar
        activeView={activeView}
        onNav={handleNav}
        orgs={orgs}
        onAddPursuit={handleAddPursuit}
        onAddOrg={handleAddOrg}
        menuOpen={mobileNavOpen}
        onMenuToggle={() => setMobileNavOpen(open => !open)}
        currentOrgHasPursuits={pursuitNavEnabled}
        currentOrgId={currentOrgId}
        leadReturnView={leadReturnView}
      />

      <MobileNav
        open={mobileNavOpen}
        onClose={closeMobileNav}
        activeView={activeView}
        onNav={handleNav}
        currentOrgId={currentOrgId}
        laneFilter={laneFilter}
        onLaneFilter={setLaneFilter}
        onOrgSelect={handleOrgSelect}
        orgs={orgs.filter(o => !o.archived)}
        allPursuits={allPursuits}
        pursuitNavEnabled={pursuitNavEnabled}
        leadReturnView={leadReturnView}
      />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          currentOrgId={currentOrgId}
          laneFilter={laneFilter}
          onLaneFilter={setLaneFilter}
          onOrgSelect={handleOrgSelect}
          orgs={orgs.filter(o => !o.archived)}
          allPursuits={allPursuits}
        />

        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5 md:p-5 lg:p-6 oe-touch-scroll">
          <div className="max-w-[1200px] 2xl:max-w-[1400px] mx-auto w-full">
            {activeView === "dashboard" && (
              <DashboardView orgs={orgs} allPursuits={allPursuits} />
            )}
            {activeView === "search" && (
              <SearchView
                onAddOrg={handleAddOrg}
              />
            )}
            {activeView === "pipeline" && (
              <PipelineView
                laneFilter={laneFilter}
                onOrgSelect={handleOrgSelect}
                orgs={orgs}
                allPursuits={allPursuits}
                onAddPursuit={handleAddPursuit}
                onArchiveOrg={handleArchiveOrg}
                onRefreshAllScores={handleRefreshAllScores}
              />
            )}
            {activeView === "org" && currentOrg && (
              <OrgDetailView
                org={currentOrg}
                orgs={orgs}
                allPursuits={allPursuits}
                onPursuitSelect={handlePursuitSelect}
                onBack={() => setActiveView(leadReturnView)}
                onAddPursuit={handleAddPursuit}
                onArchiveOrg={handleArchiveOrg}
                onReinstateOrg={handleReinstateOrg}
                onUpdateOrg={handleUpdateOrg}
                onMergeLeads={handleMergeLeads}
              />
            )}
            {activeView === "decision" && selectedPursuit && currentOrg && (
              <OpportunityView
                pursuit={selectedPursuit}
                org={currentOrg}
                partners={partners}
                onBack={() => setActiveView("org")}
                onDraft={() => setActiveView("draft")}
                onConfirmDecision={handleConfirmDecision}
                onUpdatePursuit={handleUpdatePursuit}
              />
            )}
            {activeView === "decision" && (!selectedPursuit || !currentOrg) && (
              <div className="bg-card rounded-xl border shadow-sm px-6 py-16 text-center">
                <h2 className="text-base font-semibold text-foreground">Opportunity</h2>
                <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                  {currentOrg
                    ? `Select an opportunity on ${currentOrg.name} to open Opportunity and Response Builder.`
                    : "Select a lead, then choose an opportunity."}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveView(currentOrg ? "org" : "pipeline")}
                  className="mt-6 text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm"
                >
                  {currentOrg ? "Open Lead →" : "Open Pipeline →"}
                </button>
              </div>
            )}
            {activeView === "draft" && selectedPursuit?.rec === "go" && (
              <ResponseBuilderView
                key={selectedPursuit.id}
                pursuit={selectedPursuit}
                org={currentOrg}
                partners={partners}
                people={graph.people}
                experience={graph.experience}
                onBack={() => setActiveView("decision")}
                onUpdatePursuit={handleUpdatePursuit}
              />
            )}
            {activeView === "draft" && selectedPursuit?.rec !== "go" && (
              <ResponseBuilderEmptyState
                orgName={currentOrg?.name}
                onOpenOpportunity={() => setActiveView(selectedPursuit && currentOrg ? "decision" : currentOrg ? "org" : "pipeline")}
              />
            )}
            {activeView === "sources" && (
              <SourcesView
                partners={partners}
                graph={graph}
                allPursuits={allPursuits}
                onUpdatePartners={setPartners}
                onUpdateGraph={setGraph}
                onUpdatePursuit={handleUpdatePursuit}
                onArchivePartner={handleArchivePartner}
                onReinstatePartner={handleReinstatePartner}
              />
            )}
            {activeView === "archive" && (
              <ArchiveView
                orgs={orgs}
                partners={partners}
                allPursuits={allPursuits}
                onOrgSelect={(id) => handleOrgSelect(id, "archive")}
                onReinstateOrg={handleReinstateOrg}
                onReinstatePartner={handleReinstatePartner}
              />
            )}
            {activeView === "settings" && <SettingsView />}
          </div>
        </main>
      </div>
      </div>
    </OperatorProvider>
  );
}
