import {
  CoverLetterOutput,
  ResponseDraftBriefing,
  type ResponseDraftBriefing as ResponseDraftBriefingType,
} from "@opportunity-engine/contracts";
import { callModel, ModelGatewayError } from "./gateway";
import { parseModelJson } from "./json";
import { collectResponseFacts, type ResponseGroundingFact } from "./response-draft";

export const COVER_LETTER_PROMPT_VERSION = "cover-letter-v1.0";

/** One printed page at ~11pt with a letterhead and signature block. */
export const COVER_LETTER_MAX_WORDS = 420;

const SECTION_CHARS = 1800;
const SECTIONS_TOTAL_CHARS = 12_000;

const GAP_PLACEHOLDER = /\s*\[GAP-\d{3}[^\]]*\]/g;

export const COVER_LETTER_PROMPT = `You write the cover letter that accompanies a DataBillity (Billity AI) response. DataBillity is the Prime and signs the letter. A human reviewer edits and approves it before it is sent.

The letter is professional and personable: warm, confident, specific, and plainly written — a person writing to people, not a brochure.

Write, in this order:
1. Salutation. Use the issuer's named contact when the facts give one; otherwise address the evaluation or selection team of the issuing organization.
2. Opening: express genuine interest in the opportunity, naming it and its reference number, and say in one sentence why it matters to the issuer (their objective or challenge, in their words).
3. Executive summary: one short paragraph that gives a high-level view of the response — the approach, the outcome it delivers, and how it is organized. Build it only from DRAFTED SECTIONS.
4. Why this team: what makes the consortium uniquely positioned. Name DataBillity and each confirmed teaming partner, and say what each brings, citing concrete experience, people, or capabilities from the facts. Two to four specific differentiators beat a long list.
5. Close: restate interest, invite the next step (questions, a conversation, an oral presentation when the solicitation mentions one), and give the point of contact.
6. Signature block: the signatory's name, title, company, and contact from the facts. If a signatory detail is missing, use a short bracketed placeholder such as [Signatory name].

Hard rules:
- 250–${COVER_LETTER_MAX_WORDS} words, so the letter fits on one page. Short paragraphs.
- Cite only GROUNDING FACTS and DRAFTED SECTIONS. Never invent past performance, clients, metrics, certifications, people, prices, or identifiers.
- Do not copy [GAP-###] placeholders. If a point depends on something unresolved, stay general.
- Do not commit to terms, staffing, schedules, or prices beyond what the drafted sections already say. For an RFI, remember it is market research, not an offer.
- Use the issuer's terminology. No "world-class", "best-in-breed", "cutting-edge", "synergies", "leverage".
- Plain text only: no markdown, no HTML. Separate paragraphs with a blank line.

Return ONLY JSON:
{ "body": "the full letter, salutation through signature block", "usedInsightIds": ["R1"] }`;

function trimTo(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function coverLetterSections(briefing: ResponseDraftBriefingType): { id: string; title: string; body: string }[] {
  let budget = SECTIONS_TOTAL_CHARS;
  const out: { id: string; title: string; body: string }[] = [];
  for (const section of briefing.draftedSections ?? []) {
    const body = trimTo(section.body.replace(GAP_PLACEHOLDER, "").replace(/\n{3,}/g, "\n\n").trim(), SECTION_CHARS);
    if (!body || budget <= 0) continue;
    const clipped = body.slice(0, budget);
    budget -= clipped.length;
    out.push({ id: section.id, title: section.title, body: clipped });
  }
  return out;
}

export function buildCoverLetterPrompt(
  briefing: ResponseDraftBriefingType,
  facts: ResponseGroundingFact[],
): string {
  const signatory = briefing.signatory;
  const prime = briefing.partners.find(p => p.role === "Prime" || p.role === "prime");
  const lines = [
    `Cover letter for: ${briefing.pursuit.name}${briefing.pursuit.solicitationRef ? ` (${briefing.pursuit.solicitationRef})` : ""}`,
    `Issuer: ${briefing.organization.name}`,
    `Response type: ${briefing.pursuit.typeLabel}`,
    `Signatory: ${[signatory?.name, signatory?.title, prime?.name ?? "DataBillity", signatory?.email].filter(Boolean).join(", ") || "not on file"}`,
    "",
    "GROUNDING FACTS (you may only cite these):",
    facts.length ? facts.map(fact => `${fact.id} [${fact.source}] ${fact.text}`).join("\n") : "(none)",
    "",
    "DRAFTED SECTIONS (the response this letter introduces):",
  ];
  const sections = coverLetterSections(briefing);
  if (!sections.length) lines.push("(none drafted yet — keep the executive summary general)");
  for (const section of sections) lines.push(`--- ${section.title} ---`, section.body, "");
  if (briefing.instructions?.trim()) lines.push("", "OPERATOR INSTRUCTIONS:", briefing.instructions.trim());
  return lines.join("\n");
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Deterministic letter used when no model could draft one. Every claim comes from the briefing. */
export function fallbackCoverLetter(briefing: ResponseDraftBriefingType): string {
  const pursuit = briefing.pursuit;
  const prime = briefing.partners.find(p => p.role === "Prime" || p.role === "prime");
  const primeName = prime?.name ?? "DataBillity";
  const teammates = briefing.partners.filter(p => p !== prime && p.confirmed);
  const objective = pursuit.docSummary?.objective?.[0];
  const capabilities = pursuit.capabilities.slice(0, 3);
  const sectionTitles = coverLetterSections(briefing).map(section => section.title);
  const signatory = briefing.signatory;
  const ref = pursuit.solicitationRef ? ` (${pursuit.solicitationRef})` : "";

  const paragraphs = [
    `Dear ${briefing.organization.name} Evaluation Team,`,
    `${primeName} is pleased to submit this response to ${pursuit.name}${ref}.${objective ? ` We understand your objective: ${objective.replace(/\.$/, "")}.` : ""} We would welcome the chance to help you achieve it.`,
    sectionTitles.length
      ? `Our response is organized as ${sectionTitles.slice(0, 5).join(", ")}${sectionTitles.length > 5 ? ", and supporting sections" : ""}. Together these describe how our team would approach the work and what you can expect from it.`
      : "Our response describes how our team would approach the work and what you can expect from it.",
    teammates.length || capabilities.length
      ? `${teammates.length ? `${primeName} leads a team that includes ${teammates.map(p => p.name).join(", ")}. ` : ""}${capabilities.length ? `Together we bring direct capability in ${capabilities.join(", ")}.` : ""}`.trim()
      : "",
    `Thank you for considering our response. We would be glad to answer questions or discuss our approach at your convenience.`,
    `Sincerely,\n\n${signatory?.name || "[Signatory name]"}\n${signatory?.title || "[Title]"}\n${primeName}${signatory?.email ? `\n${signatory.email}` : ""}`,
  ].filter(Boolean);
  return paragraphs.join("\n\n");
}

export interface CoverLetterDraft {
  body: string;
  wordCount: number;
  insights: ResponseGroundingFact[];
  modelVersion: string;
  provider: "claude" | "gemini";
  promptVersion: string;
  latencyMs: number;
  usedFallback: boolean;
}

export async function generateCoverLetter(rawBriefing: unknown): Promise<CoverLetterDraft> {
  const briefing = ResponseDraftBriefing.parse(rawBriefing);
  const facts = collectResponseFacts({ ...briefing, resolvedGaps: [], openGaps: [] }, { includeSourceExcerpt: false });
  const prompt = buildCoverLetterPrompt(briefing, facts);

  const draftWith = (preferProvider?: "claude" | "gemini") => callModel({
    tier: "judgment",
    preferProvider,
    promptVersion: COVER_LETTER_PROMPT_VERSION,
    systemPrompt: COVER_LETTER_PROMPT,
    prompt,
    classification: "internal",
    redactionProfile: "response-draft-v1",
    maxTokens: 1400,
    temperature: 0.45,
    jsonMode: true,
    timeoutMs: 60_000,
  });
  const parse = (content: string) => CoverLetterOutput.parse(parseModelJson(content));

  let usedFallback = false;
  let body: string;
  let usedIds: string[] = [];
  let modelVersion = "template";
  let provider: "claude" | "gemini" = "claude";
  let latencyMs = 0;

  try {
    let result = await draftWith();
    try {
      const parsed = parse(result.content);
      body = parsed.body;
      usedIds = parsed.usedInsightIds;
    } catch {
      const first = result;
      try {
        result = await draftWith(first.provider === "claude" ? "gemini" : "claude");
        const parsed = parse(result.content);
        body = parsed.body;
        usedIds = parsed.usedInsightIds;
      } catch {
        result = first;
        body = first.content.trim();
        if (!body) throw new ModelGatewayError("Model returned an empty cover letter", "empty_response");
      }
    }
    modelVersion = result.modelVersion;
    provider = result.provider;
    latencyMs = result.latencyMs;
  } catch (err) {
    if (err instanceof ModelGatewayError && err.code === "keys_missing") throw err;
    usedFallback = true;
    body = fallbackCoverLetter(briefing);
  }

  const clean = body.replace(GAP_PLACEHOLDER, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const byId = new Map(facts.map(fact => [fact.id, fact]));
  return {
    body: clean,
    wordCount: countWords(clean),
    insights: usedIds.map(id => byId.get(id)).filter((fact): fact is ResponseGroundingFact => Boolean(fact)),
    modelVersion,
    provider,
    promptVersion: COVER_LETTER_PROMPT_VERSION,
    latencyMs,
    usedFallback,
  };
}
