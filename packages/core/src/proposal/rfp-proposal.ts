/**
 * Assembly rules for an RFP proposal drafted in several model calls.
 * The model writes the parts; these rules number the gaps, keep placeholders and the Gap Log in step,
 * set compliance status from what was drafted, and add the checks the platform can verify itself.
 */
import type {
  ProposalConsistencyCheck,
  ProposalGap,
  ProposalGapType,
  ProposalSection,
  RfpProposal,
} from "@opportunity-engine/contracts";

/** Page estimates assume a single-spaced page of prose. */
export const WORDS_PER_PAGE = 500;

const PLACEHOLDER = /\[(GAP-\d{3,4})\s*\|\s*([^|\]]+?)\s*\|\s*([^\]]+?)\s*\]/g;
const GAP_TOKEN = /\bGAP-\d{3,4}\b/g;

export function gapNumber(id: string): number {
  const n = Number(id.replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function gapIdFor(n: number): string {
  return `GAP-${String(n).padStart(3, "0")}`;
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function sectionKey(id: string): string {
  return id.trim().toLowerCase();
}

/** Every text the reader sees, in document order: win themes, sections, then forms. */
function documentTexts(proposal: RfpProposal): string[] {
  return [
    ...proposal.winThemes.flatMap(theme => [theme.theme, theme.customerNeed, theme.discriminator, theme.proof]),
    ...proposal.sections.map(section => section.content),
    ...proposal.forms.flatMap(form => [...form.fields.map(field => field.value), form.notes]),
  ];
}

function mapTexts(proposal: RfpProposal, fn: (value: string) => string): RfpProposal {
  return {
    ...proposal,
    winThemes: proposal.winThemes.map(theme => ({
      ...theme,
      theme: fn(theme.theme),
      customerNeed: fn(theme.customerNeed),
      discriminator: fn(theme.discriminator),
      proof: fn(theme.proof),
    })),
    sections: proposal.sections.map(section => ({ ...section, brief: fn(section.brief), content: fn(section.content) })),
    forms: proposal.forms.map(form => ({
      ...form,
      fields: form.fields.map(field => ({ ...field, value: fn(field.value) })),
      notes: fn(form.notes),
    })),
    gapLog: proposal.gapLog.map(gap => ({ ...gap, description: fn(gap.description), notes: fn(gap.notes) })),
    consistencyChecks: proposal.consistencyChecks.map(check => ({ ...check, detail: fn(check.detail) })),
  };
}

/** Gap ids in order of first appearance: in the document, then in the Gap Log. */
export function gapIdsInOrder(proposal: RfpProposal): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const add = (id: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    order.push(id);
  };
  for (const value of documentTexts(proposal)) {
    for (const match of value.matchAll(GAP_TOKEN)) add(match[0]);
  }
  for (const gap of proposal.gapLog) add(gap.id);
  return order;
}

/** Rewrite gap ids everywhere they appear. Every id changes at once, so swaps are safe. */
export function remapGapIds(proposal: RfpProposal, map: Map<string, string>): RfpProposal {
  if (!map.size) return proposal;
  const swap = (value: string) => value.replace(GAP_TOKEN, id => map.get(id) ?? id);
  const mapped = mapTexts(proposal, swap);
  return { ...mapped, gapLog: mapped.gapLog.map(gap => ({ ...gap, id: gap.id ? map.get(gap.id) ?? gap.id : gap.id })) };
}

/**
 * Give one call's new gaps ids that no other call used. Ids in `keep` (open action items, or the
 * plan's gaps when a later call reuses them) stay as they are.
 */
export function renumberPartGaps(part: RfpProposal, keep: Set<string>, counter: { next: number }): RfpProposal {
  const map = new Map<string, string>();
  for (const id of gapIdsInOrder(part)) {
    if (keep.has(id) || map.has(id)) continue;
    let next = gapIdFor(counter.next++);
    while (keep.has(next)) next = gapIdFor(counter.next++);
    map.set(id, next);
  }
  return remapGapIds(part, map);
}

/** Split the plan's sections into drafting calls by page budget, keeping document order. */
export function batchProposalSections(
  sections: Pick<ProposalSection, "id" | "pageBudget">[],
  options: { maxPages?: number; maxSections?: number; maxBatches?: number } = {},
): string[][] {
  const maxPages = options.maxPages ?? 7;
  const maxSections = options.maxSections ?? 4;
  const maxBatches = options.maxBatches ?? 8;
  const batches: { ids: string[]; pages: number }[] = [];
  let current: { ids: string[]; pages: number } = { ids: [], pages: 0 };
  for (const section of sections) {
    // Unbudgeted sections are often resumes or other long material outside the limit.
    const pages = section.pageBudget ?? 3;
    if (current.ids.length && (current.pages + pages > maxPages || current.ids.length >= maxSections)) {
      batches.push(current);
      current = { ids: [], pages: 0 };
    }
    current.ids.push(section.id);
    current.pages += pages;
  }
  if (current.ids.length) batches.push(current);
  while (batches.length > maxBatches) {
    let best = 0;
    for (let i = 1; i < batches.length - 1; i++) {
      if (batches[i]!.pages + batches[i + 1]!.pages < batches[best]!.pages + batches[best + 1]!.pages) best = i;
    }
    const [a, b] = [batches[best]!, batches[best + 1]!];
    batches.splice(best, 2, { ids: [...a.ids, ...b.ids], pages: a.pages + b.pages });
  }
  return batches.map(batch => batch.ids);
}

function dedupeGaps(gaps: ProposalGap[]): ProposalGap[] {
  const byId = new Map<string, ProposalGap>();
  const unnumbered: ProposalGap[] = [];
  for (const gap of gaps) {
    if (!gap.id) unnumbered.push(gap);
    else if (!byId.has(gap.id)) byId.set(gap.id, gap);
  }
  return [...byId.values(), ...unnumbered];
}

/** One proposal from the plan and the parts drafted against it. The plan's sections and order win. */
export function mergeProposalParts(input: {
  plan: RfpProposal;
  sections?: RfpProposal[];
  forms?: RfpProposal;
  compliance?: RfpProposal;
  review?: RfpProposal;
}): RfpProposal {
  const content = new Map<string, string>();
  for (const part of input.sections ?? []) {
    for (const section of part.sections) {
      const key = sectionKey(section.id);
      if (section.content.trim() && !content.has(key)) content.set(key, section.content);
    }
  }
  return {
    ...input.plan,
    sections: input.plan.sections.map(section => ({ ...section, content: content.get(sectionKey(section.id)) ?? section.content })),
    forms: input.forms?.forms ?? input.plan.forms,
    complianceMatrix: input.compliance?.complianceMatrix ?? input.plan.complianceMatrix,
    consistencyChecks: input.review?.consistencyChecks ?? input.plan.consistencyChecks,
    gapLog: dedupeGaps([
      ...input.plan.gapLog,
      ...(input.sections ?? []).flatMap(part => part.gapLog),
      ...(input.forms?.gapLog ?? []),
    ]),
  };
}

function inferGapType(description: string): ProposalGapType {
  if (/\bsign(ature|ed|s)?\b|\bdate\b/i.test(description)) return "signature";
  if (/\bconfirm|verify\b/i.test(description)) return "unverified_claim";
  if (/\bprice|pricing|rate|decid|approve\b/i.test(description)) return "decision_needed";
  return "missing_information";
}

function sectionForLocation(sections: ProposalSection[], location: string): ProposalSection | undefined {
  const loc = location.toLowerCase();
  const locCompact = compact(location);
  if (!locCompact) return undefined;
  return sections.find(section => {
    const heading = section.heading.toLowerCase();
    if (heading && (loc.includes(heading) || heading.includes(loc))) return true;
    if (section.rfpRef.length >= 3 && loc.includes(section.rfpRef.toLowerCase())) return true;
    const id = compact(section.id);
    return Boolean(id) && (locCompact === id || locCompact === `section${id}` || locCompact.endsWith(`section${id}`));
  });
}

function formMatches(label: string, form: { form: string; name: string }): boolean {
  const target = compact(label);
  if (!target) return false;
  const number = compact(form.form);
  const name = compact(form.name);
  return Boolean(
    (number && (target === number || target.endsWith(number) || number.endsWith(target)))
    || (name && (target === name || target.includes(name))),
  );
}

export interface ReconcileReport {
  /** Placeholders that had no Gap Log entry, now logged. */
  placeholdersLogged: string[];
  /** Gap Log entries placed into the section or form their location names. */
  placeholdersInserted: string[];
  /** Entries whose location names no section or form; they live only in the Gap Log. */
  logOnly: string[];
  /** Sections the model left empty; each now holds a placeholder. */
  emptySections: string[];
}

export interface ReconcileOptions {
  /** The Prime Partner's registered name; replaces a bare "Prime" owner. */
  primeName?: string;
  /** Due date for gaps the model left undated. */
  fallbackDue?: string;
  /** Ids that keep their number: open action items from an earlier draft. */
  keep?: Set<string>;
  /** First number for everything else, numbered in order of appearance. */
  firstFresh?: number;
}

/** Placeholders and Gap Log in step, gap ids in order of appearance, owners by registered name, status from the draft. */
export function reconcileRfpProposal(proposal: RfpProposal, options: ReconcileOptions = {}): { proposal: RfpProposal; report: ReconcileReport } {
  const prime = options.primeName?.trim() || "Prime";
  const keep = options.keep ?? new Set<string>();
  const due = options.fallbackDue ?? "";
  const report: ReconcileReport = { placeholdersLogged: [], placeholdersInserted: [], logOnly: [], emptySections: [] };
  const owner = (value: string) => (!value.trim() || /^prime$/i.test(value.trim()) ? prime : value.trim());

  let draft: RfpProposal = mapTexts(proposal, value => value.replace(
    PLACEHOLDER,
    (_, id: string, who: string, what: string) => `[${id} | ${owner(who)} | ${what.trim()}]`,
  ));
  draft = {
    ...draft,
    gapLog: dedupeGaps(draft.gapLog).map(gap => ({ ...gap, owner: owner(gap.owner), due: gap.due || due })),
    complianceMatrix: draft.complianceMatrix.map(row => ({ ...row, owner: owner(row.owner) })),
  };

  let scratch = Math.max(9000, ...gapIdsInOrder(draft).map(gapNumber)) + 1;
  const scratchId = () => gapIdFor(scratch++);
  const placeholder = (gap: Pick<ProposalGap, "id" | "owner" | "description">) => `**[${gap.id} | ${gap.owner} | ${gap.description}]**`;
  const emptied: ProposalGap[] = [];

  draft = {
    ...draft,
    sections: draft.sections.map(section => {
      if (section.content.trim()) return section;
      report.emptySections.push(section.id);
      const gap: ProposalGap = {
        id: scratchId(),
        location: section.heading || section.id,
        type: "missing_information",
        description: `Draft ${section.heading || section.id}${section.rfpRef ? ` (${section.rfpRef})` : ""}; the drafting call returned nothing`,
        owner: prime,
        priority: "High",
        due,
        notes: section.brief,
      };
      emptied.push(gap);
      return { ...section, content: placeholder(gap) };
    }),
  };
  draft = { ...draft, gapLog: [...draft.gapLog.map(gap => (gap.id ? gap : { ...gap, id: scratchId() })), ...emptied] };

  const added: ProposalGap[] = [];
  const logged = new Set(draft.gapLog.map(gap => gap.id));
  const logPlaceholders = (value: string, location: string) => {
    for (const match of value.matchAll(PLACEHOLDER)) {
      const id = match[1]!;
      if (logged.has(id)) continue;
      logged.add(id);
      report.placeholdersLogged.push(id);
      const description = match[3]!.trim();
      added.push({
        id,
        location,
        type: inferGapType(description),
        description,
        owner: owner(match[2]!),
        priority: "Medium",
        due,
        notes: "Logged by the platform: the placeholder had no Gap Log entry.",
      });
    }
  };
  for (const theme of draft.winThemes) logPlaceholders([theme.theme, theme.customerNeed, theme.discriminator, theme.proof].join(" "), "Win themes");
  for (const section of draft.sections) logPlaceholders(section.content, section.heading || section.id);
  for (const form of draft.forms) {
    logPlaceholders([...form.fields.map(field => field.value), form.notes].join(" "), [form.form, form.name].filter(Boolean).join(" "));
  }
  draft = { ...draft, gapLog: [...draft.gapLog, ...added] };

  const present = new Set<string>();
  for (const value of documentTexts(draft)) {
    for (const match of value.matchAll(PLACEHOLDER)) present.add(match[1]!);
  }
  const sections = draft.sections.map(section => ({ ...section }));
  const forms = draft.forms.map(form => ({ ...form }));
  for (const gap of draft.gapLog) {
    if (present.has(gap.id)) continue;
    const section = sectionForLocation(sections, gap.location);
    const form = section ? undefined : forms.find(item => formMatches(gap.location, item));
    if (section) {
      section.content = `${section.content.trim()}\n\n${placeholder(gap)}`;
    } else if (form) {
      form.notes = [form.notes.trim(), placeholder(gap)].filter(Boolean).join(" ");
    } else {
      report.logOnly.push(gap.id);
      continue;
    }
    report.placeholdersInserted.push(gap.id);
  }
  draft = { ...draft, sections, forms };

  const fresh = new Map<string, string>();
  let n = Math.max(1, options.firstFresh ?? 1);
  for (const id of gapIdsInOrder(draft)) {
    if (keep.has(id) || fresh.has(id)) continue;
    while (keep.has(gapIdFor(n))) n++;
    fresh.set(id, gapIdFor(n++));
  }
  draft = remapGapIds(draft, fresh);
  const rename = (id: string) => fresh.get(id) ?? id;
  report.placeholdersLogged = report.placeholdersLogged.map(rename);
  report.placeholdersInserted = report.placeholdersInserted.map(rename);
  report.logOnly = report.logOnly.map(rename);

  draft = {
    ...draft,
    gapLog: [...draft.gapLog].sort((a, b) => gapNumber(a.id) - gapNumber(b.id)),
    complianceMatrix: complianceWithStatus(draft),
  };
  return { proposal: draft, report };
}

function gapsIn(value: string): Set<string> {
  return new Set([...value.matchAll(PLACEHOLDER)].map(match => match[1]!));
}

/** The section or form that answers a compliance row, by id, heading, or form number. */
export function answeringParts(proposal: RfpProposal, answeredIn: string): { sections: ProposalSection[]; forms: RfpProposal["forms"] } {
  const sections: ProposalSection[] = [];
  const forms: RfpProposal["forms"] = [];
  const whole = answeredIn.trim();
  const wholeMatches = proposal.sections.some(item => compact(item.heading) === compact(whole) || compact(item.id) === compact(whole))
    || proposal.forms.some(item => formMatches(whole, item));
  const labels = wholeMatches ? [whole] : answeredIn.split(/[;,]|\band\b/).map(item => item.trim()).filter(Boolean);
  for (const label of labels) {
    const key = compact(label);
    const section = proposal.sections.find(item =>
      compact(item.id) === key || (key.length >= 2 && compact(item.heading).startsWith(key)) || compact(item.heading) === key,
    );
    if (section) {
      if (!sections.includes(section)) sections.push(section);
      continue;
    }
    const form = proposal.forms.find(item => formMatches(label, item));
    if (form && !forms.includes(form)) forms.push(form);
  }
  return { sections, forms };
}

/** Compliance status from the draft: drafted or filled, with the count of open placeholders, or open. */
export function complianceWithStatus(proposal: RfpProposal): RfpProposal["complianceMatrix"] {
  return proposal.complianceMatrix.map(row => {
    const { sections, forms } = answeringParts(proposal, row.answeredIn);
    if (!sections.length && !forms.length) return { ...row, status: "Open" };
    const gaps = new Set<string>();
    for (const section of sections) for (const id of gapsIn(section.content)) gaps.add(id);
    for (const form of forms) for (const id of gapsIn([...form.fields.map(field => field.value), form.notes].join(" "))) gaps.add(id);
    const base = sections.length ? "Drafted" : "Filled";
    return { ...row, status: gaps.size ? `${base}, ${gaps.size} gap${gaps.size === 1 ? "" : "s"}` : base };
  });
}

/** Words of prose, without placeholders, graphic notes, or markdown marks. */
export function proseWords(markdown: string): number {
  return markdown
    .replace(/\*\*\[GAP-[^\]]*\]\*\*|\[GAP-[^\]]*\]/g, " ")
    .replace(/\[GRAPHIC:[^\]]*\]/gi, " ")
    .replace(/[#>*_`|-]+/g, " ")
    .split(/\s+/)
    .filter(word => /[a-z0-9]/i.test(word)).length;
}

/** Estimated printed pages, to one decimal. Graphic notes count as a third of a page each. */
export function estimatePages(markdown: string): number {
  const graphics = (markdown.match(/\[GRAPHIC:/gi) ?? []).length;
  return Math.round((proseWords(markdown) / WORDS_PER_PAGE + graphics / 3) * 10) / 10;
}

function pageLimitOf(value: string): number | null {
  if (!/page|pp\b|^\s*\d+(\.\d+)?\s*$/i.test(value)) return null;
  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function list(items: string[], max = 6): string {
  return items.length > max ? `${items.slice(0, max).join(", ")}, and ${items.length - max} more` : items.join(", ");
}

/** Checks the platform verifies from the draft itself, alongside the model's review. */
export function proposalPlatformChecks(proposal: RfpProposal): ProposalConsistencyCheck[] {
  const checks: ProposalConsistencyCheck[] = [];
  const push = (check: string, result: ProposalConsistencyCheck["result"], detail: string) =>
    checks.push({ check, result, detail, source: "platform" });

  const placed = new Set<string>();
  for (const value of documentTexts(proposal)) for (const id of gapsIn(value)) placed.add(id);
  const logged = new Set(proposal.gapLog.map(gap => gap.id));
  const unlogged = [...placed].filter(id => !logged.has(id));
  const unplaced = proposal.gapLog.filter(gap => !placed.has(gap.id)).map(gap => gap.id);
  if (unlogged.length) push("Every placeholder has one Gap Log entry", "fail", `No entry for ${list(unlogged)}.`);
  else if (unplaced.length) push("Every placeholder has one Gap Log entry", "pending", `${list(unplaced)} name no section or form, so they appear only in the Gap Log.`);
  else push("Every placeholder has one Gap Log entry", "pass", `${placed.size} placeholders, ${logged.size} entries.`);

  const empty = proposal.sections.filter(section => proseWords(section.content) === 0).map(section => section.id);
  push(
    "No section is empty",
    empty.length ? "fail" : "pass",
    empty.length ? `Only placeholders in ${list(empty)}.` : `${proposal.sections.length} sections have drafted prose.`,
  );

  const budgeted = proposal.sections.filter(section => section.pageBudget != null && section.pageBudget > 0);
  if (budgeted.length) {
    const over = budgeted
      .map(section => ({ section, pages: estimatePages(section.content) }))
      .filter(({ section, pages }) => pages > section.pageBudget! * 1.1)
      .map(({ section, pages }) => `${section.id} (about ${pages} of ${section.pageBudget})`);
    push(
      "Each section fits its page budget",
      over.length ? "fail" : "pass",
      over.length ? `Over budget at ${WORDS_PER_PAGE} words a page: ${list(over)}.` : `All ${budgeted.length} budgeted sections fit at ${WORDS_PER_PAGE} words a page.`,
    );
  }

  for (const volume of proposal.structure.volumes) {
    const limit = pageLimitOf(volume.pageLimit);
    if (limit == null) continue;
    const ids = new Set(volume.sectionIds.map(sectionKey));
    const inVolume = proposal.sections.filter(section => ids.has(sectionKey(section.id)));
    if (!inVolume.length) continue;
    const budget = inVolume.reduce((sum, section) => sum + (section.pageBudget ?? 0), 0);
    const estimate = Math.round(inVolume.reduce((sum, section) => sum + (section.pageBudget == null ? 0 : estimatePages(section.content)), 0) * 10) / 10;
    const result = budget > limit || estimate > limit ? "fail" : "pass";
    push(
      `${volume.volume} fits its ${limit}-page limit`,
      result,
      `Budgets total ${budget} pages; the draft runs about ${estimate} pages of the ${limit} allowed${volume.excludedFromLimit.length ? `, excluding ${list(volume.excludedFromLimit, 3)}` : ""}.`,
    );
  }

  if (proposal.complianceMatrix.length) {
    const open = proposal.complianceMatrix.filter(row => row.status === "Open");
    push(
      "Every compliance row is answered or logged",
      open.length ? "fail" : "pass",
      open.length
        ? `${open.length} of ${proposal.complianceMatrix.length} requirements have no answering section or form: ${list(open.map(row => row.cite || row.requirement))}.`
        : `${proposal.complianceMatrix.length} requirements map to a drafted section or form.`,
    );
  }

  const signed = proposal.forms.flatMap(form => form.fields
    .filter(field => /signature|signed by|date signed/i.test(field.field)
      && !/\[GAP-/.test(field.value)
      && !/^(n\/?a|not applicable)$/i.test(field.value.trim()))
    .map(field => `${form.form || form.name}: ${field.field}`));
  if (proposal.forms.length) {
    push(
      "Signature and date fields are placeholders",
      signed.length ? "fail" : "pass",
      signed.length ? `Pre-filled: ${list(signed, 4)}.` : "No form signature is filled in on anyone's behalf.",
    );
  }
  return checks;
}

/** A few lines for the reviewer: structure, what is open and who owns it, and what failed. */
export function summarizeRfpProposal(proposal: RfpProposal, primeName?: string): string {
  const prime = primeName?.trim() || "Prime";
  const basis = { prescribed: "the structure the RFP prescribes", criteria: "the evaluation criteria, in order", standard: "the standard proposal structure" }[proposal.structure.basis];
  const high = proposal.gapLog.filter(gap => gap.priority === "High").length;
  const owners = new Map<string, number>();
  for (const gap of proposal.gapLog) owners.set(gap.owner, (owners.get(gap.owner) ?? 0) + 1);
  const ownerLine = [...owners.entries()]
    .sort(([a], [b]) => (a === prime ? -1 : b === prime ? 1 : a.localeCompare(b)))
    .map(([name, count]) => `${name} ${count}`)
    .join(", ");
  const failed = proposal.consistencyChecks.filter(check => check.result === "fail");
  const pending = proposal.consistencyChecks.filter(check => check.result === "pending").length;
  const deadline = proposal.submissionChecklist.find(line => /\b(due|deadline|by)\b.*\d/i.test(line));
  return [
    `Organized by ${basis}. ${proposal.structure.rationale}`.trim(),
    `${proposal.sections.length} sections in ${Math.max(1, proposal.structure.volumes.length)} volume${proposal.structure.volumes.length === 1 ? "" : "s"}; ${proposal.forms.length} form${proposal.forms.length === 1 ? "" : "s"}.`,
    proposal.gapLog.length
      ? `Gap Log: ${proposal.gapLog.length} item${proposal.gapLog.length === 1 ? "" : "s"}, ${high} high (${ownerLine}).`
      : "Gap Log: no open items.",
    failed.length
      ? `Checks: ${failed.length} failed (${list(failed.map(check => check.check), 3)})${pending ? `, ${pending} pending` : ""}.`
      : pending ? `Checks: none failed, ${pending} pending on open gaps.` : "",
    deadline ? `Deadline: ${deadline}` : "",
    "Do not submit until the Gap Log is resolved, prices are entered by the Prime Partner, and each signer has signed.",
  ].filter(Boolean).join(" ");
}
