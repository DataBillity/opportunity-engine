"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import { useToast } from "@/components/ui/toast";
import { applyPartnerArchive, applyPartnerReinstate, computeSharedIds, setPartnerArchived } from "@/lib/partner-archive";
import { mergeWorkspace, sameWorkspace, type SharedWorkspace, type WorkspaceState } from "@/lib/shared-workspace";
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
import { rescorePipeline } from "@/lib/discovery-score";
import { applyDecision } from "@/lib/pursuit-assessment";
import {
  applySolicitationUpdate,
  approveProposedPlay,
  assessProposedPlay,
  composeConsortiumPlays,
  storeUpdatedPlay,
  type Play,
  type PlayBuilderInput,
  type PlayProposalInput,
  type SolicitationPlayEvent,
} from "@opportunity-engine/core";
import { solicitationEventFromPursuit, solicitationOutcomeFor } from "@/lib/play-updates";
import { ResponseJobsProvider } from "@/lib/response-jobs";

export type ViewId = "dashboard" | "search" | "pipeline" | "org" | "decision" | "draft" | "sources" | "archive" | "settings";

const LEGACY_BROWSER_KEYS = ["oe_orgs", "oe_pursuits", "oe_partners", "oe_graph"];

function workspaceFrom(
  organizations: Organization[],
  pursuits: Record<string, Pursuit>,
  partners: Partner[],
  graph: GraphData,
  plays: Play[] = [],
): WorkspaceState {
  return { organizations, pursuits, partners, graph, plays };
}

function playBuilderInput(partners: Partner[], graph: GraphData): PlayBuilderInput {
  return {
    partners: partners.map(partner => ({ id: partner.id, name: partner.name, type: partner.type })),
    capabilities: graph.capabilities,
    experiences: graph.experience,
    credentials: graph.credentials,
    people: graph.people,
  };
}

function getOrgPursuitsFromState(org: Organization, allPursuits: Record<string, Pursuit>): Pursuit[] {
  return org.pursuits.map(pid => allPursuits[pid]).filter(Boolean) as Pursuit[];
}

function orgPursuitsFromState(org: Organization | undefined, allPursuits: Record<string, Pursuit>): Pursuit[] {
  if (!org) return [];
  return getOrgPursuitsFromState(org, allPursuits);
}

export default function CommandCenter() {
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<ViewId>("pipeline");
  const [currentOrgId, setCurrentOrgId] = useState("ORG-01");
  const [currentPursuitId, setCurrentPursuitId] = useState<string | null>(null);
  const [leadReturnView, setLeadReturnView] = useState<"pipeline" | "archive">("pipeline");
  const [laneFilter, setLaneFilter] = useState("all");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [ready, setReady] = useState(false);
  const [orgs, setOrgs] = useState<Organization[]>(() => [...initialOrgs]);
  const [allPursuits, setAllPursuits] = useState<Record<string, Pursuit>>(() => ({ ...initialPursuits }));
  const [partners, setPartners] = useState<Partner[]>(() => [...initialPartners]);
  const [graph, setGraph] = useState<GraphData>(() => ({
    capabilities: [...initialGraph.capabilities],
    experience: [...initialGraph.experience],
    credentials: [...initialGraph.credentials],
    people: [...initialGraph.people],
  }));
  const [storedPlays, setStoredPlays] = useState<Play[]>([]);

  const revisionRef = useRef(0);
  const baselineRef = useRef<WorkspaceState | null>(null);
  const stateRef = useRef<WorkspaceState>(workspaceFrom(initialOrgs, initialPursuits, initialPartners, {
    capabilities: [...initialGraph.capabilities],
    experience: [...initialGraph.experience],
    credentials: [...initialGraph.credentials],
    people: [...initialGraph.people],
  }));
  const saveGen = useRef(0);
  const saveWarned = useRef(false);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const partnersRef = useRef(partners);
  partnersRef.current = partners;
  const orgsRef = useRef(orgs);
  orgsRef.current = orgs;
  const playsRef = useRef(storedPlays);
  playsRef.current = storedPlays;

  function applyWorkspace(next: WorkspaceState, revision: number, baseline: WorkspaceState) {
    revisionRef.current = revision;
    baselineRef.current = baseline;
    stateRef.current = next;
    setOrgs(next.organizations);
    setAllPursuits(next.pursuits);
    setPartners(next.partners);
    setGraph(next.graph);
    setStoredPlays(next.plays ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace")
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json() as Promise<SharedWorkspace>;
      })
      .then((data) => {
        if (cancelled) return;
        const loaded = workspaceFrom(data.organizations, data.pursuits, data.partners, data.graph, data.plays ?? []);
        applyWorkspace(loaded, data.revision, loaded);
        setReady(true);
        try {
          for (const key of LEGACY_BROWSER_KEYS) localStorage.removeItem(key);
        } catch {
          /* older browser copies are unused once the shared record loads */
        }
      })
      .catch(() => {
        if (cancelled) return;
        toast("Shared leads and partners could not be loaded. Changes on this screen will not reach other people until the connection recovers.", "error");
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    const current = workspaceFrom(orgs, allPursuits, partners, graph, storedPlays);
    stateRef.current = current;
    if (!ready) return;
    if (baselineRef.current && sameWorkspace(current, baselineRef.current)) return;

    const gen = ++saveGen.current;
    const timer = setTimeout(() => {
      void flushWorkspace(gen);
    }, 500);
    return () => clearTimeout(timer);
  }, [ready, orgs, allPursuits, partners, graph, storedPlays]);

  async function flushWorkspace(gen: number, isRetry = false) {
    const sent = stateRef.current;
    const sentRevision = revisionRef.current;
    let res: Response;
    try {
      res = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sent, revision: sentRevision }),
      });
    } catch {
      if (!saveWarned.current) {
        toast("Changes could not be saved for other people yet. They are still on this screen.", "error");
        saveWarned.current = true;
      }
      return;
    }

    if (res.status === 409 && !isRetry) {
      const server = await res.json() as SharedWorkspace;
      const serverState = workspaceFrom(server.organizations, server.pursuits, server.partners, server.graph, server.plays ?? []);
      const merged = mergeWorkspace(sent, baselineRef.current ?? sent, serverState);
      revisionRef.current = server.revision;
      baselineRef.current = serverState;
      if (!sameWorkspace(merged, stateRef.current)) {
        applyWorkspace(merged, server.revision, serverState);
        return;
      }
      stateRef.current = merged;
      await flushWorkspace(gen, true);
      return;
    }

    if (!res.ok) {
      if (!saveWarned.current) {
        toast("Changes could not be saved for other people yet. They are still on this screen.", "error");
        saveWarned.current = true;
      }
      return;
    }

    const saved = await res.json() as SharedWorkspace;
    if (gen !== saveGen.current) {
      if (saved.revision > revisionRef.current) revisionRef.current = saved.revision;
      return;
    }
    revisionRef.current = saved.revision;
    baselineRef.current = sent;
    saveWarned.current = false;
    if (gen === saveGen.current && !sameWorkspace(sent, stateRef.current)) {
      const follow = ++saveGen.current;
      void flushWorkspace(follow);
    }
  }

  useEffect(() => {
    if (!ready) return;
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
  }, [ready]);

  const currentOrg = orgs.find(o => o.id === currentOrgId);
  const currentPursuit = currentPursuitId ? allPursuits[currentPursuitId] : undefined;
  const selectedPursuit = currentPursuit?.orgId === currentOrgId ? currentPursuit : undefined;
  const orgPursuits = orgPursuitsFromState(currentOrg, allPursuits);
  const singlePursuitId = orgPursuits.length === 1 ? orgPursuits[0]!.id : null;
  const pursuitNavEnabled =
    orgPursuits.length === 1 || (orgPursuits.length > 1 && !!selectedPursuit);
  const consortiumPlays = useMemo(
    () => composeConsortiumPlays(playBuilderInput(partners, graph), storedPlays),
    [partners, graph, storedPlays],
  );

  const handleProposePlay = useCallback((input: PlayProposalInput) => {
    const assessed = assessProposedPlay(input, playBuilderInput(partnersRef.current, graphRef.current));
    setStoredPlays(prev => {
      let playId = assessed.playId;
      let n = 2;
      while (prev.some(play => play.playId === playId)) {
        playId = `${assessed.playId}-${n}`;
        n += 1;
      }
      return [...prev, { ...assessed, playId }];
    });
    const gapCount = assessed.coverageGaps.length;
    toast(
      `Proposed "${assessed.name}" — fit ${assessed.assessment?.fit ?? 0}${gapCount ? `, ${gapCount} coverage gap${gapCount === 1 ? "" : "s"}` : ""}.`,
      "success",
    );
  }, [toast]);

  const handleApprovePlay = useCallback((playId: string, approvedBy: string) => {
    setStoredPlays(prev => approveProposedPlay(prev, playId, approvedBy));
    toast("Play approved. It stays on the list when Partner records are rebuilt.", "success");
  }, [toast]);

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

  const recordSolicitation = useCallback((
    pursuit: Pursuit,
    outcome: SolicitationPlayEvent["outcome"],
    reason?: string,
  ) => {
    const org = orgsRef.current.find(item => item.id === pursuit.orgId);
    const event = solicitationEventFromPursuit(pursuit, org, outcome, reason);
    const composed = composeConsortiumPlays(
      playBuilderInput(partnersRef.current, graphRef.current),
      playsRef.current,
    );
    const result = applySolicitationUpdate(composed, event);
    if (!result.matchedPlayId) {
      toast(`No consortium play matched "${pursuit.name}". The Plays list was left unchanged.`, "warning");
      return;
    }
    const matched = result.plays.find(play => play.playId === result.matchedPlayId);
    if (!matched) return;
    setStoredPlays(prev => storeUpdatedPlay(prev, matched));
    toast(`Updated play "${matched.name}" from ${pursuit.typeLabel} "${pursuit.name}" (${outcome}).`, "success");
  }, [toast]);

  const handleConfirmDecision = useCallback(
    (pursuitId: string, decision: "go" | "nogo", meta: { reason: string; reviewer: string }) => {
      const captured: { pursuit: Pursuit | null } = { pursuit: null };
      setAllPursuits(prev => {
        const p = prev[pursuitId];
        if (!p) return prev;
        const next = { ...p, ...applyDecision(p, decision, meta) };
        captured.pursuit = next;
        return { ...prev, [pursuitId]: next };
      });
      const pursuit = captured.pursuit;
      if (pursuit && decision === "nogo" && pursuit.draftStatus !== "Submitted" && !pursuit.outcome) {
        recordSolicitation(pursuit, "no-bid", meta.reason);
      }
    },
    [recordSolicitation]
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

  const handleDeletePursuit = useCallback(
    (pursuitId: string) => {
      const removed = allPursuits[pursuitId];
      if (!removed) return;
      setAllPursuits(prev => {
        const next = { ...prev };
        delete next[pursuitId];
        return next;
      });
      setOrgs(prev => prev.map(org => {
        if (!org.pursuits.includes(pursuitId)) return org;
        const pursuits = org.pursuits.filter(id => id !== pursuitId);
        const openScores = pursuits
          .map(id => allPursuits[id])
          .filter((item): item is Pursuit => item !== undefined && !item.closed)
          .map(item => item.score);
        return {
          ...org,
          pursuits,
          score: openScores.length ? Math.max(...openScores) : org.score,
        };
      }));
      setCurrentPursuitId(prev => (prev === pursuitId ? null : prev));
      setActiveView(prev => (prev === "decision" || prev === "draft") && currentPursuitId === pursuitId ? "org" : prev);
    },
    [allPursuits, currentPursuitId],
  );

  const handleUpdatePursuit = useCallback(
    (pursuitId: string, updates: Partial<Pursuit>) => {
      const captured: { pursuit: Pursuit | null; outcome: SolicitationPlayEvent["outcome"] | null } = {
        pursuit: null,
        outcome: null,
      };
      setAllPursuits(prev => {
        const p = prev[pursuitId];
        if (!p) return prev;
        const next = { ...p, ...updates };
        captured.pursuit = next;
        captured.outcome = solicitationOutcomeFor(p, updates);
        return { ...prev, [pursuitId]: next };
      });
      if (captured.pursuit && captured.outcome) recordSolicitation(captured.pursuit, captured.outcome);
    },
    [recordSolicitation]
  );

  const handleApplyToPursuit = useCallback(
    (pursuitId: string, apply: (pursuit: Pursuit) => Partial<Pursuit>) => {
      setAllPursuits(prev => {
        const p = prev[pursuitId];
        if (!p) return prev;
        return { ...prev, [pursuitId]: { ...p, ...apply(p) } };
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
      const shared = computeSharedIds(graphRef.current, partnerId);
      setPartners(prev => setPartnerArchived(prev, partnerId, true, shared.capIds, shared.expIds));
      setGraph(prev => applyPartnerArchive(prev, partnerId));
    },
    []
  );

  const handleReinstatePartner = useCallback(
    (partnerId: string) => {
      const partner = partnersRef.current.find(p => p.id === partnerId);
      const sharedCapIds = partner?._sharedCapIds ?? [];
      const sharedExpIds = partner?._sharedExpIds ?? [];
      setPartners(prev => setPartnerArchived(prev, partnerId, false));
      setGraph(prev => applyPartnerReinstate(prev, partnerId, sharedCapIds, sharedExpIds));
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
      setOrgs(prev => rescorePipeline(prev, graphRef.current));
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
      <ResponseJobsProvider onApply={handleApplyToPursuit}>
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
                graph={graph}
                pipelineOrgs={orgs}
                partners={partners}
                plays={consortiumPlays}
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
                onUpdateOrg={handleUpdateOrg}
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
                onDeletePursuit={handleDeletePursuit}
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
                graph={graph}
                onBack={() => setActiveView("org")}
                onDraft={() => setActiveView("draft")}
                onConfirmDecision={handleConfirmDecision}
                onUpdatePursuit={handleUpdatePursuit}
                onDeletePursuit={handleDeletePursuit}
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
                capabilities={graph.capabilities
                  .filter(item => item.status !== "Archived" && (
                    !selectedPursuit.includedPartnerIds
                    || item.partners.length === 0
                    || item.partners.some(id => selectedPursuit.includedPartnerIds!.includes(id))
                  ))
                  .map(item => item.name)}
                graph={graph}
                onBack={() => setActiveView("decision")}
                onUpdatePursuit={handleUpdatePursuit}
                onApplyToPursuit={handleApplyToPursuit}
              />
            )}
            {activeView === "draft" && selectedPursuit?.rec !== "go" && (
              <ResponseBuilderEmptyState
                orgName={currentOrg?.name}
                projectType={selectedPursuit?.projectType}
                onOpenOpportunity={() => setActiveView(selectedPursuit && currentOrg ? "decision" : currentOrg ? "org" : "pipeline")}
              />
            )}
            {activeView === "sources" && (
              <SourcesView
                partners={partners}
                graph={graph}
                allPursuits={allPursuits}
                plays={consortiumPlays}
                onUpdatePartners={setPartners}
                onUpdateGraph={setGraph}
                onUpdatePursuit={handleUpdatePursuit}
                onProposePlay={handleProposePlay}
                onApprovePlay={handleApprovePlay}
                onArchivePartner={handleArchivePartner}
                onReinstatePartner={handleReinstatePartner}
              />
            )}
            {activeView === "archive" && (
              <ArchiveView
                orgs={orgs}
                partners={partners}
                graph={graph}
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
      </ResponseJobsProvider>
    </OperatorProvider>
  );
}
