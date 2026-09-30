import type {
  GraphExperience,
  GraphPerson,
  Organization,
  Partner,
  Pursuit,
  PursuitCoverLetter,
  RfiGapLogItem,
  RfiResponseMeta,
} from "@/lib/mock-data";
import { buildResponseDraftBriefing } from "@/lib/response-draft-briefing";
import { gapsToActionItems, mergeRegeneratedGaps } from "@/lib/gap-log";
import { htmlToPlainText, isEmptyRichText, plainTextToHtml } from "@/lib/rich-text";
import type { ResponseJobOutcome } from "@/lib/response-jobs";

export const COVER_LETTER_ID = "__cover_letter";
/** Keep in step with COVER_LETTER_MAX_WORDS in @opportunity-engine/ai (one printed page). */
export const COVER_LETTER_MAX_WORDS = 420;

export interface SectionRef {
  id: string;
  name: string;
  ref: string;
}

export interface GenerationContext {
  pursuit: Pursuit;
  org?: Organization;
  partners?: Partner[];
  people: GraphPerson[];
  experience?: GraphExperience[];
  capabilities?: string[];
  assignments: Record<string, string>;
  sections: SectionRef[];
  /** Section drafts (HTML) as the user sees them when the job starts. */
  drafts: Record<string, string>;
  signatory?: { name?: string; title?: string; email?: string };
  packageLabel: string;
}

interface DraftGap {
  id: string;
  location: string;
  gapType: string;
  description: string;
  owner: string;
  priority: string;
  due: string;
  status: string;
  notes: string;
}

interface DraftApiResponse {
  kind?: "section" | "package" | "cover_letter";
  body?: string;
  gaps?: DraftGap[];
  reviewerSummary?: string;
  strategicNotes?: string;
  questions?: string[];
  compliance?: RfiResponseMeta["compliance"];
  sections?: { id: string; ref: string; title: string; body: string }[];
  provider?: "claude" | "gemini";
  modelVersion?: string;
  insights?: { id: string }[];
  usedFallback?: boolean;
  wordCount?: number;
  error?: string;
  hint?: string;
}

/**
 * Read the generate route's reply without assuming it is JSON. When the host kills the
 * function (timeout, crash) it returns a plain-text page, and res.json() would surface
 * as "Unexpected token 'A', "An error o"... is not valid JSON".
 */
async function readDraftResponse(res: Response): Promise<DraftApiResponse> {
  const raw = await res.text();
  try {
    return JSON.parse(raw) as DraftApiResponse;
  } catch {
    const timedOut = res.status === 504 || /timed out|FUNCTION_INVOCATION_TIMEOUT/i.test(raw);
    return {
      error: timedOut
        ? "The draft took longer than the server allows and was cut off. Nothing was saved. Try again; if it repeats, generate one section at a time."
        : `The server returned an unreadable response (HTTP ${res.status}). Try again in a moment.`,
    };
  }
}

async function postBriefing(briefing: unknown): Promise<{ ok: boolean; data: DraftApiResponse }> {
  const res = await fetch("/api/response/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ briefing }),
  });
  return { ok: res.ok, data: await readDraftResponse(res) };
}

function asGapPriority(value: string): RfiGapLogItem["priority"] {
  if (value === "High" || value === "Low") return value;
  return "Medium";
}

function asGapStatus(value: string): RfiGapLogItem["status"] {
  if (value === "Resolved" || value === "In progress") return value;
  return "Open";
}

function toGapItems(gaps: DraftGap[]): RfiGapLogItem[] {
  return gaps.map(gap => ({
    id: gap.id,
    location: gap.location,
    gapType: gap.gapType,
    description: gap.description,
    owner: gap.owner || "Prime",
    priority: asGapPriority(gap.priority),
    dueAt: gap.due,
    status: asGapStatus(gap.status),
    notes: gap.notes,
  }));
}

function providerLabel(data: DraftApiResponse): string {
  return data.provider ? ` via ${data.provider}${data.modelVersion ? ` (${data.modelVersion})` : ""}` : "";
}

/** Fingerprint of the drafted section text, so a cover letter can tell when the response moved on. */
export function responseSignature(sections: SectionRef[], drafts: Record<string, string>): string {
  const text = sections
    .filter(section => section.id !== COVER_LETTER_ID && !isEmptyRichText(drafts[section.id]))
    .map(section => `${section.id}:${htmlToPlainText(drafts[section.id] ?? "").replace(/\s+/g, " ").trim()}`)
    .join("|");
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

/** Response instructions that appear to forbid or restrict a cover letter. */
export function coverLetterConstraint(pursuit: Pursuit): string | undefined {
  return (pursuit.docSummary.responseConstraints ?? []).find(item =>
    /cover (letter|page)/i.test(item) && /\b(no|not|without|exclude|prohibit|shall not|do not|may not)\b/i.test(item),
  );
}

function draftedSections(ctx: GenerationContext, drafts: Record<string, string>) {
  return ctx.sections
    .filter(section => !isEmptyRichText(drafts[section.id]))
    .map(section => ({ id: section.id, title: section.name, body: htmlToPlainText(drafts[section.id] ?? "") }));
}

function briefingFor(ctx: GenerationContext, section: SectionRef, extra: Partial<Parameters<typeof buildResponseDraftBriefing>[0]>) {
  return buildResponseDraftBriefing({
    pursuit: ctx.pursuit,
    org: ctx.org,
    section,
    assignments: ctx.assignments,
    people: ctx.people,
    experience: ctx.experience,
    capabilities: ctx.capabilities,
    partners: ctx.partners,
    ...extra,
  });
}

async function draftCoverLetter(ctx: GenerationContext, drafts: Record<string, string>): Promise<
  { ok: true; letter: PursuitCoverLetter; data: DraftApiResponse } | { ok: false; error: string }
> {
  const briefing = briefingFor(ctx, { id: COVER_LETTER_ID, name: "Cover letter", ref: "Cover" }, {
    mode: "cover_letter",
    sections: ctx.sections,
    draftedSections: draftedSections(ctx, drafts),
    signatory: ctx.signatory,
  });
  let response: { ok: boolean; data: DraftApiResponse };
  try {
    response = await postBriefing(briefing);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Cover letter unavailable." };
  }
  const { ok, data } = response;
  if (!ok || !data.body?.trim()) {
    return { ok: false, error: data.error || data.hint || "Cover letter unavailable." };
  }
  return {
    ok: true,
    data,
    letter: {
      body: plainTextToHtml(data.body.trim()),
      generatedAt: new Date().toISOString(),
      provider: data.usedFallback ? "template" : data.provider ?? "model",
      sourceSignature: responseSignature(ctx.sections, drafts),
    },
  };
}

export async function runCoverLetterJob(ctx: GenerationContext): Promise<ResponseJobOutcome> {
  const result = await draftCoverLetter(ctx, ctx.drafts);
  if (!result.ok) return { message: result.error, toast: result.error, tone: "warning" };
  const { letter, data } = result;
  const words = data.wordCount ?? htmlToPlainText(letter.body).split(/\s+/).filter(Boolean).length;
  const long = words > COVER_LETTER_MAX_WORDS;
  return {
    apply: () => ({ coverLetter: letter }),
    sectionIds: [COVER_LETTER_ID],
    message: data.usedFallback
      ? `Model unavailable — saved a template cover letter (${words} words). Personalize it before sending.`
      : `Cover letter drafted${providerLabel(data)} — ${words} words${long ? ", longer than one page; trim before sending" : ""}.`,
    toast: data.usedFallback ? "Template cover letter saved — personalize it before sending" : "Cover letter drafted",
    tone: data.usedFallback || long ? "warning" : "success",
  };
}

/** The whole response in one pass. Resolved action items are written in; open ones stay on the log. */
export async function runPackageJob(ctx: GenerationContext): Promise<ResponseJobOutcome> {
  const first = ctx.sections[0];
  if (!first) return { message: "No sections to draft.", toast: "No sections to draft", tone: "warning" };
  const briefing = briefingFor(ctx, first, {
    mode: "package",
    sections: ctx.sections.map(item => ({ id: item.id, name: item.name, ref: item.ref })),
  });
  const { ok, data } = await postBriefing(briefing);
  if (!ok || !data.reviewerSummary || !data.sections?.length) {
    const message = data.error || data.hint || `Full ${ctx.packageLabel} unavailable.`;
    return { message, toast: message, tone: "warning" };
  }

  const tracePct = data.usedFallback ? "shell" : (data.provider ?? "model");
  const drafted = new Map(data.sections.map(item => [item.id, item]));
  const allSections: SectionRef[] = [
    ...ctx.sections.map(section => {
      const item = drafted.get(section.id);
      return item ? { id: section.id, name: item.title || section.name, ref: item.ref || section.ref } : section;
    }),
    ...data.sections
      .filter(item => !ctx.sections.some(section => section.id === item.id) && item.id !== "cover")
      .map(item => ({ id: item.id, name: item.title, ref: item.ref || item.title })),
  ];
  const sectionDrafts = Object.fromEntries(
    data.sections.filter(item => item.id !== "cover").map(item => [item.id, plainTextToHtml(item.body)]),
  );
  const nextDrafts = { ...ctx.drafts, ...sectionDrafts };

  const startedLetter = ctx.pursuit.coverLetter;
  const cover = !data.usedFallback && !startedLetter?.editedAt
    ? await draftCoverLetter({ ...ctx, sections: allSections }, nextDrafts)
    : undefined;
  const incoming = toGapItems(data.gaps ?? []);
  const preview = mergeRegeneratedGaps(ctx.pursuit.rfiResponse?.gaps ?? [], incoming, ctx.pursuit.responseActionItems);
  const carried = {
    open: preview.gaps.filter(gap => gap.status !== "Resolved").length,
    resolved: preview.carriedResolved,
    dropped: preview.dropped,
  };

  const apply = (p: Pursuit): Partial<Pursuit> => {
    const priorGaps = p.rfiResponse?.gaps ?? [];
    const merged = mergeRegeneratedGaps(priorGaps, incoming, p.responseActionItems);
    const gapIds = new Set(merged.gaps.map(gap => gap.id));
    const priorGapIds = new Set(priorGaps.map(gap => gap.id));
    const standalone = (p.responseActionItems ?? []).filter(item => !gapIds.has(item.id) && !priorGapIds.has(item.id));
    const packet: RfiResponseMeta = {
      reviewerSummary: data.reviewerSummary!,
      strategicNotes: data.strategicNotes ?? "",
      questions: data.questions ?? [],
      compliance: data.compliance ?? [],
      gaps: merged.gaps,
      sections: data.sections!.map(item => ({ id: item.id, ref: item.ref, title: item.title, body: item.body })),
    };
    const letterEditedSinceStart = Boolean(p.coverLetter?.editedAt && p.coverLetter.editedAt !== startedLetter?.editedAt);
    return {
      rfiResponse: packet,
      responseActionItems: [...gapsToActionItems(merged.gaps, ctx.partners, p.responseActionItems), ...standalone],
      complianceMatrix: allSections.map(item => ({ ref: item.ref, title: item.name, sectionId: item.id })),
      responseDrafts: { ...(p.responseDrafts ?? {}), ...sectionDrafts },
      ...(cover?.ok && !letterEditedSinceStart ? { coverLetter: cover.letter } : {}),
    };
  };

  const coverNote = cover
    ? cover.ok ? " Cover letter drafted from the new sections." : ` Cover letter not drafted: ${cover.error}`
    : startedLetter?.editedAt ? " Your edited cover letter was kept; regenerate it to reflect the new draft." : "";

  return {
    apply,
    sectionIds: [...Object.keys(sectionDrafts), ...(cover?.ok ? [COVER_LETTER_ID] : [])],
    hints: { tracePct },
    message: data.usedFallback
      ? `Model draft unavailable. Saved a ${ctx.packageLabel} shell with a Gap Log. Do not submit it.`
      : `${ctx.packageLabel[0]!.toUpperCase()}${ctx.packageLabel.slice(1)} drafted${providerLabel(data)}. ${carried.open} open action item${carried.open === 1 ? "" : "s"} in the Gap Log.${
        carried.resolved ? ` ${carried.resolved} resolved action item${carried.resolved === 1 ? "" : "s"} written into the draft.` : ""
      }${
        carried.dropped ? ` ${carried.dropped} earlier open item${carried.dropped === 1 ? " is" : "s are"} no longer needed.` : ""
      }${coverNote}`,
    toast: data.usedFallback
      ? `${ctx.packageLabel} shell saved — resolve the Gap Log before review`
      : `Full ${ctx.packageLabel} drafted for review`,
    tone: data.usedFallback ? "warning" : "success",
  };
}

/** One section. Gaps it logs join the Gap Log; resolved items keep their status. */
export async function runSectionJob(
  ctx: GenerationContext,
  section: SectionRef,
  options: { regenerate: boolean; fallbackText: string },
): Promise<ResponseJobOutcome> {
  const briefing = briefingFor(ctx, section, {
    existingDraft: options.regenerate ? htmlToPlainText(ctx.drafts[section.id] ?? "") : undefined,
  });

  let result: { ok: boolean; data: DraftApiResponse };
  try {
    result = await postBriefing(briefing);
  } catch (err) {
    result = { ok: false, data: { error: err instanceof Error ? err.message : "Unable to generate draft" } };
  }
  const { ok, data } = result;

  if (!ok || !data.body?.trim()) {
    const message = data.error || data.hint || "Model draft unavailable. Used the solicitation outline.";
    return {
      apply: options.regenerate
        ? undefined
        : p => ({ responseDrafts: { ...(p.responseDrafts ?? {}), [section.id]: plainTextToHtml(options.fallbackText) } }),
      sectionIds: options.regenerate ? [] : [section.id],
      hints: { tracePct: "outline" },
      message,
      toast: options.regenerate ? message : "Model draft unavailable — showing the packet outline",
      tone: "warning",
    };
  }

  const body = plainTextToHtml(data.body.trim());
  const incoming = toGapItems(data.gaps ?? []);
  const apply = (p: Pursuit): Partial<Pursuit> => {
    const updates: Partial<Pursuit> = { responseDrafts: { ...(p.responseDrafts ?? {}), [section.id]: body } };
    if (!incoming.length) return updates;
    const prior = p.rfiResponse?.gaps ?? [];
    const resolved = new Set(prior.filter(gap => gap.status === "Resolved").map(gap => gap.id));
    const fresh = incoming.filter(gap => !resolved.has(gap.id));
    const gaps = [...prior.filter(gap => !fresh.some(next => next.id === gap.id)), ...fresh];
    const gapIds = new Set(gaps.map(gap => gap.id));
    const standalone = (p.responseActionItems ?? []).filter(item => !gapIds.has(item.id));
    return {
      ...updates,
      rfiResponse: {
        reviewerSummary: p.rfiResponse?.reviewerSummary ?? "Section updated. Review the Gap Log - Action Items before submission.",
        strategicNotes: p.rfiResponse?.strategicNotes ?? "",
        questions: p.rfiResponse?.questions ?? [],
        compliance: p.rfiResponse?.compliance ?? [],
        gaps,
        sections: p.rfiResponse?.sections,
      },
      responseActionItems: [...gapsToActionItems(gaps, ctx.partners, p.responseActionItems), ...standalone],
    };
  };

  const factCount = data.insights?.length ?? 0;
  return {
    apply,
    sectionIds: [section.id],
    hints: { tracePct: data.provider ?? "model", reviewOthers: options.regenerate },
    message: `${options.regenerate ? "Section regenerated" : "Draft generated"} for "${section.name}"${providerLabel(data)}${factCount ? ` (${factCount} grounded facts)` : ""}.${incoming.length ? ` ${incoming.length} gap${incoming.length === 1 ? "" : "s"} added to the Gap Log.` : ""}`,
    toast: options.regenerate
      ? `"${section.name}" regenerated from the solicitation packet and team graph`
      : `"${section.name}" drafted from the solicitation packet and team graph`,
    tone: "success",
  };
}
