import { NextResponse } from "next/server";
import { callModel, parseModelJson, ModelGatewayError, runWithAnthropicKey } from "@opportunity-engine/ai";
import { resolveModelAccess } from "@/lib/org-model";
import { extractDocumentText, MAX_FILE_BYTES, MAX_FILES } from "@/lib/extract-document";
import {
  parsePartnerDocument,
  type PartnerIngestKind,
  type PartnerIngestResult,
} from "@/lib/partner-ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS: PartnerIngestKind[] = ["capabilities", "experience", "credentials", "people", "corporate"];

function asKind(value: string): PartnerIngestKind {
  return KINDS.includes(value as PartnerIngestKind) ? value as PartnerIngestKind : "capabilities";
}

function mergeResults(kind: PartnerIngestKind, parts: PartnerIngestResult[]): PartnerIngestResult {
  const corporateParts = parts.map(part => part.corporate).filter(Boolean);
  const mergedCorporate = corporateParts.length ? corporateParts[0] : null;
  return {
    kind,
    capabilities: parts.flatMap(part => part.capabilities),
    experience: parts.flatMap(part => part.experience),
    credentials: parts.flatMap(part => part.credentials),
    people: parts.flatMap(part => part.people),
    corporate: mergedCorporate,
    warning: parts.map(part => part.warning).filter(Boolean).join(" "),
  };
}

const PARTNER_INGEST_SYSTEM_PROMPT = `You extract structured partner-graph records from uploaded documents. Return JSON only.

Hard rules:
- A single file may contain MULTIPLE people (e.g. team rosters, multi-person resumes). Emit one record per person.
- Distinguish job TITLES (e.g. "Senior Software Engineer at Amazon") from delivery ROLES (e.g. "Lead Data Architect", "QA Lead"). Put delivery roles in the "roles" array.
- For technologies, be comprehensive: capture programming languages (Python, Java, TypeScript, JavaScript, Go, Rust, C#, etc.), frameworks (React, Angular, Next.js, Node.js, Django, Spring, .NET, etc.), cloud platforms (AWS, Azure, GCP), databases (PostgreSQL, MongoDB, DynamoDB, SQL Server, Oracle, Snowflake, Databricks, Redis), DevOps tools (Kubernetes, Docker, Terraform, Jenkins, GitHub Actions), data tools (Kafka, Spark, Airflow, dbt), and any other technical tools mentioned.
- For industries, infer from employer names and project descriptions. Common mappings: government agencies → Government, hospitals/clinics → Healthcare, insurance companies → Insurance, banks/fintechs → Financial Services, airlines/hotels → Travel & Hospitality, retailers → Retail, consultancies → Professional Services, universities → Education, transit authorities → Public Transit.
- For expertise, write a concise 1-2 sentence summary of the person's core competencies. Do NOT copy the entire resume or document header.
- For capabilities, extract each distinct service offering or capability as a separate item. Dense prose paragraphs should be broken into individual capabilities.
- Leave documentText and resumeText empty; the caller already has the source text.
- Do not echo the full document body.`;

function buildPartnerIngestPrompt(kind: PartnerIngestKind, text: string, filename: string): string {
  const schema: Record<PartnerIngestKind, string> = {
    capabilities: '{"capabilities":[{"name":"<distinct service or capability>"}]}',
    experience: '{"experience":[{"name":"<project or engagement name>","industry":"","technologies":[],"services":[],"summary":"<1-2 sentence summary>"}]}',
    credentials: '{"credentials":[{"name":"","credType":"Certification|Insurance|Bonding|License","expiration":"YYYY-MM-DD or TBD","documentText":"","documentFileName":""}]}',
    people: '{"people":[{"name":"<full name>","roles":["<delivery role, not job title>"],"expertise":"<1-2 sentence summary>","technologies":["<comprehensive list>"],"industries":["<inferred from employers/projects>"]}]}',
    corporate: '{"corporate":{"name":"","yearFounded":"","hqAddress":"","hqPhone":"","hqEmail":"","primaryContact":"","employeeHeadcount":"","ein":"","uei":"","summary":"<1-2 sentence company summary>","website":""}}',
  };

  const kindInstructions: Record<PartnerIngestKind, string> = {
    capabilities: "Extract each distinct capability or service offering. Break dense prose into individual items.",
    experience: "Extract each project, engagement, or past performance item. Infer industry from client names.",
    credentials: "Extract each certification, insurance policy, bond, or license. Find expiration dates.",
    people: `Extract EVERY person in the document. A file may contain 1 or many people.
For each person: identify their full name, delivery roles (not job titles), a concise expertise summary, ALL technologies mentioned in their section, and industries inferred from their employers and project descriptions.`,
    corporate: `Extract corporate/organizational information from this partner details document.
Find the company name, year founded, headquarters address, phone, email, primary contact person, employee headcount, EIN (Employer Identification Number, format XX-XXXXXXX), UEI (Unique Entity Identifier, 12-character alphanumeric), a concise 1-2 sentence company summary, and website URL.
Leave fields as empty string "" if not found. Do NOT guess or fabricate information not present in the document.`,
  };

  return `Kind: ${kind}
Filename: ${filename}
Task: ${kindInstructions[kind]}
Return JSON shaped as: ${schema[kind]}
${kind === "corporate" ? 'Fill the "corporate" object.' : `Fill only the "${kind}" array.`}

Document text:
${text}`;
}

function partnerPromptParts(full: string): { cachePrefix: string; prompt: string } {
  return { cachePrefix: full, prompt: "" };
}

async function enhanceWithModel(
  kind: PartnerIngestKind,
  text: string,
  filename: string,
  fallback: PartnerIngestResult,
  apiKey: string | null,
): Promise<PartnerIngestResult> {
  if (!apiKey) {
    return { ...fallback, warning: [fallback.warning, "No AI model key configured — used heuristic parser only."].filter(Boolean).join(" ") };
  }
  try {
    const result = await runWithAnthropicKey(apiKey, () => callModel({
      tier: "extraction",
      promptVersion: "partner-ingest-v2",
      classification: "internal",
      redactionProfile: "partner-document",
      systemPrompt: PARTNER_INGEST_SYSTEM_PROMPT,
      ...partnerPromptParts(buildPartnerIngestPrompt(kind, text, filename)),
    }));
    const parsed = parseModelJson(result.content) as Partial<PartnerIngestResult>;
    return {
      kind,
      capabilities: parsed.capabilities?.length ? parsed.capabilities : fallback.capabilities,
      experience: parsed.experience?.length ? parsed.experience : fallback.experience,
      credentials: (parsed.credentials?.length ? parsed.credentials : fallback.credentials).map(item => ({
        ...item,
        documentText: text,
        documentFileName: item.documentFileName || filename,
      })),
      people: (parsed.people?.length ? parsed.people : fallback.people).map(item => ({
        ...item,
        resumeText: text,
        resumeFileName: item.resumeFileName || filename,
      })),
      corporate: parsed.corporate ?? fallback.corporate ?? null,
    };
  } catch (error) {
    const heuristicWarning = `AI model failed for ${filename} — used heuristic parser. Profiles may be incomplete.`;
    if (error instanceof ModelGatewayError) {
      return { ...fallback, warning: [fallback.warning, heuristicWarning].filter(Boolean).join(" ") };
    }
    return { ...fallback, warning: [fallback.warning, heuristicWarning].filter(Boolean).join(" ") };
  }
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const kind = asKind(String(form.get("kind") ?? "capabilities"));
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (!files.length) {
    return NextResponse.json({ error: "Upload at least one document" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Upload at most ${MAX_FILES} files` }, { status: 400 });
  }

  const resolved = await resolveModelAccess();
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!resolved.access.apiKey && !resolved.access.usesPlatformKey) {
    return NextResponse.json({ error: resolved.access.missingMessage }, { status: 503 });
  }

  const parts: PartnerIngestResult[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${file.name} exceeds the 12 MB limit` }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractDocumentText({ name: file.name, mime: file.type, bytes });
    const heuristic = parsePartnerDocument(kind, extracted.text, file.name);
    parts.push(await enhanceWithModel(kind, extracted.text, file.name, heuristic, resolved.access.apiKey));
  }

  return NextResponse.json(mergeResults(kind, parts));
}
