/**
 * Deterministic RFI scope summary: themed challenges, consequences, target end
 * state, procurement objective, and explicit/inferred services. Used when model
 * extraction is unavailable, and to fill any field the model left empty.
 * PURE — no I/O.
 */
import type {
  RfiChallengeTheme,
  RfiScopeSummary,
  RfiServiceItem,
} from "@opportunity-engine/contracts";

type Confidence = "High" | "Medium" | "Low";
type WorkType = RfiScopeSummary["workType"];

interface ServiceRule {
  service: string;
  group: "core" | "technical" | "consulting";
  signals: RegExp[];
  /** Used when no signal matches but the rule still applies to this kind of work. */
  baseline?: { confidence: Confidence; evidence: string };
}

const SERVICE_RULES: ServiceRule[] = [
  {
    service: "Project and program management",
    group: "core",
    signals: [/\bphase[sd]?\b|multi-?year|stage[- ]gate|approval process|project approval/i, /\bstate\b|\bcounty\b|\bfederal\b|department|agency|board/i],
    baseline: { confidence: "Medium", evidence: "Any multi-phase public-sector effort" },
  },
  {
    service: "Stakeholder engagement and communications",
    group: "core",
    signals: [/\bcount(?:y|ies)\b|division|partner|board|the public|advocate|external|offices?\b/i],
  },
  {
    service: "Current-state assessment",
    group: "core",
    signals: [/\bevaluat|\breview\b|current (?:system|environment|state)|as-is|assess/i],
  },
  {
    service: "Business process analysis and redesign",
    group: "core",
    signals: [/manual|workaround|external (?:process|spreadsheet)|spreadsheet|re-?key|outside the system|streamlin/i],
  },
  {
    service: "Organizational change management and training",
    group: "core",
    signals: [/\b\d{2,}\s+(?:\w+\s+)?(?:users|staff|employees)\b|statewide|regional offices|county offices|new ways of working|training/i],
  },
  {
    service: "Quality assurance and independent oversight (IV&V)",
    group: "core",
    signals: [/iv&v|independent verification|oversight|modernization|replace/i],
  },
  {
    service: "Procurement and acquisition support",
    group: "core",
    signals: [/\bcots\b|\bmots\b|custom|approach|best meets|future solicitation|vehicle|determine (?:if|whether)/i],
    baseline: { confidence: "Low", evidence: "Early market research; the approach and vehicle are not yet chosen" },
  },
  {
    service: "Requirements and solution design",
    group: "technical",
    signals: [/configurable|\bcots\b|\bsaas\b|\bmots\b|custom[- ]developed|requirements/i],
  },
  {
    service: "Configuration and development (workflows, rules, correspondence, portals)",
    group: "technical",
    signals: [/rules engine|business rules|workflow|correspondence|letters|portal|self-service/i],
  },
  {
    service: "Data migration and conversion",
    group: "technical",
    signals: [/replac|legacy|existing system|current system|conversion|migrat/i, /records|history|balances|over the life|lifetime|documents/i],
  },
  {
    service: "Integration and interfaces",
    group: "technical",
    signals: [/integrat|interface|\bapi\b|third[- ]party|vendor|department of justice|\bdoj\b|courts?\b|law enforcement|warrant|payment/i],
  },
  {
    service: "Security, privacy, and compliance",
    group: "technical",
    signals: [/\bpii\b|medical|health|hipaa|criminal|cjis|security standards?|confidential|privacy|offender/i],
  },
  {
    service: "Testing (including rules and payment accuracy)",
    group: "technical",
    signals: [/payment|eligibility|determination|rules engine|adjudicat|award/i],
  },
  {
    service: "Accessibility and language services",
    group: "technical",
    signals: [/accessib|multilingual|language|spanish|portal|public-facing|self-service/i],
  },
  {
    service: "Reporting, analytics, and data management",
    group: "technical",
    signals: [/report|dashboard|analytics|visibility|audit trail|track which user/i],
  },
  {
    service: "Hosting and infrastructure",
    group: "technical",
    signals: [/cloud|hosting|non-cloud|infrastructure|\bsaas\b|on-?prem/i],
  },
  {
    service: "Operations, maintenance, and support",
    group: "technical",
    signals: [/maintenance|support|service[- ]level|\bsla\b|annual|ongoing/i],
  },
  {
    service: "Strategic planning and roadmap",
    group: "consulting",
    signals: [/roadmap|long-term|multi-year|strategic plan|sequenc/i],
  },
  {
    service: "Alternatives analysis and feasibility study",
    group: "consulting",
    signals: [/alternatives|feasibil|build (?:or|vs\.?) buy|determine (?:if|whether) solutions|\bcots\b.*custom|options/i],
  },
  {
    service: "Business case and cost-benefit analysis",
    group: "consulting",
    signals: [/business case|cost[- ]benefit|\broi\b|budget|funding|cost model/i],
  },
  {
    service: "Operating model and organization design",
    group: "consulting",
    signals: [/operating model|organization(?:al)? design|roles and responsibilities|separation of duties|consolidat/i],
  },
  {
    service: "Governance and policy",
    group: "consulting",
    signals: [/governance|decision rights|statut|regulat|policy change/i],
  },
  {
    service: "IT and data strategy",
    group: "consulting",
    signals: [/enterprise|data silos?|single source of truth|portfolio|aging technology/i],
  },
  {
    service: "Performance measurement",
    group: "consulting",
    signals: [/backlog|turnaround|\bkpi|complaint|slower|delay|escalation/i],
  },
  {
    service: "Readiness and implementation planning",
    group: "consulting",
    signals: [/readiness|prepare for|adoption|implementation plan/i],
  },
];

const THEMES: { theme: string; pattern: RegExp }[] = [
  { theme: "Agility and change cost", pattern: /requires? (?:code|custom cod|developer)|hard[- ]?coded|take[s]? (?:several )?months|code (?:changes|updates)|dependent on coding|coding requirements|lack of agility/i },
  { theme: "Controls and audit", pattern: /audit|track(?:s)? which user|separation of duties|compliance|who did/i },
  { theme: "Integration", pattern: /not integrated|re-?key|not linked|interface|integrat/i },
  { theme: "Manual workarounds", pattern: /manual|spreadsheet|outside the system|external process|workaround/i },
  { theme: "Missing functions", pattern: /\bno\b|lack|missing|does not (?:have|support)|cannot|unable|not available/i },
  { theme: "Reporting and visibility", pattern: /report|visibility|dashboard/i },
  { theme: "User experience", pattern: /rename|language|spanish|usab|portal|self-service|user experience/i },
];

function sentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(line => line.length > 20);
}

function clip(value: string, max = 140): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function signalCount(sentence: string, signals: RegExp[]): number {
  return signals.reduce((total, signal) => {
    const global = new RegExp(signal.source, signal.flags.includes("g") ? signal.flags : `${signal.flags}g`);
    return total + (sentence.match(global)?.length ?? 0);
  }, 0);
}

function strongestEvidence(matched: string[], signals: RegExp[]): string {
  return matched.reduce((best, sentence) => signalCount(sentence, signals) > signalCount(best, signals) ? sentence : best, matched[0]!);
}

export function detectRfiWorkType(text: string): WorkType {
  const technical = /\b(system|platform|software|application|solution|portal|cots|saas|implement|replace|moderniz)\w*/i.test(text);
  const consulting = /\b(roadmap|strategic plan|business case|operating model|governance|assessment|feasibility|advisory|consulting)\w*/i.test(text);
  if (technical && consulting) return "both";
  if (technical) return "technical";
  if (consulting) return "consulting";
  return "other";
}

/**
 * Explicit services come from what the issuer asked about (its questions or a
 * request/scope sentence); everything else is inferred from signals in the text
 * and labeled with evidence and confidence.
 */
export function inferRfiServices(text: string, questions: string[] = [], workType = detectRfiWorkType(text)): RfiServiceItem[] {
  const pool = sentences(text);
  const groups = new Set<ServiceRule["group"]>(["core"]);
  if (workType === "technical" || workType === "both") groups.add("technical");
  if (workType === "consulting" || workType === "both") groups.add("consulting");

  const out: RfiServiceItem[] = [];
  for (const rule of SERVICE_RULES) {
    if (!groups.has(rule.group)) continue;
    const asked = questions.find(question => rule.signals.some(signal => signal.test(question)));
    if (asked) {
      out.push({ service: rule.service, type: "explicit", evidence: clip(asked), confidence: undefined });
      continue;
    }
    const matched = pool.filter(sentence => rule.signals.some(signal => signal.test(sentence)));
    if (matched.length) {
      const signalsHit = rule.signals.filter(signal => matched.some(sentence => signal.test(sentence))).length;
      const strong = rule.signals.length > 1 ? signalsHit === rule.signals.length : matched.length >= 2;
      out.push({
        service: rule.service,
        type: "inferred",
        evidence: clip(strongestEvidence(matched, rule.signals)),
        confidence: strong ? "High" : "Medium",
      });
      continue;
    }
    if (rule.baseline) {
      out.push({ service: rule.service, type: "inferred", evidence: rule.baseline.evidence, confidence: rule.baseline.confidence });
    }
  }
  return out;
}

export function themeRfiChallenges(challenges: string[]): RfiChallengeTheme[] {
  const grouped = new Map<string, { items: string[]; refs: number[] }>();
  challenges.forEach((challenge, index) => {
    const theme = THEMES.find(item => item.pattern.test(challenge))?.theme ?? "Other limitations";
    const entry = grouped.get(theme) ?? { items: [], refs: [] };
    entry.items.push(challenge.replace(/[.;]\s*$/, ""));
    entry.refs.push(index + 1);
    grouped.set(theme, entry);
  });

  const order = [...THEMES.map(item => item.theme), "Other limitations"];
  return order
    .filter(theme => grouped.has(theme))
    .map(theme => {
      const entry = grouped.get(theme)!;
      return {
        theme,
        detail: entry.items.join("; "),
        rootCause: theme === "Agility and change cost",
        evidence: `Item${entry.refs.length === 1 ? "" : "s"} ${entry.refs.join(", ")}`,
      };
    });
}

function bulletedConsequences(text: string): string[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const lead = lines.findIndex(line => /\b(result(?:s|ing)? in|lead(?:s|ing)? to|caus(?:e|es|ing))\b[^:]*:\s*$/i.test(line));
  if (lead < 0) return [];
  const items: string[] = [];
  for (const raw of lines.slice(lead + 1)) {
    const line = raw.trim();
    if (!line) {
      if (items.length) break;
      continue;
    }
    if (/^[•▪●*-]\s*/.test(line)) items.push(line.replace(/^[•▪●*-]\s*/, ""));
    else if (items.length && /^[a-z]/.test(line)) items[items.length - 1] += ` ${line}`;
    else break;
  }
  return items;
}

export function extractRfiConsequences(text: string): string[] {
  const bulleted = bulletedConsequences(text);
  if (bulleted.length) return unique(bulleted).slice(0, 8);
  const sentence = sentences(text).find(line => /\b(result(?:s|ing)? in|lead(?:s|ing)? to|caus(?:e|es|ing)|consequence)\b/i.test(line));
  if (!sentence) return [];
  const tail = sentence.replace(/^.*?\b(?:result(?:s|ing)? in|lead(?:s|ing)? to|caus(?:e|es|ing))\b\s*/i, "").replace(/[.]$/, "");
  return unique(
    tail
      .split(/,\s*(?:and\s+)?|\s+and\s+/)
      .map(item => item.trim())
      .filter(item => item.length > 6)
      .map(item => item.charAt(0).toUpperCase() + item.slice(1)),
  ).slice(0, 8);
}

function firstMatching(text: string, pattern: RegExp): string {
  return sentences(text).find(line => pattern.test(line)) ?? "";
}

function referencedAttachments(text: string): string[] {
  const names = unique([...text.matchAll(/\b(Attachment|Exhibit|Appendix)\s+([A-Z0-9]{1,3})\b/g)].map(match => `${match[1]} ${match[2]}`));
  return names.filter(name => {
    const heading = new RegExp(`(?:^|\\n)\\s*${name.replace(/\s+/, "\\s+")}\\s*[:\\-–—]?\\s*\\n`, "i");
    return !heading.test(text);
  });
}

const UNRESOLVED_ANSWER = /^(?:to be determined|tbd|(?:these|this|criteria) (?:have|has) not been established|not (?:yet )?established|no preference)\.?$/i;

/** Issuer Q&A answers that leave a question open ("To be determined", "No preference"). */
function unresolvedIssuerAnswers(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/(?:^|\n)[ \t]*(\d{1,3})\.\s+((?:(?!\n[ \t]*\d{1,3}\.\s|\n\s*\n)[\s\S]){10,600}?)\n\s*A:\s*([^\n]+)/g)) {
    const answer = match[3]!.trim();
    if (!UNRESOLVED_ANSWER.test(answer)) continue;
    const question = match[2]!.replace(/\s+/g, " ").trim().split(/(?<=\?)\s/)[0]!;
    out.push(`Q${match[1]}: ${clip(question, 150)} Issuer answer: "${answer.replace(/\.$/, "")}".`);
  }
  return out.slice(0, 6);
}

export function buildHeuristicRfiSummary(input: {
  text: string;
  challenges: string[];
  questions: string[];
  endStateLines: string[];
}): RfiScopeSummary {
  const workType = detectRfiWorkType(input.text);
  const procurement = firstMatching(input.text, /\b(cots|mots|custom[- ]developed|best meets|which approach|vehicle|build (?:or|vs) buy)\b/i);
  const vision = input.endStateLines.length
    ? input.endStateLines.slice(0, 2).join(" ")
    : firstMatching(input.text, /\b(envision|vision|desired (?:state|outcome)|to-be|single, |will provide)\b/i);
  const constraints = unique(sentences(input.text)
    .filter(line => /\b(provisions|standards|comply|compliance|cloud|hosting|cost model|budget|fiscal year|timeline)\b/i.test(line))
    .filter(line => !/\b(page|font|margin|pdf format|subject line)\b/i.test(line))
    .map(line => clip(line, 200))).slice(0, 4);
  const nextStep = firstMatching(input.text, /\b(demonstration|future solicitation|industry day|request for proposal|\brfp\b|cal ?eprocure|sam\.gov|one-on-one)\b/i);

  const gaps = referencedAttachments(input.text).map(name => `${name} is referenced but was not in the uploaded package. Get it before drafting.`);
  if (!/(?<![/\d])\b\d[\d,]*\s+(?:claims|applications|cases|records|transactions|documents|bills)\b/i.test(input.text)) {
    gaps.push("Volumes are not stated (cases, records, documents, or data to migrate). Sizing and cost models depend on them.");
  }
  gaps.push(...unresolvedIssuerAnswers(input.text));

  const stated = input.challenges.length > 0 || Boolean(vision);
  return {
    workType,
    objectiveConfidence: stated ? "Medium" : "Low",
    procurementObjective: procurement ? clip(procurement, 240) : "",
    challengeThemes: themeRfiChallenges(input.challenges),
    consequences: extractRfiConsequences(input.text),
    endState: vision ? clip(vision, 600) : "",
    endStateConstraints: constraints,
    nextStep: nextStep ? clip(nextStep, 240) : "",
    services: inferRfiServices(input.text, input.questions, workType),
    gaps,
  };
}

function hasText(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

/** Prefer the model's summary field by field; fill anything it left empty from the heuristic. */
export function mergeRfiSummaries(
  preferred: RfiScopeSummary | undefined,
  fallback: RfiScopeSummary | undefined,
): RfiScopeSummary | undefined {
  if (!preferred) return fallback;
  if (!fallback) return preferred;
  return {
    workType: preferred.workType !== "other" ? preferred.workType : fallback.workType,
    objectiveConfidence: preferred.objectiveConfidence ?? fallback.objectiveConfidence,
    procurementObjective: hasText(preferred.procurementObjective) ? preferred.procurementObjective : fallback.procurementObjective,
    challengeThemes: preferred.challengeThemes.length ? preferred.challengeThemes : fallback.challengeThemes,
    consequences: preferred.consequences.length ? preferred.consequences : fallback.consequences,
    endState: hasText(preferred.endState) ? preferred.endState : fallback.endState,
    endStateConstraints: preferred.endStateConstraints.length ? preferred.endStateConstraints : fallback.endStateConstraints,
    nextStep: hasText(preferred.nextStep) ? preferred.nextStep : fallback.nextStep,
    services: preferred.services.length ? preferred.services : fallback.services,
    gaps: preferred.gaps.length ? preferred.gaps : fallback.gaps,
  };
}
