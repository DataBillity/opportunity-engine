import {
  parseRfpProposalPart,
  type ProposalGap,
  type RfpProposal,
  type RfpProposalRecord,
} from "@opportunity-engine/contracts";
import type { RfpProposalSources } from "@opportunity-engine/ai";
import {
  batchProposalSections,
  complianceWithStatus,
  gapNumber,
  mergeProposalParts,
  proposalPlatformChecks,
  reconcileRfpProposal,
  renumberPartGaps,
  summarizeRfpProposal,
} from "@opportunity-engine/core";
import type { GraphData, Partner, Pursuit, RfiGapLogItem, RfiResponseMeta } from "@/lib/mock-data";
import { gapLogRows, gapsToActionItems, mergeRegeneratedGaps } from "@/lib/gap-log";
import { htmlToPlainText, isEmptyRichText, markdownToHtml } from "@/lib/rich-text";
import { buildRfpProposalSources, primePartnerOf, ProposalSourcesError } from "@/lib/rfp-proposal-sources";
import { COVER_LETTER_ID, responseSignature } from "@/lib/response-generation";
import type { ResponseJobOutcome } from "@/lib/response-jobs";

export interface RfpProposalContext {
  pursuit: Pursuit;
  partners: Partner[];
  graph: GraphData;
  assignments: Record<string, string>;
  /** Section drafts (HTML) as the user sees them when the job starts. */
  drafts: Record<string, string>;
}

interface StepReply {
  part: RfpProposal;
  provider: string;
  modelVersion: string;
  promptVersion: string;
}

type StepBody = {
  step: "plan" | "sections" | "forms" | "compliance" | "review";
  sources: RfpProposalSources;
  plan?: RfpProposal;
  draft?: RfpProposal;
  sectionIds?: string[];
  existingDrafts?: Record<string, string>;
  nextGapNumber?: number;
};

const STEP_NAMES: Record<StepBody["step"], string> = {
  plan: "Planning",
  sections: "Section drafting",
  forms: "Forms",
  compliance: "Compliance matrix",
  review: "Consistency review",
};

/** The route's reply, read as text first: a host timeout returns a plain-text page, not JSON. */
async function postStep(body: StepBody): Promise<StepReply> {
  const res = await fetch("/api/response/rfp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data: { part?: unknown; provider?: string; modelVersion?: string; promptVersion?: string; error?: string } = {};
  try {
    data = JSON.parse(raw);
  } catch {
    const timedOut = res.status === 504 || /timed out|FUNCTION_INVOCATION_TIMEOUT/i.test(raw);
    throw new Error(timedOut ? "took longer than the server allows" : `unreadable server reply (HTTP ${res.status})`);
  }
  if (!res.ok || !data.part) throw new Error(data.error || `HTTP ${res.status}`);
  return {
    part: parseRfpProposalPart(data.part),
    provider: data.provider ?? "model",
    modelVersion: data.modelVersion ?? "",
    promptVersion: data.promptVersion ?? "",
  };
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : "failed";
}

function editedByHand(letter: Pursuit["coverLetter"]): boolean {
  return Boolean(letter?.editedAt && (!letter.generatedAt || letter.editedAt > letter.generatedAt));
}

export function isCoverProposalSection(section: { id: string; heading: string }): boolean {
  return section.id === "cover" || /^cover (letter|page)\b/i.test(section.heading.trim());
}

function toGapItem(gap: ProposalGap, prior?: RfiGapLogItem): RfiGapLogItem {
  return {
    id: gap.id,
    location: gap.location,
    gapType: gap.type,
    description: gap.description,
    owner: gap.owner,
    priority: gap.priority,
    dueAt: gap.due,
    status: prior?.status === "In progress" ? "In progress" : "Open",
    notes: gap.notes,
  };
}

function toProposalGap(gap: RfiGapLogItem): ProposalGap {
  return {
    id: gap.id,
    location: gap.location,
    type: gap.gapType as ProposalGap["type"],
    description: gap.description,
    owner: gap.owner,
    priority: gap.priority,
    due: gap.dueAt,
    notes: gap.notes,
  };
}

/** Ids already on the Gap Log: open ones keep their number, and no new gap reuses any of them. */
function existingGapIds(pursuit: Pursuit, partners: Partner[]) {
  const rows = gapLogRows(pursuit, partners);
  const ids = [...rows.map(row => row.id), ...(pursuit.rfpProposal?.gapLog.map(gap => gap.id) ?? [])];
  const max = Math.max(0, ...ids.filter(id => /^GAP-\d+$/.test(id)).map(gapNumber));
  return {
    open: new Set(rows.filter(row => row.status !== "Resolved").map(row => row.id)),
    firstFresh: max + 1,
  };
}

/** Undated gaps are due by the question deadline when the RFP sets one, otherwise by the due date. */
function fallbackDue(pursuit: Pursuit): string {
  const dates = pursuit.goNoGo?.opportunity.keyDates ?? [];
  const questions = dates.find(row => /question|inquir|clarif/i.test(row.event));
  return questions?.date || pursuit.dueDate || "";
}

function plainDrafts(drafts: Record<string, string>, ids: string[]): Record<string, string> {
  return Object.fromEntries(
    ids.filter(id => !isEmptyRichText(drafts[id])).map(id => [id, htmlToPlainText(drafts[id] ?? "")]),
  );
}

/**
 * The draft as it stands in the editor: section text from the editor (or the cover letter),
 * the Gap Log from the pursuit, and compliance status and platform checks recomputed from both.
 */
export function liveProposal(
  record: RfpProposalRecord,
  drafts: Record<string, string>,
  coverHtml: string,
  gaps: RfiGapLogItem[] | undefined,
): RfpProposal {
  const sections = record.sections.map(section => {
    const html = isCoverProposalSection(section) ? coverHtml : drafts[section.id];
    return html === undefined ? section : { ...section, content: htmlToPlainText(html) };
  });
  const base: RfpProposal = {
    ...record,
    sections,
    gapLog: gaps ? gaps.filter(gap => gap.status !== "Resolved").map(toProposalGap) : record.gapLog,
  };
  const withStatus = { ...base, complianceMatrix: complianceWithStatus(base) };
  return {
    ...withStatus,
    consistencyChecks: [
      ...record.consistencyChecks.filter(check => check.source !== "platform"),
      ...proposalPlatformChecks(withStatus),
    ],
  };
}

function packetFor(proposal: RfpProposal, primeName: string | undefined, gaps: RfiGapLogItem[], sections: RfpProposal["sections"]): RfiResponseMeta {
  return {
    reviewerSummary: summarizeRfpProposal(proposal, primeName),
    strategicNotes: proposal.winThemes.map(theme => `${theme.theme}: ${theme.discriminator || theme.customerNeed}`).join("\n"),
    questions: proposal.issuerQuestions.map(question => question.question),
    compliance: proposal.complianceMatrix.map(row => ({
      requirement: row.requirement,
      rfiRef: row.cite,
      responseSection: row.answeredIn,
      owner: row.owner,
      status: row.status,
    })),
    gaps,
    sections: sections.map(section => ({ id: section.id, ref: section.rfpRef, title: section.heading, body: section.content })),
  };
}

/**
 * The whole proposal: plan, then sections, forms, and compliance in parallel, then a consistency review.
 * The platform numbers gaps in order of appearance and keeps placeholders and the Gap Log in step.
 */
export async function runRfpProposalJob(ctx: RfpProposalContext, progress: (label: string) => void): Promise<ResponseJobOutcome> {
  let sources: RfpProposalSources;
  try {
    sources = buildRfpProposalSources(ctx);
  } catch (err) {
    const message = err instanceof ProposalSourcesError ? err.message : "The proposal sources could not be built.";
    return { message, toast: message, tone: "warning" };
  }
  const prime = primePartnerOf(ctx.partners);
  const existing = existingGapIds(ctx.pursuit, ctx.partners);
  const counter = { next: existing.firstFresh };
  const warnings: string[] = [];
  if (!prime) warnings.push("No Partner is registered as Prime, so Prime-owned items are assigned to \"Prime\".");
  if (ctx.pursuit.sourceTextTruncated) warnings.push("The RFP text on file was truncated at upload; requirements past the cut were not seen.");

  progress("Planning the proposal structure");
  let planReply: StepReply;
  try {
    planReply = await postStep({ step: "plan", sources, nextGapNumber: counter.next });
  } catch (err) {
    const message = `The proposal could not be planned: ${reason(err)}. Nothing was changed.`;
    return { message, toast: "Proposal draft failed — nothing was changed", tone: "error" };
  }
  const plan = renumberPartGaps(planReply.part, existing.open, counter);
  const planKeep = new Set([...existing.open, ...plan.gapLog.map(gap => gap.id)]);

  // Browsers queue past about six requests to one host, and forms and compliance run alongside.
  const batches = batchProposalSections(plan.sections, { maxBatches: 6 });
  const total = batches.length + 2;
  let done = 0;
  const tick = () => progress(`Drafting the proposal: ${++done} of ${total} parts done`);
  progress(`Drafting ${plan.sections.length} sections, the forms, and the compliance matrix`);

  const draftBatch = (sectionIds: string[]) => postStep({
    step: "sections",
    sources,
    plan,
    sectionIds,
    existingDrafts: plainDrafts(ctx.drafts, sectionIds),
    nextGapNumber: counter.next,
  });
  const track = <T,>(promise: Promise<T>) => promise.finally(tick);
  const [sectionResults, formsResult, complianceResult] = await Promise.all([
    Promise.allSettled(batches.map(ids => track(draftBatch(ids)))),
    Promise.allSettled([track(postStep({ step: "forms", sources, plan, nextGapNumber: counter.next }))]).then(([result]) => result!),
    Promise.allSettled([track(postStep({ step: "compliance", sources, plan }))]).then(([result]) => result!),
  ]);

  // One more try for section batches that failed, so a transient error doesn't leave sections empty.
  const retryIds = batches.filter((_, i) => sectionResults[i]!.status === "rejected");
  let retried: PromiseSettledResult<StepReply>[] = [];
  if (retryIds.length) {
    progress(`Retrying ${retryIds.length} section batch${retryIds.length === 1 ? "" : "es"}`);
    retried = await Promise.allSettled(retryIds.map(draftBatch));
  }
  let retryIndex = 0;
  const sectionParts: RfpProposal[] = [];
  batches.forEach((ids, i) => {
    const first = sectionResults[i]!;
    const outcome = first.status === "fulfilled" ? first : retried[retryIndex++]!;
    if (outcome.status === "fulfilled") sectionParts.push(renumberPartGaps(outcome.value.part, planKeep, counter));
    else warnings.push(`Sections ${ids.join(", ")} were not drafted (${reason(outcome.reason)}); each holds a placeholder.`);
  });
  const forms = formsResult.status === "fulfilled" ? renumberPartGaps(formsResult.value.part, planKeep, counter) : undefined;
  if (formsResult.status === "rejected") warnings.push(`${STEP_NAMES.forms} not completed (${reason(formsResult.reason)}). Regenerate before review.`);
  const compliance = complianceResult.status === "fulfilled" ? complianceResult.value.part : undefined;
  if (complianceResult.status === "rejected") warnings.push(`${STEP_NAMES.compliance} not built (${reason(complianceResult.reason)}).`);

  const merged = mergeProposalParts({ plan, sections: sectionParts, forms, compliance });
  const { proposal: reconciled, report } = reconcileRfpProposal(merged, {
    primeName: prime?.name,
    fallbackDue: fallbackDue(ctx.pursuit),
    keep: existing.open,
    firstFresh: existing.firstFresh,
  });
  if (report.placeholdersLogged.length) warnings.push(`Logged ${report.placeholdersLogged.length} placeholder${report.placeholdersLogged.length === 1 ? "" : "s"} the model left off the Gap Log.`);

  progress("Checking the draft for consistency");
  let modelChecks: RfpProposal["consistencyChecks"] = [];
  try {
    modelChecks = (await postStep({ step: "review", sources, draft: reconciled })).part.consistencyChecks;
  } catch (err) {
    warnings.push(`${STEP_NAMES.review} not run (${reason(err)}); only the platform checks are shown.`);
  }
  const proposal: RfpProposal = {
    ...reconciled,
    consistencyChecks: [...modelChecks.map(check => ({ ...check, source: "model" as const })), ...proposalPlatformChecks(reconciled)],
  };
  const record: RfpProposalRecord = {
    ...proposal,
    meta: {
      generatedAt: new Date().toISOString(),
      provider: planReply.provider,
      modelVersion: planReply.modelVersion,
      promptVersion: planReply.promptVersion,
      warnings,
    },
  };

  const cover = proposal.sections.find(isCoverProposalSection);
  const bodySections = proposal.sections.filter(section => section !== cover);
  const sectionDrafts = Object.fromEntries(bodySections.map(section => [section.id, markdownToHtml(section.content)]));
  const keptLetter = editedByHand(ctx.pursuit.coverLetter);
  const letterHtml = cover?.content.trim() ? markdownToHtml(cover.content) : "";

  const apply = (p: Pursuit): Partial<Pursuit> => {
    const priorGaps = p.rfiResponse?.gaps ?? [];
    const priorById = new Map(priorGaps.map(gap => [gap.id, gap]));
    const incoming = proposal.gapLog.map(gap => toGapItem(gap, priorById.get(gap.id)));
    const mergedGaps = mergeRegeneratedGaps(priorGaps, incoming, p.responseActionItems);
    const gapIds = new Set(mergedGaps.gaps.map(gap => gap.id));
    const priorGapIds = new Set(priorGaps.map(gap => gap.id));
    const standalone = (p.responseActionItems ?? []).filter(item => !gapIds.has(item.id) && !priorGapIds.has(item.id));
    const letterEdited = keptLetter || editedByHand(p.coverLetter);
    const nextDrafts = { ...(p.responseDrafts ?? {}), ...sectionDrafts };
    return {
      rfpProposal: record,
      rfiResponse: packetFor(proposal, prime?.name, mergedGaps.gaps, bodySections),
      responseActionItems: [...gapsToActionItems(mergedGaps.gaps, ctx.partners, p.responseActionItems), ...standalone],
      complianceMatrix: bodySections.map(section => ({ ref: section.rfpRef || section.heading, title: section.heading, sectionId: section.id })),
      responseDrafts: nextDrafts,
      ...(letterHtml && !letterEdited
        ? {
          coverLetter: {
            body: letterHtml,
            generatedAt: record.meta.generatedAt,
            provider: record.meta.provider,
            sourceSignature: responseSignature(
              bodySections.map(section => ({ id: section.id, name: section.heading, ref: section.rfpRef })),
              nextDrafts,
            ),
          },
        }
        : {}),
    };
  };

  const open = proposal.gapLog.length;
  const primeOwned = proposal.gapLog.filter(gap => gap.owner === (prime?.name ?? "Prime")).length;
  const failed = proposal.consistencyChecks.filter(check => check.result === "fail").length;
  const partial = warnings.some(line => /not drafted|not completed|not built/.test(line));
  return {
    apply,
    sectionIds: [...Object.keys(sectionDrafts), ...(letterHtml && !keptLetter ? [COVER_LETTER_ID] : [])],
    hints: { tracePct: planReply.provider },
    message: [
      `Proposal drafted via ${planReply.provider}: ${bodySections.length} sections, ${proposal.forms.length} forms, ${open} Gap Log item${open === 1 ? "" : "s"} (${primeOwned} for ${prime?.name ?? "the Prime"}).`,
      failed ? `${failed} consistency check${failed === 1 ? "" : "s"} failed.` : "",
      keptLetter && letterHtml ? "Your edited cover letter was kept." : "",
      ...warnings,
    ].filter(Boolean).join(" "),
    toast: partial ? "Proposal drafted with parts missing — see the Gap Log" : "Proposal drafted for review",
    tone: partial || failed ? "warning" : "success",
  };
}

/** One section redrafted against the saved plan. Its gaps join the Gap Log; nothing else changes. */
export async function runRfpSectionJob(ctx: RfpProposalContext, sectionId: string): Promise<ResponseJobOutcome> {
  const record = ctx.pursuit.rfpProposal;
  const planned = record?.sections.find(section => section.id === sectionId);
  if (!record || !planned) {
    const message = "This section is not in the proposal plan. Generate the proposal first.";
    return { message, toast: message, tone: "warning" };
  }
  let sources: RfpProposalSources;
  try {
    sources = buildRfpProposalSources(ctx);
  } catch (err) {
    const message = err instanceof ProposalSourcesError ? err.message : "The proposal sources could not be built.";
    return { message, toast: message, tone: "warning" };
  }
  const prime = primePartnerOf(ctx.partners);
  const existing = existingGapIds(ctx.pursuit, ctx.partners);
  const counter = { next: existing.firstFresh };

  let reply: StepReply;
  try {
    reply = await postStep({
      step: "sections",
      sources,
      plan: record,
      sectionIds: [sectionId],
      existingDrafts: plainDrafts(ctx.drafts, [sectionId]),
      nextGapNumber: counter.next,
    });
  } catch (err) {
    const message = `"${planned.heading}" was not redrafted: ${reason(err)}.`;
    return { message, toast: message, tone: "warning" };
  }
  const part = renumberPartGaps(reply.part, existing.open, counter);
  const content = part.sections.find(section => section.id === sectionId)?.content ?? "";
  const single: RfpProposal = {
    ...parseRfpProposalPart({}),
    sections: [{ ...planned, content }],
    gapLog: part.gapLog,
  };
  const { proposal: reconciled } = reconcileRfpProposal(single, {
    primeName: prime?.name,
    fallbackDue: fallbackDue(ctx.pursuit),
    keep: new Set([...existing.open, ...part.gapLog.map(gap => gap.id)]),
    firstFresh: counter.next,
  });
  const section = reconciled.sections[0]!;
  const html = markdownToHtml(section.content);
  const newGaps = reconciled.gapLog;

  const apply = (p: Pursuit): Partial<Pursuit> => {
    const prior = p.rfiResponse?.gaps ?? [];
    const priorById = new Map(prior.map(gap => [gap.id, gap]));
    const resolved = new Set(prior.filter(gap => gap.status === "Resolved").map(gap => gap.id));
    const fresh = newGaps.filter(gap => !resolved.has(gap.id)).map(gap => toGapItem(gap, priorById.get(gap.id)));
    const gaps = [...prior.filter(gap => !fresh.some(next => next.id === gap.id)), ...fresh];
    const gapIds = new Set(gaps.map(gap => gap.id));
    const standalone = (p.responseActionItems ?? []).filter(item => !gapIds.has(item.id));
    const saved = p.rfpProposal;
    const nextRecord: RfpProposalRecord | undefined = saved && {
      ...saved,
      sections: saved.sections.map(item => (item.id === sectionId ? section : item)),
      gapLog: [...saved.gapLog.filter(gap => !newGaps.some(next => next.id === gap.id)), ...newGaps]
        .sort((a, b) => gapNumber(a.id) - gapNumber(b.id)),
    };
    const updates: Partial<Pursuit> = {
      responseDrafts: { ...(p.responseDrafts ?? {}), [sectionId]: html },
      responseActionItems: [...gapsToActionItems(gaps, ctx.partners, p.responseActionItems), ...standalone],
      ...(nextRecord ? { rfpProposal: nextRecord } : {}),
    };
    if (p.rfiResponse) updates.rfiResponse = { ...p.rfiResponse, gaps };
    return updates;
  };

  return {
    apply,
    sectionIds: [sectionId],
    hints: { tracePct: reply.provider, reviewOthers: true },
    message: `"${planned.heading}" redrafted via ${reply.provider}.${newGaps.length ? ` ${newGaps.length} placeholder${newGaps.length === 1 ? "" : "s"} on the Gap Log.` : ""} Rerun the full draft to refresh the consistency review.`,
    toast: `"${planned.heading}" redrafted`,
    tone: "success",
  };
}
