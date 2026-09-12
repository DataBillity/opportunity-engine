"use client";

import { useState } from "react";
import { graphData, partnerDirectory, getPartner } from "@/lib/mock-data";

type TabId = "capabilities" | "experience" | "credentials" | "people" | "partners";

export function SourcesView() {
  const [tab, setTab] = useState<TabId>("capabilities");

  const tabs: { id: TabId; label: string }[] = [
    { id: "capabilities", label: "Capabilities" },
    { id: "experience", label: "Experience" },
    { id: "credentials", label: "Credentials" },
    { id: "people", label: "People" },
    { id: "partners", label: "Partners" },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Capability Sources</h1>
      <p className="text-[13px] text-ink-soft mb-5">
        The Capability & Experience Graph — the single source of truth for what the consortium can deliver (I1, CEG-04).
      </p>

      <div className="flex gap-0.5 mb-3.5 border-b border-line">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`bg-none border-none px-3.5 py-2.5 text-xs font-semibold cursor-pointer border-b-2 transition-colors ${
              tab === t.id ? "text-brand border-brand" : "text-ink-soft border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "capabilities" && (
        <div className="bg-panel border border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#FBFBF9]">
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">ID</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Capability</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Owners</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Status</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Updated</th>
              </tr>
            </thead>
            <tbody>
              {graphData.capabilities.map(c => (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-brand">{c.id}</td>
                  <td className="px-3 py-2.5 text-xs font-semibold">{c.name}</td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft">{c.partners.map(id => getPartner(id)?.name ?? id).join(", ")}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-semibold ${c.status === "Verified" ? "text-go" : "text-cond"}`}>{c.status}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft">{c.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "experience" && (
        <div className="bg-panel border border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#FBFBF9]">
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">ID</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Experience</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Technologies</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Status</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Updated</th>
              </tr>
            </thead>
            <tbody>
              {graphData.experience.map(e => (
                <tr key={e.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-brand">{e.id}</td>
                  <td className="px-3 py-2.5 text-xs font-semibold">{e.name}</td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft">{e.technologies.join(", ")}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-semibold ${e.status === "Verified" ? "text-go" : "text-cond"}`}>{e.status}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft">{e.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "credentials" && (
        <div className="bg-panel border border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#FBFBF9]">
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">ID</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Credential</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Partner</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Expiration</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Status</th>
              </tr>
            </thead>
            <tbody>
              {graphData.credentials.map(c => (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-brand">{c.id}</td>
                  <td className="px-3 py-2.5 text-xs font-semibold">{c.name}</td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft">{getPartner(c.partner)?.name ?? c.partner}</td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft">{c.expiration}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-semibold ${c.status === "Verified" ? "text-go" : c.status.includes("Partner") ? "text-ink-soft" : "text-cond"}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "people" && (
        <div className="bg-panel border border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#FBFBF9]">
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">ID</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Name</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Role</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Expertise</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Status</th>
              </tr>
            </thead>
            <tbody>
              {graphData.people.map(p => (
                <tr key={p.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-brand">{p.id}</td>
                  <td className="px-3 py-2.5 text-xs font-semibold">{p.name}</td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft">{p.role}</td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft max-w-[400px] truncate">{p.expertise}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-semibold text-go">{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "partners" && (
        <div className="bg-panel border border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#FBFBF9]">
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Partner</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Type</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Teaming Agreement</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Gap Coverage</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Portal Access</th>
                <th className="text-left text-[10.5px] uppercase tracking-wider text-ink-soft font-semibold px-3 py-2 border-b border-line-strong">Status</th>
              </tr>
            </thead>
            <tbody>
              {partnerDirectory.map(p => (
                <tr key={p.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2.5 text-xs font-semibold">{p.name}</td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft">{p.type}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {p.teamingAgreementSigned === true ? <span className="text-go font-semibold">Signed</span> :
                     p.teamingAgreementSigned === false ? <span className="text-cond font-semibold">Pending</span> :
                     <span className="text-ink-soft">N/A</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft">{p.covers.length > 0 ? p.covers.join(", ") : "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft">{p.accessTier ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-semibold ${p.status === "Active" ? "text-go" : "text-ink-soft"}`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
