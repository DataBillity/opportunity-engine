"use client";

import { useState } from "react";
import type { Pursuit } from "@/lib/mock-data";

const sections = [
  { id: "tech", name: "Technical Approach", ref: "Vol I § 3.2", trace: "partial", tracePct: "92%" },
  { id: "past", name: "Past Performance", ref: "Vol I § 3.4", trace: "full", tracePct: "100%" },
  { id: "pers", name: "Key Personnel", ref: "Vol I § 3.5", trace: "full", tracePct: "—" },
  { id: "mgmt", name: "Management Plan", ref: "Vol I § 3.6", trace: "none", tracePct: "Not started" },
];

const draftContent: Record<string, string> = {
  tech: `The proposed technical approach leverages our team's direct experience migrating legacy mainframe benefits systems to modern cloud-native architectures. Our methodology, refined across two completed state-level unemployment insurance modernizations, addresses the core challenge of retiring a 30-year-old system while maintaining uninterrupted service delivery.

Our migration strategy employs a phased cutover approach that has achieved zero-downtime transitions in prior engagements. Data migration is led by Priya Nandakumar, who architected the equivalent pipeline on the Commonwealth engagement, ensuring continuity of expertise from the team's most directly relevant prior performance.

The fraud analytics component builds on our existing Benefits Fraud Analytics capability, applying supervised learning models trained on historical claims patterns to identify anomalous adjudication activity in real time. Quality assurance and compliance testing is overseen by Marcus Webb, drawing on his work certifying the Commonwealth system for production release.`,
  past: `Commonwealth Department of Labor — Claims Migration (2022–2024)

Retired a 25-year-old COBOL mainframe claims processing system, migrating 4.2M historical records to a cloud-native PostgreSQL-backed platform on AWS GovCloud. The project delivered zero-downtime cutover across three regional processing centers and reduced average claim processing time by 34%.

Key personnel overlap: Dana Whitfield (Program Manager) and Priya Nandakumar (Lead Data Architect) led this engagement and are proposed for equivalent roles on this program.`,
  pers: `Program Manager: Dana Whitfield, PMP — 12 years leading public-sector modernization programs.
Lead Data Architect: Priya Nandakumar — Architected the equivalent migration pipeline on two completed legacy mainframe retirements.
QA & Compliance Lead: Marcus Webb — Led certification testing for production release on the Commonwealth engagement.`,
  mgmt: "",
};

export function ResponseBuilderView({
  pursuit, onBack,
}: {
  pursuit: Pursuit; onBack: () => void;
}) {
  const [activeSection, setActiveSection] = useState("tech");

  return (
    <div>
      <div className="text-xs text-ink-soft mb-2">
        <button onClick={onBack} className="text-brand font-semibold cursor-pointer hover:underline bg-transparent border-none">
          ← Back to opportunity
        </button>
        {" / Response Builder — "}{pursuit.name}
      </div>

      <div className="flex gap-4 items-start">
        {/* Section nav */}
        <div className="w-[230px] shrink-0 border border-line bg-panel">
          <div className="px-3 py-2.5 text-[10.5px] text-ink-soft border-b border-line bg-[#FBFBF9]">
            Sections per compliance matrix (RFP-04)
          </div>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex justify-between items-center gap-2 w-full px-3 py-2.5 border-b border-line cursor-pointer text-left text-xs hover:bg-[#FAFAF7] ${
                activeSection === s.id ? "bg-brand-soft shadow-[inset_3px_0_0_var(--color-brand)]" : "bg-white"
              }`}
            >
              <div>
                <span className="block font-mono text-[10px] text-ink-soft">{s.ref}</span>
                <span className="font-semibold">{s.name}</span>
              </div>
              <span className={`font-mono text-[10.5px] px-1 py-px rounded-sm shrink-0 ${
                s.trace === "full" ? "bg-trace-soft text-trace" :
                s.trace === "partial" ? "bg-cond-soft text-cond" :
                "bg-[#EEEEE9] text-ink-soft"
              }`}>
                {s.tracePct}
              </span>
            </button>
          ))}
        </div>

        {/* Draft workspace */}
        <div className="flex-1 min-w-0">
          <div className="bg-panel border border-line border-b-0 px-4 py-2.5 text-xs flex items-center gap-2.5 flex-wrap">
            <span className="font-bold text-ink-soft text-[10.5px] uppercase tracking-wider">Referenced personnel</span>
            {["Priya Nandakumar", "Marcus Webb", "Dana Whitfield"].map(name => (
              <span key={name} className="flex items-center gap-1.5 border border-brand-soft bg-brand-soft px-2 py-0.5 rounded-full text-[11.5px] cursor-pointer">
                {name}
              </span>
            ))}
          </div>

          <div className="bg-panel border border-line p-6 font-serif text-[15px] leading-relaxed text-[#22242C] min-h-[220px]">
            <h4 className="font-sans text-xs uppercase tracking-wider text-ink-soft font-bold mb-3">
              {sections.find(s => s.id === activeSection)?.name}
            </h4>
            {draftContent[activeSection] ? (
              <div className="whitespace-pre-wrap">{draftContent[activeSection]}</div>
            ) : (
              <div className="text-ink-soft italic">
                This section has not been drafted yet. Click "Generate draft" to produce a grounded first pass from the compliance matrix requirements and matched capability nodes.
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 mt-3">
            {!draftContent[activeSection] && (
              <button className="text-xs font-semibold px-3.5 py-2 rounded-sm bg-brand border-brand text-white cursor-pointer hover:bg-[#233049]">
                Generate draft
              </button>
            )}
            <button className="text-xs font-semibold px-3.5 py-2 rounded-sm border border-line-strong bg-white text-ink cursor-pointer hover:bg-paper">
              Regenerate section
            </button>
            <button className="text-xs font-semibold px-3.5 py-2 rounded-sm border border-line-strong bg-white text-ink cursor-pointer hover:bg-paper">
              Check assertions
            </button>
            <button className="text-xs font-semibold px-3.5 py-2 rounded-sm bg-go border-go text-white cursor-pointer hover:bg-[#255A42]">
              Mark as reviewed
            </button>
          </div>
        </div>

        {/* Copilot panel */}
        <div className="w-[280px] shrink-0 border border-line bg-panel flex flex-col">
          <div className="px-3.5 py-3 border-b border-line">
            <h3 className="text-xs font-bold">Section Copilot</h3>
            <p className="text-[11px] text-ink-soft mt-1">Ask about the section, request changes, or check claims.</p>
          </div>
          <div className="p-3.5 flex flex-col gap-2 max-h-[280px] overflow-y-auto">
            <div className="self-start bg-[#F1F1EC] text-ink px-3 py-2 rounded text-xs leading-relaxed">
              <span className="text-[10px] uppercase tracking-wider text-trace font-bold block mb-0.5">System</span>
              Draft generated from 2 matched capability nodes and 4 experience references. 92% of assertions are source-traced.
            </div>
          </div>
          <div className="flex flex-col gap-1.5 px-3.5 pb-2.5">
            {["Strengthen the fraud analytics paragraph", "Add a risk mitigation section", "Which claims aren't source-traced?"].map(s => (
              <button key={s} className="text-[11.5px] px-2.5 py-1.5 border border-line-strong bg-white rounded-xl cursor-pointer hover:border-brand text-left">
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 px-3.5 py-2.5 border-t border-line">
            <input
              type="text"
              placeholder="Ask about this section…"
              className="flex-1 text-xs px-2.5 py-2 border border-line-strong"
            />
            <button className="text-xs font-semibold px-2.5 py-2 rounded-sm bg-brand border-brand text-white cursor-pointer">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
