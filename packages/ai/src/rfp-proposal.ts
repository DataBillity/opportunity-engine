import { parseRfpProposalPart, type RfpProposal } from "@opportunity-engine/contracts";
import { callModel, ModelGatewayError } from "./gateway";
import { parseModelJson } from "./json";
import { RFP_DRAFTING_PROMPT, RFP_DRAFTING_PROMPT_VERSION } from "./rfp-proposal-prompt";

export { RFP_DRAFTING_PROMPT, RFP_DRAFTING_PROMPT_VERSION } from "./rfp-proposal-prompt";

/**
 * A full proposal is too long for one call inside the route's time limit, so it is drafted in steps:
 * plan (structure, themes, section briefs), then sections, forms, and compliance in parallel, then review.
 */
export type RfpProposalStep = "plan" | "sections" | "forms" | "compliance" | "review";

export const RFP_PROPOSAL_STEPS: readonly RfpProposalStep[] = ["plan", "sections", "forms", "compliance", "review"];

export interface RfpProposalSources {
  documentText: string;
  documentNames?: string[];
  primePartnerName?: string;
  goNoGoText?: string;
  capabilitiesText?: string;
  partnerRecordsText?: string;
  reviewerInstructions?: string;
  /** Resolved and open action items from earlier drafts of this proposal. */
  actionItemsText?: string;
  today?: string;
}

export interface RfpProposalStepInput {
  step: RfpProposalStep;
  sources: RfpProposalSources;
  /** The plan every later step drafts against. */
  plan?: RfpProposal;
  /** Sections step: the section ids to draft. */
  sectionIds?: string[];
  /** Sections step: current text of sections being redrafted, keyed by id. */
  existingDrafts?: Record<string, string>;
  /** Review step: the assembled draft. */
  draft?: RfpProposal;
  /** First number for new placeholders. The platform renumbers in order of appearance afterward. */
  nextGapNumber?: number;
}

const STEP_LIMITS: Record<RfpProposalStep, { maxTokens: number; attemptMs: number; temperature: number }> = {
  plan: { maxTokens: 10_000, attemptMs: 200_000, temperature: 0.2 },
  sections: { maxTokens: 12_000, attemptMs: 200_000, temperature: 0.3 },
  forms: { maxTokens: 10_000, attemptMs: 190_000, temperature: 0.1 },
  compliance: { maxTokens: 8_000, attemptMs: 170_000, temperature: 0.1 },
  review: { maxTokens: 3_500, attemptMs: 150_000, temperature: 0.1 },
};

/** Every attempt in one step shares this deadline; the route allows 300s. */
const STEP_BUDGET_MS = 280_000;

function gapLabel(n: number | undefined): string {
  return `GAP-${String(Math.max(1, n ?? 1)).padStart(3, "0")}`;
}

function planForPrompt(plan: RfpProposal): string {
  return JSON.stringify({
    structure: plan.structure,
    winThemes: plan.winThemes,
    sections: plan.sections.map(section => ({
      id: section.id,
      heading: section.heading,
      rfpRef: section.rfpRef,
      criterion: section.criterion,
      points: section.points,
      pageBudget: section.pageBudget,
      brief: section.brief,
    })),
    gapLog: plan.gapLog,
    submissionChecklist: plan.submissionChecklist,
  }, null, 1);
}

function draftForReview(draft: RfpProposal): string {
  return JSON.stringify({
    structure: draft.structure,
    winThemes: draft.winThemes,
    sections: draft.sections.map(section => ({
      id: section.id,
      heading: section.heading,
      rfpRef: section.rfpRef,
      pageBudget: section.pageBudget,
      content: section.content,
    })),
    forms: draft.forms,
    gapLog: draft.gapLog,
    complianceMatrix: draft.complianceMatrix,
    submissionChecklist: draft.submissionChecklist,
  }, null, 1);
}

function taskFor(input: RfpProposalStepInput): string[] {
  const next = gapLabel(input.nextGapNumber);
  switch (input.step) {
    case "plan":
      return [
        "This call plans the proposal. Separate calls then draft the section content, complete the forms, and build the compliance matrix from your plan, in parallel, so the plan must be complete and final.",
        "Return JSON with only these fields: structure, winThemes, sections, submissionChecklist, issuerQuestions, gapLog.",
        "- structure follows section 3. List every volume and separate file, including price and forms files, with what counts toward each page limit.",
        "- sections: every section of every volume, in the order the response presents them, including a cover letter when the structure has one (id \"cover\"). Give each an id (short and stable, such as \"1b\" or \"tech-approach\"), heading, rfpRef, criterion, points, pageBudget, brief, and content as \"\".",
        "- brief, 90 words or fewer: the requested elements to answer as subheadings, in order; the criterion language to echo; the requirements, with cites, that the section must answer; the win themes it carries. The drafting call sees only your brief, the plan, and the sources, so leave nothing out.",
        "- Forms are completed by another call. Don't make narrative sections for them; list each required form and file in submissionChecklist.",
        `- gapLog covers only the placeholders you put in winThemes. Number them from ${next}.`,
      ];
    case "sections": {
      const wanted = new Set(input.sectionIds ?? []);
      const listed = (input.plan?.sections ?? []).filter(section => wanted.has(section.id));
      const lines = [
        "This call drafts the content of these sections of the PROPOSAL PLAN, and no others:",
        ...listed.map(section => `- ${section.id}: ${section.heading}${section.pageBudget != null ? ` (${section.pageBudget} pages)` : ""}`),
        "Other sections are drafted in parallel. Follow each section's brief, stay within its pageBudget (about 500 words a page), and don't repeat another section's content; refer to it by heading instead.",
        "Return JSON with only these fields: sections (an array of {id, content}, one per listed id, ids exactly as listed) and gapLog (one entry per placeholder in your content).",
        `Reuse a placeholder id from the plan's gapLog or an open action item when the same item applies. Number new placeholders from ${next}.`,
      ];
      const drafts = Object.entries(input.existingDrafts ?? {}).filter(([id, body]) => wanted.has(id) && body.trim());
      if (drafts.length) {
        lines.push("", "EXISTING DRAFT TO REVISE (keep what the sources support, including the reviewer's edits; fix what they don't):");
        for (const [id, body] of drafts) lines.push(`--- ${id} ---`, body.trim());
      }
      return lines;
    }
    case "forms":
      return [
        "This call completes every required form and template (section 5). Use the PROPOSAL PLAN for placement and for the facts the forms must match.",
        "Return JSON with only these fields: forms and gapLog (one entry per placeholder in the forms).",
        "- One entry per form the RFP package requires, including pricing templates, certifications, declarations, and addendum acknowledgments. Use the issuer's form numbers, names, and field labels as printed.",
        `- Reuse a placeholder id from the plan's gapLog or an open action item when the same item applies. Number new placeholders from ${next}.`,
      ];
    case "compliance":
      return [
        "This call builds complianceMatrix (section 2) against the PROPOSAL PLAN.",
        "Return JSON with only this field: complianceMatrix.",
        "- One row per requirement in the submission instructions, evaluation criteria, scope, forms, pricing templates, and contract.",
        "- requirement: 15 words or fewer, in your own words.",
        "- answeredIn: a section id from the plan, or a form's number as the RFP prints it. Use \"\" when nothing in the plan answers it.",
        "- status: \"Planned\" when answeredIn is set, otherwise \"Open\". The platform updates status after drafting.",
      ];
    case "review":
      return [
        "This call reviews the assembled DRAFT TO REVIEW against section 7.",
        "Return JSON with only this field: consistencyChecks.",
        "- Run each consistency check in section 7 that applies to this RFP, then each before-returning check.",
        "- result: \"pass\", \"fail\", or \"pending\" when it depends on an open gap (name the gap ids in detail).",
        "- detail, 30 words or fewer: what agrees or disagrees, and where (section ids, form numbers, gap ids).",
        "- Don't rewrite the draft.",
      ];
  }
}

export function buildRfpProposalUserPrompt(input: RfpProposalStepInput): string {
  const { sources } = input;
  const names = sources.documentNames?.filter(Boolean) ?? [];
  const lines = [
    "=== RFP PACKAGE ===",
    names.length ? `Files: ${names.join("; ")}` : "Files: the document text below.",
    "Each file starts with a line \"===== DOCUMENT: file name =====\" when more than one file was uploaded.",
    "",
    sources.documentText.trim(),
    "",
    "=== GO/NO-GO ASSESSMENT ===",
    sources.goNoGoText?.trim() || "None provided.",
    "",
    "=== CAPABILITIES SOURCES ===",
    sources.primePartnerName
      ? `Prime Partner (registered name): ${sources.primePartnerName}`
      : "No Partner is registered as Prime. Use owner \"Prime\" with no company name.",
    sources.capabilitiesText?.trim() || "None provided.",
    "",
    "=== PARTNER RECORDS ===",
    sources.partnerRecordsText?.trim() || "None provided.",
    "",
    "=== REVIEWER INSTRUCTIONS ===",
    sources.reviewerInstructions?.trim() || "None provided. Enter no prices, and treat key personnel as unnamed until the sources name them.",
  ];
  if (sources.actionItemsText?.trim()) {
    lines.push(
      "",
      "=== ACTION ITEMS FROM EARLIER DRAFTS ===",
      "Resolved items are facts: write the owner's response into the draft and never reuse their ids. Open items keep their id wherever they still apply.",
      sources.actionItemsText.trim(),
    );
  }
  if (input.step !== "plan" && input.plan) {
    lines.push("", "=== PROPOSAL PLAN ===", planForPrompt(input.plan));
  }
  if (input.step === "review" && input.draft) {
    lines.push("", "=== DRAFT TO REVIEW ===", draftForReview(input.draft));
  }
  lines.push(
    "",
    "=== TASK FOR THIS CALL ===",
    ...taskFor(input),
    "",
    sources.today ? `Today's date: ${sources.today}.` : "",
    "Return JSON:",
  );
  return lines.filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");
}

export interface RfpProposalStepResult {
  part: RfpProposal;
  provider: "claude" | "gemini";
  modelVersion: string;
  latencyMs: number;
}

function usable(step: RfpProposalStep, part: RfpProposal, input: RfpProposalStepInput): boolean {
  if (step === "plan") return part.sections.length > 0;
  if (step === "sections") {
    const wanted = new Set(input.sectionIds ?? []);
    return part.sections.some(section => section.content && (!wanted.size || wanted.has(section.id)));
  }
  if (step === "compliance") return part.complianceMatrix.length > 0;
  if (step === "review") return part.consistencyChecks.length > 0;
  return true;
}

/** One step of a proposal draft. An unusable reply retries once on the other provider. */
export async function draftRfpProposalStep(input: RfpProposalStepInput): Promise<RfpProposalStepResult> {
  if (input.step === "review" ? !input.draft : input.step !== "plan" && !input.plan) {
    throw new ModelGatewayError(`The ${input.step} step needs the ${input.step === "review" ? "assembled draft" : "proposal plan"}`, "empty_response");
  }
  const limits = STEP_LIMITS[input.step];
  const prompt = buildRfpProposalUserPrompt(input);
  const deadlineAt = Date.now() + STEP_BUDGET_MS;

  const attempt = async (preferProvider: "claude" | "gemini"): Promise<RfpProposalStepResult> => {
    const result = await callModel({
      tier: "judgment",
      preferProvider,
      promptVersion: RFP_DRAFTING_PROMPT_VERSION,
      systemPrompt: RFP_DRAFTING_PROMPT,
      prompt,
      classification: "internal",
      redactionProfile: "response-draft-v1",
      maxTokens: limits.maxTokens,
      temperature: limits.temperature,
      jsonMode: true,
      timeoutMs: limits.attemptMs,
      deadlineAt,
    });
    let parsed: unknown;
    try {
      parsed = parseModelJson(result.content);
    } catch {
      throw new ModelGatewayError(`${result.provider} returned proposal JSON that could not be parsed`, "empty_response");
    }
    const part = parseRfpProposalPart(parsed);
    if (!usable(input.step, part, input)) {
      throw new ModelGatewayError(`${result.provider} returned no usable ${input.step} content`, "empty_response");
    }
    return { part, provider: result.provider, modelVersion: result.modelVersion, latencyMs: result.latencyMs };
  };

  try {
    return await attempt("claude");
  } catch (err) {
    if (!(err instanceof ModelGatewayError) || err.code !== "empty_response") throw err;
    return attempt("gemini");
  }
}
