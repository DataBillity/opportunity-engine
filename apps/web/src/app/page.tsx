"use client";

import { useState, useCallback, useEffect } from "react";
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
import { OperatorProvider } from "@/components/auth/operator-provider";
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

export type ViewId = "dashboard" | "search" | "pipeline" | "org" | "decision" | "draft" | "sources" | "settings";

function getOrgPursuitsFromState(org: Organization, allPursuits: Record<string, Pursuit>): Pursuit[] {
  return org.pursuits.map(pid => allPursuits[pid]).filter(Boolean) as Pursuit[];
}

function findDraftablePursuit(org: Organization | undefined, allPursuits: Record<string, Pursuit>): Pursuit | undefined {
  if (!org) return undefined;
  return getOrgPursuitsFromState(org, allPursuits).find(p => !p.closed && p.rec === "go");
}

export default function CommandCenter() {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [currentOrgId, setCurrentOrgId] = useState("ORG-01");
  const [currentPursuitId, setCurrentPursuitId] = useState("OPP-2201");
  const [laneFilter, setLaneFilter] = useState("all");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
  }, []);

  const currentOrg = orgs.find(o => o.id === currentOrgId);
  const currentPursuit = allPursuits[currentPursuitId];
  const currentOrgHasPursuits = currentOrg
    ? getOrgPursuitsFromState(currentOrg, allPursuits).filter(p => !p.closed).length > 0
    : false;

  function handleOrgSelect(orgId: string) {
    setCurrentOrgId(orgId);
    const org = orgs.find(o => o.id === orgId);
    if (!org) return;
    setActiveView("org");
    setMobileNavOpen(false);
  }

  function handlePursuitSelect(pursuitId: string) {
    setCurrentPursuitId(pursuitId);
    setActiveView("decision");
  }

  function handleNav(view: ViewId) {
    if (view === "draft") {
      const current = allPursuits[currentPursuitId];
      const currentIsDraftable =
        current?.rec === "go" && !current.closed && current.orgId === currentOrgId;
      if (!currentIsDraftable) {
        const draftable = findDraftablePursuit(currentOrg, allPursuits);
        if (draftable) setCurrentPursuitId(draftable.id);
      }
    }
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

  const handleAddOrgs = useCallback(
    (incoming: Organization[]) => {
      setOrgs(prev => mergeLeadOrganizations(prev, incoming));
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
        currentOrgHasPursuits={currentOrgHasPursuits}
        currentOrgId={currentOrgId}
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
                onAddOrgs={handleAddOrgs}
                onImportedLeads={() => {
                  setLaneFilter("A");
                  handleNav("pipeline");
                }}
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
                onBack={() => setActiveView("pipeline")}
                onAddPursuit={handleAddPursuit}
                onArchiveOrg={handleArchiveOrg}
                onUpdateOrg={handleUpdateOrg}
                onMergeLeads={handleMergeLeads}
              />
            )}
            {activeView === "decision" && currentPursuit && currentOrg && (
              <OpportunityView
                pursuit={currentPursuit}
                org={currentOrg}
                partners={partners}
                onBack={() => setActiveView("org")}
                onDraft={() => setActiveView("draft")}
                onConfirmDecision={handleConfirmDecision}
                onUpdatePursuit={handleUpdatePursuit}
              />
            )}
            {activeView === "draft" && currentPursuit?.rec === "go" && (
              <ResponseBuilderView
                key={currentPursuit.id}
                pursuit={currentPursuit}
                partners={partners}
                people={graph.people}
                onBack={() => setActiveView("decision")}
                onUpdatePursuit={handleUpdatePursuit}
              />
            )}
            {activeView === "draft" && currentPursuit?.rec !== "go" && (
              <ResponseBuilderEmptyState
                orgName={currentOrg?.name}
                onOpenOpportunity={() => setActiveView(currentPursuit && currentOrg ? "decision" : currentOrg ? "org" : "pipeline")}
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
