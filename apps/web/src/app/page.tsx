"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { Sidebar } from "@/components/layout/sidebar";
import { PipelineView } from "@/components/views/pipeline-view";
import { OpportunityView } from "@/components/views/opportunity-view";
import { OrgDetailView } from "@/components/views/org-detail-view";
import { SearchView } from "@/components/views/search-view";
import { SourcesView } from "@/components/views/sources-view";
import { ResponseBuilderView } from "@/components/views/response-builder-view";
import { organizations, pursuits, getOrgPursuits } from "@/lib/mock-data";

export type ViewId = "search" | "pipeline" | "org" | "decision" | "draft" | "sources";

export default function CommandCenter() {
  const [activeView, setActiveView] = useState<ViewId>("pipeline");
  const [currentOrgId, setCurrentOrgId] = useState("ORG-01");
  const [currentPursuitId, setCurrentPursuitId] = useState("OPP-2201");
  const [laneFilter, setLaneFilter] = useState("all");

  const currentOrg = organizations.find(o => o.id === currentOrgId);
  const currentPursuit = pursuits[currentPursuitId];

  function handleOrgSelect(orgId: string) {
    setCurrentOrgId(orgId);
    const org = organizations.find(o => o.id === orgId);
    if (!org) return;
    const active = getOrgPursuits(org);
    if (active.length === 1) {
      setCurrentPursuitId(active[0]!.id);
      setActiveView("decision");
    } else {
      setActiveView("org");
    }
  }

  function handlePursuitSelect(pursuitId: string) {
    setCurrentPursuitId(pursuitId);
    setActiveView("decision");
  }

  function handleNav(view: ViewId) {
    setActiveView(view);
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar activeView={activeView} onNav={handleNav} />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          currentOrgId={currentOrgId}
          laneFilter={laneFilter}
          onLaneFilter={setLaneFilter}
          onOrgSelect={handleOrgSelect}
        />

        <main className="flex-1 overflow-y-auto p-7">
          <div className="max-w-[1160px] mx-auto">
            {activeView === "search" && <SearchView />}
            {activeView === "pipeline" && (
              <PipelineView
                laneFilter={laneFilter}
                onOrgSelect={handleOrgSelect}
              />
            )}
            {activeView === "org" && currentOrg && (
              <OrgDetailView
                org={currentOrg}
                onPursuitSelect={handlePursuitSelect}
                onBack={() => setActiveView("pipeline")}
              />
            )}
            {activeView === "decision" && currentPursuit && currentOrg && (
              <OpportunityView
                pursuit={currentPursuit}
                org={currentOrg}
                onBack={() => setActiveView("pipeline")}
                onDraft={() => setActiveView("draft")}
              />
            )}
            {activeView === "draft" && currentPursuit && (
              <ResponseBuilderView
                pursuit={currentPursuit}
                onBack={() => setActiveView("decision")}
              />
            )}
            {activeView === "sources" && <SourcesView />}
          </div>
        </main>
      </div>
    </div>
  );
}
