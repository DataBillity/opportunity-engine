import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { it } from "vitest";
import { ResponseDraftBriefing } from "@opportunity-engine/contracts";
import { generateRfiResponsePackage } from "@opportunity-engine/ai";

const roots = [process.cwd(), resolve(process.cwd(), ".."), resolve(process.cwd(), "../..")];
for (const root of roots) {
  for (const rel of [".env.local", "apps/web/.env.local"]) {
    const file = resolve(root, rel);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || match[1] === "GEMINI_API_KEY") continue;
      if (!process.env[match[1]!]) process.env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
    }
  }
}

const live = JSON.parse(readFileSync(new URL("./live-out.json", import.meta.url), "utf8"));
const extraction = live.extraction;

it("drafts the CalVCB RFI response from the saved summary", async () => {
  const sections = extraction.responseSections.map((section: { sectionId: string; ref: string; title: string }) => ({
    id: section.sectionId,
    name: section.title,
    ref: section.ref,
  }));
  const briefing = ResponseDraftBriefing.parse({
    section: sections[0],
    sections,
    mode: "package",
    projectType: "rfi",
    organization: { name: "California Victim Compensation Board", industry: "State government" },
    pursuit: {
      id: "OPP-2629",
      name: "CalVCB - Compensation and Restitution System Modernization",
      typeLabel: "RFI",
      solicitationRef: extraction.solicitationRef,
      dueDate: extraction.dueDate,
      documents: live.order,
      docSummary: {
        objective: extraction.objective,
        challenges: extraction.challenges,
        services: extraction.services,
        deliverables: extraction.deliverables,
        responseConstraints: extraction.responseConstraints,
        rfiSummary: extraction.rfiSummary,
      },
      informationRequests: extraction.requirements.map((item: { requirementText: string }) => item.requirementText),
    },
  });
  const draft = await generateRfiResponsePackage(briefing);
  writeFileSync(new URL("./package-out.json", import.meta.url), JSON.stringify({
    usedFallback: draft.usedFallback,
    provider: draft.provider,
    modelVersion: draft.modelVersion,
    reviewerSummary: draft.reviewerSummary,
    strategicNotes: draft.strategicNotes,
    questions: draft.questions,
    compliance: draft.compliance,
    gaps: draft.gaps,
    sections: draft.sections,
  }, null, 2));
}, 300_000);
