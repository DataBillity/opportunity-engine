import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const rootEnv = resolve(repo, ".env.local");
if (!existsSync(rootEnv)) throw new Error(`Missing repo env file at ${rootEnv}`);
for (const line of readFileSync(rootEnv, "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!match) continue;
  process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const live = JSON.parse(readFileSync(resolve(here, "live-out.json"), "utf8"));
const draft = JSON.parse(readFileSync(resolve(here, "package-out.json"), "utf8"));
const extraction = live.extraction;
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`SELECT pursuits, revision FROM shared_workspace WHERE id = 'operator' LIMIT 1`;
const row = rows[0];
if (!row) throw new Error("No shared workspace");
const pursuits = row.pursuits;
const current = pursuits["OPP-2629"];
if (!current) throw new Error("OPP-2629 is not in the workspace");

const sections = draft.sections.map(section => ({
  id: section.id,
  ref: section.ref,
  title: section.title,
  body: section.body,
}));

current.projectType = "rfi";
current.typeLabel = "RFI";
current.lane = "B";
current.triageMode = "model";
current.dueDate = extraction.dueDate ?? current.dueDate;
current.solicitationRef = extraction.solicitationRef || current.solicitationRef;
current.docSummary = {
  objective: extraction.objective,
  challenges: extraction.challenges,
  services: extraction.services,
  deliverables: extraction.deliverables,
  responseConstraints: extraction.responseConstraints,
  rfi: extraction.rfiSummary,
  source: { engine: "model", model: `${live.provider} / ${live.modelVersion}` },
};
current.informationRequests = extraction.requirements.map(item => item.requirementText);
current.complianceMatrix = sections.map(section => ({
  ref: section.ref,
  title: section.title,
  sectionId: section.id,
}));
current.rfiResponse = {
  reviewerSummary: draft.reviewerSummary,
  strategicNotes: draft.strategicNotes,
  questions: draft.questions,
  compliance: draft.compliance,
  gaps: draft.gaps.map(gap => ({
    id: gap.id,
    location: gap.location,
    gapType: gap.gapType,
    description: gap.description,
    owner: gap.owner,
    priority: gap.priority,
    dueAt: gap.due,
    status: gap.status,
    notes: gap.notes,
  })),
  sections,
};
current.decisionRecord = {
  ...current.decisionRecord,
  model: `${draft.provider} / ${draft.modelVersion}`,
  action: draft.usedFallback ? "RFI shell saved for review" : "RFI response drafted for review",
};
pursuits["OPP-2629"] = current;

const updated = await sql`
  UPDATE shared_workspace
  SET pursuits = ${JSON.stringify(pursuits)}::jsonb, revision = revision + 1, updated_at = now()
  WHERE id = 'operator' AND revision = ${row.revision}
  RETURNING revision
`;
if (!updated[0]) throw new Error("Workspace changed while saving. Run again.");
console.log(JSON.stringify({
  revision: updated[0].revision,
  pursuit: "OPP-2629",
  challenges: current.docSummary.challenges.length,
  questions: current.docSummary.rfi.issuerQuestions.length,
  sections: sections.map(section => section.title),
  gaps: current.rfiResponse.gaps.length,
  usedFallback: draft.usedFallback,
  provider: draft.provider,
}));
