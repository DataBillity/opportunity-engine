import type {
  GraphCapability,
  GraphCredential,
  GraphData,
  GraphExperience,
  GraphPerson,
} from "@/lib/mock-data";

export type PartnerIngestKind = "capabilities" | "experience" | "credentials" | "people";

export interface ParsedCapability {
  name: string;
}

export interface ParsedExperience {
  name: string;
  industry: string;
  technologies: string[];
  services: string[];
  summary: string;
}

export interface ParsedCredential {
  name: string;
  credType: string;
  expiration: string;
  documentText: string;
  documentFileName: string;
}

export interface ParsedPerson {
  name: string;
  roles: string[];
  expertise: string;
  technologies: string[];
  industries: string[];
  resumeText: string;
  resumeFileName: string;
}

export interface PartnerIngestResult {
  kind: PartnerIngestKind;
  capabilities: ParsedCapability[];
  experience: ParsedExperience[];
  credentials: ParsedCredential[];
  people: ParsedPerson[];
  warning?: string;
}

const TECH = [
  // Cloud platforms
  "aws govcloud", "aws", "azure government", "azure", "gcp", "google cloud",
  // Languages
  "python", "java", "javascript", "typescript", "c#", "c++", "go", "golang", "rust",
  "ruby", "php", "scala", "kotlin", "swift", "r ", "cobol", "perl", "bash",
  // Frontend frameworks
  "react", "angular", "vue", "next.js", "nextjs", "nuxt", "svelte", "remix",
  "tailwind", "bootstrap", "material ui",
  // Backend frameworks
  "node.js", "nodejs", "express", "django", "flask", "fastapi", "spring",
  ".net", "dotnet", "rails", "laravel",
  // Databases
  "postgresql", "postgres", "mysql", "mongodb", "dynamodb", "cosmosdb",
  "sql server", "oracle", "redis", "elasticsearch", "neo4j", "cassandra",
  "sqlite", "supabase", "firebase",
  // Data & analytics
  "databricks", "snowflake", "kafka", "spark", "airflow", "dbt", "looker",
  "power bi", "tableau", "redshift", "bigquery", "pandas", "numpy",
  // DevOps & infra
  "kubernetes", "docker", "terraform", "ansible", "jenkins", "github actions",
  "gitlab ci", "circleci", "pulumi", "cloudformation", "helm", "argo",
  // ML & AI
  "tensorflow", "pytorch", "scikit-learn", "openai", "langchain",
  "hugging face", "sagemaker", "bedrock", "vertex ai",
  // Testing & QA
  "selenium", "cypress", "playwright", "jest", "pytest", "junit",
  "sonarqube", "postman",
  // Project & workflow
  "jira", "ms project", "confluence", "grafana", "datadog", "splunk",
  "new relic", "pagerduty", "servicenow",
  // CRM & platforms
  "salesforce", "hubspot", "dynamics 365", "sap", "workday",
  // Security
  "okta", "auth0", "vault", "crowdstrike",
  // Messaging & streaming
  "rabbitmq", "pulsar", "nats", "sqs", "sns", "eventbridge",
  // Version control
  "git", "github", "gitlab", "bitbucket",
];

const SERVICES = [
  "program management", "project management", "change management",
  "testing", "quality assurance", "data migration", "data engineering",
  "financial reconciliation", "fraud analytics", "performance monitoring",
  "compliance", "architecture", "training", "devops", "cloud migration",
  "system integration", "application development", "staff augmentation",
  "business intelligence", "data analytics", "cybersecurity",
  "risk management", "agile coaching", "product management",
  "ux design", "ui design", "accessibility", "infrastructure management",
  "database administration", "api development", "microservices",
  "legacy modernization", "digital transformation",
];

const INDUSTRIES = [
  "government", "federal government", "state government", "local government",
  "healthcare", "health information", "insurance", "public transit",
  "transportation", "utilities", "energy", "financial services",
  "banking", "fintech", "payments", "public benefits", "labor", "workforce",
  "education", "higher education", "retail", "e-commerce",
  "technology", "telecommunications", "defense", "aerospace",
  "manufacturing", "pharmaceutical", "hospitality", "travel",
  "real estate", "construction", "media", "entertainment",
  "nonprofit", "consulting", "professional services", "legal",
  "agriculture", "logistics", "supply chain",
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeGraphName(name: string): string {
  return name.trim().toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }
  return next;
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function linesOf(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function bullets(text: string): string[] {
  return linesOf(text)
    .filter(line => /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
    .map(line => line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "").trim())
    .filter(line => line.length > 3 && line.length < 160);
}

function matchesFromList(text: string, catalog: string[]): string[] {
  const lower = text.toLowerCase();
  return catalog.filter(item => lower.includes(item)).map(item =>
    item.replace(/\b\w/g, char => char.toUpperCase())
  );
}

function nextId(prefix: string, existing: { id: string }[], pad = 4): string {
  const nums = existing.map(item => Number(item.id.replace(/\D/g, ""))).filter(n => Number.isFinite(n));
  const n = (nums.length ? Math.max(...nums) : 100) + 1;
  return `${prefix}-${String(n).padStart(pad, "0")}`;
}

function splitMultiPersonDocument(text: string): string[] {
  const namePattern = /^(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*$/;
  const separatorPattern = /^(?:[-=_]{3,}|page\s+\d+|resume\s*[:—-]?\s*\d*)/i;

  const lines = text.split(/\r?\n/);
  const breakpoints: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const prevLine = lines[i - 1]?.trim() ?? "";

    if (!line) continue;

    const isSeparator = separatorPattern.test(prevLine) || !prevLine;
    const isNameLine = namePattern.test(line) && line.length < 60;

    if (isNameLine && isSeparator && i > 10) {
      breakpoints.push(i);
    }
  }

  if (breakpoints.length === 0) return [text];

  const sections: string[] = [];
  let start = 0;
  for (const bp of breakpoints) {
    const section = lines.slice(start, bp).join("\n").trim();
    if (section.length > 50) sections.push(section);
    start = bp;
  }
  const last = lines.slice(start).join("\n").trim();
  if (last.length > 50) sections.push(last);

  return sections.length ? sections : [text];
}

export function parsePartnerDocument(kind: PartnerIngestKind, text: string, filename: string): PartnerIngestResult {
  const empty: PartnerIngestResult = { kind, capabilities: [], experience: [], credentials: [], people: [] };
  const body = text.trim();
  if (!body) {
    return { ...empty, warning: `${filename} did not contain extractable text.` };
  }

  if (kind === "capabilities") {
    const names = uniqueStrings([
      ...bullets(body),
      ...linesOf(body).filter(line => line.length > 8 && line.length < 200 && !/[.]{2,}/.test(line)),
    ]);
    return {
      ...empty,
      capabilities: (names.length ? names : [titleFromFilename(filename)]).map(name => ({ name })),
    };
  }

  if (kind === "experience") {
    const name = linesOf(body)[0] || titleFromFilename(filename);
    const industry = matchesFromList(body, INDUSTRIES)[0] ?? "";
    return {
      ...empty,
      experience: [{
        name,
        industry,
        technologies: uniqueStrings(matchesFromList(body, TECH)),
        services: uniqueStrings(matchesFromList(body, SERVICES)),
        summary: body,
      }],
    };
  }

  if (kind === "credentials") {
    const lower = `${filename} ${body}`.toLowerCase();
    const credType = lower.includes("insur") ? "Insurance"
      : lower.includes("bond") ? "Bonding"
      : lower.includes("license") ? "License"
      : "Certification";
    const expiration = body.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]
      ?? body.match(/\b(20\d{2})\b/)?.[1]
      ?? "TBD";
    return {
      ...empty,
      credentials: [{
        name: linesOf(body)[0] || titleFromFilename(filename),
        credType,
        expiration,
        documentText: body,
        documentFileName: filename,
      }],
    };
  }

  const personSections = splitMultiPersonDocument(body);

  const people: ParsedPerson[] = personSections.map(section => {
    const sectionLines = linesOf(section);
    const name = sectionLines[0]?.replace(/^name:\s*/i, "") || titleFromFilename(filename);
    const roleLine = sectionLines.find(line => /role|manager|architect|lead|analyst|engineer|developer|designer|director|consultant|specialist/i.test(line)) ?? "";
    const roles = uniqueStrings(
      roleLine.split(/[,;/]/).map(part => part.replace(/^roles?:\s*/i, "").trim()).filter(part => part.length > 2)
    );
    return {
      name,
      roles: roles.length ? roles : ["Contributor"],
      expertise: "",
      technologies: uniqueStrings(matchesFromList(section, TECH)),
      industries: uniqueStrings(matchesFromList(section, INDUSTRIES)),
      resumeText: section,
      resumeFileName: filename,
    };
  });

  return { ...empty, people };
}

export function applyPartnerIngest(
  graph: GraphData,
  partnerId: string,
  result: PartnerIngestResult,
): { graph: GraphData; added: string[]; merged: string[] } {
  const added: string[] = [];
  const merged: string[] = [];
  const stamp = today();
  let capabilities = [...graph.capabilities];
  let experience = [...graph.experience];
  let credentials = [...graph.credentials];
  let people = [...graph.people];

  for (const item of result.capabilities) {
    const key = normalizeGraphName(item.name);
    const existing = capabilities.find(cap => normalizeGraphName(cap.name) === key);
    if (existing) {
      if (!existing.partners.includes(partnerId)) {
        capabilities = capabilities.map(cap =>
          cap.id === existing.id
            ? { ...cap, partners: [...cap.partners, partnerId], updated: stamp, status: cap.status === "Archived" ? "Pending" : cap.status }
            : cap
        );
      }
      merged.push(existing.name);
    } else {
      const created: GraphCapability = {
        id: nextId("CAP", capabilities),
        name: item.name,
        partners: [partnerId],
        status: "Pending",
        updated: stamp,
      };
      capabilities = [...capabilities, created];
      added.push(created.name);
    }
  }

  for (const item of result.experience) {
    const key = normalizeGraphName(item.name);
    const industryKey = normalizeGraphName(item.industry);
    const existing = experience.find(exp => {
      if (normalizeGraphName(exp.name) !== key) return false;
      if (!industryKey || !normalizeGraphName(exp.industry)) return true;
      return normalizeGraphName(exp.industry) === industryKey;
    });
    if (existing) {
      experience = experience.map(exp => {
        if (exp.id !== existing.id) return exp;
        return {
          ...exp,
          partners: exp.partners.includes(partnerId) ? exp.partners : [...exp.partners, partnerId],
          technologies: uniqueStrings([...exp.technologies, ...item.technologies]),
          services: uniqueStrings([...(exp.services ?? []), ...item.services]),
          industry: exp.industry || item.industry,
          summary: exp.summary && item.summary && !exp.summary.includes(item.summary)
            ? `${exp.summary}\n\n${item.summary}`
            : exp.summary || item.summary,
          updated: stamp,
          status: exp.status === "Archived" ? "Pending re-validation" : exp.status,
        };
      });
      merged.push(existing.name);
    } else {
      const created: GraphExperience = {
        id: nextId("EXP", experience),
        name: item.name,
        partners: [partnerId],
        capabilities: [],
        technologies: item.technologies,
        services: item.services,
        industry: item.industry,
        summary: item.summary,
        status: "Pending re-validation",
        updated: stamp,
      };
      experience = [...experience, created];
      added.push(created.name);
    }
  }

  for (const item of result.credentials) {
    const created: GraphCredential = {
      id: nextId("CRED", credentials, 3),
      name: item.name,
      credType: item.credType,
      partner: partnerId,
      scope: "",
      expiration: item.expiration || "TBD",
      status: "Pending",
      updated: stamp,
      documentText: item.documentText,
      documentFileName: item.documentFileName,
    };
    credentials = [...credentials, created];
    added.push(created.name);
  }

  for (const item of result.people) {
    const created: GraphPerson = {
      id: nextId("PPL", people, 3),
      name: item.name,
      partner: partnerId,
      role: item.roles[0] ?? "Contributor",
      roles: item.roles,
      skills: [],
      technologies: item.technologies,
      expertise: item.expertise,
      industries: item.industries,
      projectHistory: [],
      status: "Pending",
      updated: stamp,
      resumeText: item.resumeText,
      resumeFileName: item.resumeFileName,
    };
    people = [...people, created];
    added.push(created.name);
  }

  return { graph: { capabilities, experience, credentials, people }, added, merged };
}

export function applyResumeReplacement(person: GraphPerson, parsed: ParsedPerson): GraphPerson {
  return {
    ...person,
    role: parsed.roles[0] ?? person.role,
    roles: parsed.roles.length ? parsed.roles : person.roles,
    expertise: parsed.expertise || person.expertise,
    technologies: parsed.technologies.length ? parsed.technologies : person.technologies,
    industries: parsed.industries.length ? parsed.industries : person.industries,
    resumeText: parsed.resumeText,
    resumeFileName: parsed.resumeFileName,
    updated: today(),
  };
}

export async function ingestPartnerDocuments(
  kind: PartnerIngestKind,
  files: File[],
): Promise<PartnerIngestResult> {
  const combined: PartnerIngestResult = { kind, capabilities: [], experience: [], credentials: [], people: [] };
  if (!files.length) return combined;

  const form = new FormData();
  form.set("kind", kind);
  for (const file of files) form.append("files", file);

  const res = await fetch("/api/partners/ingest", { method: "POST", body: form });
  const data = await res.json().catch(() => ({})) as PartnerIngestResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Unable to parse partner documents.");
  }
  return {
    kind,
    capabilities: data.capabilities ?? [],
    experience: data.experience ?? [],
    credentials: data.credentials ?? [],
    people: data.people ?? [],
    warning: data.warning,
  };
}
