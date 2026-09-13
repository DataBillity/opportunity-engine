/**
 * DataBillity / Billity AI commercial capability taxonomy.
 * Source of truth: DataBillity Capability Statement (Billity AI + consulting/JV).
 * Pure functions — no I/O.
 */
export const BILLITY_CAPABILITIES = [
  {
    id: "agentic_sales_marketing",
    lane: "platform" as const,
    label: "Omnichannel Billity Bots / Contact Copilot / Ad Engine",
    patterns: [
      /\bai agent/, /agentic/, /sales engagement/, /marketing automation/,
      /auto-?pilot/, /co-?pilot/, /chatbot/, /sms marketing/, /email marketing/,
      /google ads/, /meta ads/, /performance max/, /mailchimp/,
    ],
  },
  {
    id: "cdp_identity",
    lane: "platform" as const,
    label: "Customer Data Platform / deterministic identity / Lead Graph",
    patterns: [
      /\bcdp\b/, /customer data platform/, /identity resolution/, /look-?alike/,
      /customer 360/, /persona/, /lead graph/, /rfm/, /engagement score/,
    ],
  },
  {
    id: "recommendation_personalization",
    lane: "platform" as const,
    label: "Hyper-personalized recommendation engine",
    patterns: [
      /personalization/, /recommendation engine/, /next-best/, /propensity/,
      /hyper-?personal/,
    ],
  },
  {
    id: "caan_consent",
    lane: "platform" as const,
    label: "CAAN / consent-first network / clean rooms",
    patterns: [
      /\bconsent\b/, /gdpr/, /ccpa/, /cpra/, /pipeda/, /\bcasl\b/, /clean room/,
      /first-party data/, /preference center/, /opt-?out/, /data sharing/,
    ],
  },
  {
    id: "messaging_compliance",
    lane: "platform" as const,
    label: "Messaging Compliance Layer (SMS/email)",
    patterns: [
      /tcpa/, /10dlc/, /quiet hours/, /messaging compliance/, /can-?spam/,
    ],
  },
  {
    id: "loyalty_omnichannel",
    lane: "platform" as const,
    label: "Loyalty, CRM, omnichannel guest/shopper engagement",
    patterns: [
      /loyalty/, /rewards/, /\bcrm\b/, /guest engagement/, /omnichannel/,
      /in-store/, /check-in/, /gohighlevel|\bghl\b/, /shopify/,
    ],
  },
  {
    id: "custom_development",
    lane: "consulting" as const,
    label: "Custom development, automation & integration",
    patterns: [
      /custom (software|development|application)/, /software engineering/,
      /api integration/, /systems integration/, /application development/,
      /full-?stack/,
    ],
  },
  {
    id: "analytics_bi",
    lane: "consulting" as const,
    label: "Analytics and BI (Tableau, Looker, Sigma, Power BI)",
    patterns: [
      /\bbi\b/, /business intelligence/, /tableau/, /looker/, /\bsigma\b/,
      /power bi/, /\bqlik\b/, /self-service analytics/, /executive dashboard/,
      /customer analytics/, /revops/,
    ],
  },
  {
    id: "data_engineering_edw",
    lane: "consulting" as const,
    label: "Data engineering, lake/warehouse modernization",
    patterns: [
      /data warehouse/, /lakehouse/, /etl/, /\belt\b/, /dbt\b/, /snowflake/,
      /databricks/, /microsoft fabric/, /data pipeline/, /data migration/,
      /medallion/, /azure data factory/,
    ],
  },
  {
    id: "compliance_governance",
    lane: "consulting" as const,
    label: "Compliance, privacy & operational governance",
    patterns: [
      /compliance/, /soc 2/, /iso 27001/, /pci-?dss/, /hipaa/, /fedramp/,
      /ai governance/, /nist ai/, /privacy officer/, /dpo\b/,
    ],
  },
  {
    id: "cybersecurity",
    lane: "consulting" as const,
    label: "Cybersecurity, SOC, VAPT, DFIR (JV)",
    patterns: [
      /cybersecurity/, /\bsoc\b/, /penetration test/, /\bvapt\b/,
      /incident response/, /zero-?trust/, /vulnerability/,
    ],
  },
  {
    id: "ai_ml_implementation",
    lane: "consulting" as const,
    label: "AI/ML implementation, agent orchestration, fractional CDO/CTO",
    patterns: [
      /machine learning/, /mlops/, /production ai/, /responsible ai/,
      /fractional (cto|cdo|cpo)/, /model deployment/, /llm\b/,
    ],
  },
] as const;

export type BillityCapabilityId = (typeof BILLITY_CAPABILITIES)[number]["id"];
export type CommercialLane = "platform" | "consulting";

export interface CapabilityMatch {
  capabilityId: BillityCapabilityId;
  label: string;
  lane: CommercialLane;
  confidence: number;
  evidence: string;
  sourceRef: string;
  sourceType: "linkedin_profile" | "company_website" | "public_web" | "linkedin_company";
}

export interface PublicSignal {
  sourceType: CapabilityMatch["sourceType"];
  sourceRef: string;
  snippet: string;
  capturedAt: string;
}

/** Commercial ICPs from capability statement + confirmed GTM verticals. */
export const ICP_VERTICALS = [
  {
    id: "automotive",
    sector: "automotive",
    industry: "Automotive OEMs & dealerships",
    pattern: /automotiv|\boem\b|dealership|dealer group|auto group|\bcdk\b|dealertrack|ford motor|general motors|toyota|stellantis|auto dealer|car dealership|volkswagen|cariad/i,
  },
  {
    id: "payment_processor_iso",
    sector: "financial_services",
    industry: "Payment processors & ISOs",
    pattern: /\biso\b|independent sales org|merchant services|payment processor|payfac|payment facilitator|acquir(?:er|ing)|merchant acquir|iso\/msp|card processing/i,
  },
  {
    id: "fintech",
    sector: "financial_services",
    industry: "Fintech",
    pattern: /fintech|embedded finance|open banking|neobank|digital wallet|billing platform|accounts payable|invoice automation/i,
  },
  {
    id: "marketing_agency",
    sector: "marketing_agency",
    industry: "Marketing agencies",
    pattern: /marketing agency|digital agency|advertising agency|media agency|performance agency|growth agency|gohighlevel|\bghl\b|hubspot partner|full-?service agency|multi-brand/i,
  },
  {
    id: "data_provider",
    sector: "data_provider",
    industry: "Big data providers",
    pattern: /data provider|data broker|big data|snowflake|databricks|data marketplace|identity graph|data cooperative|experian|transunion|acxiom/i,
  },
  {
    id: "airline",
    sector: "travel",
    industry: "Airlines",
    pattern: /airline|air lines|aviation|airways|air canada|alaska airlines|delta air|united airlines|american airlines|southwest airline|jetblue|westjet/i,
  },
  {
    id: "hospitality",
    sector: "hospitality",
    industry: "Hospitality & hospitality solutions",
    pattern: /hospitality|hotel|resort|outrigger|marriott|hilton|hyatt|ihg|guest experience|lodging|vacation rental|opentable/i,
  },
  {
    id: "ecommerce",
    sector: "ecommerce",
    industry: "E-commerce platforms",
    pattern: /e-?commerce|ecommerce platform|shopify|bigcommerce|magento|woocommerce|marketplace platform/i,
  },
  {
    id: "retail",
    sector: "retail",
    industry: "Retailers",
    pattern: /retail|grocer|grocery|department store|apparel|qsr|quick service|starbucks|nordstrom|walmart|target|lululemon|aritzia|safeway/i,
  },
  {
    id: "government",
    sector: "government",
    industry: "Government / public sector",
    pattern: /government|public sector|federal reserve|fedramp|\bcjis\b|municipal|state of|city of/i,
  },
] as const;

export type IcpVerticalId = (typeof ICP_VERTICALS)[number]["id"];

export interface IcpVerticalMatch {
  id: IcpVerticalId;
  sector: string;
  industry: string;
}

const KNOWN_COMPANY_VERTICAL: Record<string, IcpVerticalId> = {
  shopify: "ecommerce",
  stripe: "fintech",
  visa: "fintech",
  mastercard: "payment_processor_iso",
  paypal: "fintech",
  "bill com": "fintech",
  bill: "fintech",
  "apptech payments corp": "payment_processor_iso",
  "global payments inc": "payment_processor_iso",
  "bluefin payment systems": "payment_processor_iso",
  cardflight: "payment_processor_iso",
  "celero commerce": "payment_processor_iso",
  paysafe: "payment_processor_iso",
  "air canada": "airline",
  "alaska airlines": "airline",
  "delta air lines": "airline",
  hahnair: "airline",
  starbucks: "retail",
  walmart: "retail",
  nordstrom: "retail",
  lululemon: "retail",
  aritzia: "retail",
  amazon: "retail",
  "outrigger hospitality group": "hospitality",
  airbnb: "hospitality",
  "the walt disney company": "hospitality",
  "walt disney parks and resorts online": "hospitality",
  "city of seattle": "government",
};

export function inferIcpVertical(text: string, companyKey?: string): IcpVerticalMatch | null {
  if (companyKey) {
    const known = KNOWN_COMPANY_VERTICAL[companyKey];
    if (known) {
      const v = ICP_VERTICALS.find((item) => item.id === known);
      if (v) return { id: v.id, sector: v.sector, industry: v.industry };
    }
  }
  for (const v of ICP_VERTICALS) {
    if (v.pattern.test(text)) {
      return { id: v.id, sector: v.sector, industry: v.industry };
    }
  }
  return null;
}

export function matchBillityCapabilities(
  text: string,
  sourceRef: string,
  sourceType: CapabilityMatch["sourceType"],
): CapabilityMatch[] {
  const haystack = text.toLowerCase();
  if (!haystack.trim()) return [];
  const matches: CapabilityMatch[] = [];
  for (const cap of BILLITY_CAPABILITIES) {
    const hit = cap.patterns.find((p) => p.test(haystack));
    if (!hit) continue;
    matches.push({
      capabilityId: cap.id,
      label: cap.label,
      lane: cap.lane,
      confidence: sourceType === "linkedin_profile" ? 0.55 : 0.8,
      evidence: excerptAround(text, hit),
      sourceRef,
      sourceType,
    });
  }
  return matches;
}

export function commercialMotionOf(matches: CapabilityMatch[]): "platform" | "consulting" | "both" | "none" {
  const platform = matches.some((m) => m.lane === "platform");
  const consulting = matches.some((m) => m.lane === "consulting");
  if (platform && consulting) return "both";
  if (platform) return "platform";
  if (consulting) return "consulting";
  return "none";
}

export function isIcpSector(sector: string | null | undefined): boolean {
  if (!sector) return false;
  return ICP_VERTICALS.some((v) => v.sector === sector.toLowerCase());
}

export function isIcpBuyingRole(title: string): boolean {
  const t = title.toLowerCase();
  return /chief|founder|president|\bvp\b|vice president|head of|director|cpo|cmo|cro|cto|cio|cfo|cdo|ciso|cdo/.test(t)
    && /product|payment|loyalty|data|ai|digital|marketing|revenue|growth|partnership|commerce|customer|analytics|crm|billing|compliance|security|privacy|warehouse|engineering/.test(t)
    || /chief (product|marketing|revenue|data|digital|technology|ai|information|privacy|compliance)|head of (product|payments|loyalty|data|ai|digital|crm|analytics|compliance)/.test(t);
}

export function mergeCapabilityMatches(groups: CapabilityMatch[][]): CapabilityMatch[] {
  const byId = new Map<string, CapabilityMatch>();
  for (const group of groups) {
    for (const match of group) {
      const prev = byId.get(match.capabilityId);
      if (!prev || match.confidence > prev.confidence) byId.set(match.capabilityId, match);
    }
  }
  return [...byId.values()];
}

export function initiativeIntentFromText(text: string): boolean {
  return /launch|initiative|moderniz|transform|replacing|rfp|implement|rolling out|investing in|platform/.test(text.toLowerCase());
}

function excerptAround(text: string, pattern: RegExp): string {
  const match = pattern.exec(text.toLowerCase());
  if (!match || match.index === undefined) return text.slice(0, 160);
  const start = Math.max(0, match.index - 60);
  const end = Math.min(text.length, match.index + 120);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}
