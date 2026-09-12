"use client";

import type { ViewId } from "@/app/page";

const navItems: { id: ViewId; label: string; group: number }[] = [
  { id: "search", label: "Search & Discovery", group: 1 },
  { id: "pipeline", label: "Pipeline", group: 1 },
  { id: "decision", label: "Opportunity", group: 2 },
  { id: "draft", label: "Response Builder", group: 2 },
  { id: "sources", label: "Capability Sources", group: 3 },
];

export function TopBar({ activeView, onNav }: { activeView: ViewId; onNav: (v: ViewId) => void }) {
  return (
    <header className="flex items-center gap-5 px-5 h-[52px] shrink-0 bg-brand text-white border-b border-[#1E2A3F]">
      <div className="font-semibold tracking-wide text-[14.5px] flex items-center gap-2 shrink-0">
        <span className="w-[7px] h-[7px] rounded-full bg-[#8FB3E8] inline-block" />
        Opportunity Engine
      </div>

      <nav className="flex gap-0.5 flex-1">
        {navItems.map((item, i) => (
          <span key={item.id} className="contents">
            {i > 0 && navItems[i - 1]!.group !== item.group && (
              <span className="w-px bg-white/20 mx-1 self-stretch my-2.5" />
            )}
            <button
              onClick={() => onNav(item.id)}
              className={`bg-transparent border-none text-[#C9D3E4] text-[13px] px-3 py-2 rounded cursor-pointer transition-colors whitespace-nowrap hover:bg-white/10 hover:text-white ${
                activeView === item.id ? "bg-white/15 text-white font-semibold" : ""
              }`}
            >
              {item.label}
            </button>
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-3 shrink-0">
        <button className="bg-white text-brand border-none font-bold text-xs px-3 py-[7px] rounded cursor-pointer hover:bg-[#E8ECF3]">
          + New Pursuit
        </button>
        <span className="font-mono text-[11px] text-[#B9C6DC] border border-white/25 px-2 py-0.5 rounded">
          DEMO POV
        </span>
        <div className="w-[26px] h-[26px] rounded-full bg-[#5A709A] text-white flex items-center justify-center text-[11.5px] font-semibold shrink-0">
          JT
        </div>
      </div>
    </header>
  );
}
