import type { ProjectType } from "@opportunity-engine/contracts";

export type { ProjectType };

export const BID_REC_THRESHOLDS = {
  goCoverage: 0.75,
  goScore: 68,
  condCoverage: 0.45,
  condScore: 52,
} as const;

export const RFI_REC_THRESHOLDS = {
  goCoverage: 0.35,
  goScore: 55,
  condCoverage: 0.15,
  condScore: 45,
} as const;

export function laneForProjectType(type: ProjectType): "B" | "C" {
  return type === "sow" ? "C" : "B";
}

export function projectTypeFromLane(lane: "B" | "C"): ProjectType {
  return lane === "C" ? "sow" : "rfp";
}

export function projectTypeLabel(type: ProjectType): string {
  return { rfp: "RFP", rfi: "RFI", sow: "SOW" }[type];
}

/** Used when an RFI does not prescribe its own response headings. */
export const RFI_OUTLINE_SECTIONS = [
  { ref: "Cover", title: "Cover letter", sectionId: "cover" },
  { ref: "Company", title: "Company and team overview", sectionId: "company" },
  { ref: "Understanding", title: "Understanding of the requirement", sectionId: "understanding" },
  { ref: "Questions", title: "Responses to specific questions", sectionId: "questions" },
  { ref: "Experience", title: "Relevant experience", sectionId: "experience" },
  { ref: "Recommendations", title: "Recommendations for the future solicitation", sectionId: "recommendations" },
  { ref: "Contacts", title: "Points of contact", sectionId: "contacts" },
] as const;

export function projectTypeLongLabel(type: ProjectType): string {
  return {
    rfp: "Request for Proposal",
    rfi: "Request for Information",
    sow: "Statement of Work",
  }[type];
}

export function recDecisionLabel(
  rec: "go" | "nogo" | "cond" | "pending",
  projectType: ProjectType = "rfp",
): string {
  if (projectType === "rfi") {
    return { go: "Respond", nogo: "Pass", cond: "Respond with caveats", pending: "Pending" }[rec];
  }
  return { go: "Go", nogo: "No-Go", cond: "Go with conditions", pending: "Pending" }[rec];
}

export function recShortLabel(
  rec: "go" | "nogo" | "cond" | "pending",
  projectType: ProjectType = "rfp",
): string {
  if (projectType === "rfi") {
    return { go: "RESPOND", nogo: "PASS", cond: "CAVEATS", pending: "PENDING" }[rec];
  }
  return { go: "GO", nogo: "NO-GO", cond: "CONDITIONS", pending: "PENDING" }[rec];
}

export function isRfiDocument(text: string, filename = ""): boolean {
  const name = filename.toLowerCase();
  const hay = `${name}\n${text}`.toLowerCase();
  if (/\brequest for information\b/.test(hay)) return true;
  if (/\brfi\b/.test(name) && !/\brfp\b/.test(name)) return true;
  if (/\bthis rfi\b/.test(hay)) return true;
  if (/\brfi\b/.test(hay) && !/\brequest for proposal\b/.test(hay) && !/\brfp\b/.test(hay)) return true;
  return false;
}

export function resolveProjectType(input: {
  selected?: ProjectType | null;
  lane?: "B" | "C";
  text?: string;
  filename?: string;
}): { projectType: ProjectType; detectedFromDocument: boolean; overridden: boolean } {
  const selected = input.selected ?? (input.lane === "C" ? "sow" : input.lane === "B" ? "rfp" : undefined);
  const detectedRfi = isRfiDocument(input.text ?? "", input.filename ?? "");

  if (selected === "rfi") {
    return { projectType: "rfi", detectedFromDocument: detectedRfi, overridden: false };
  }
  if (selected === "sow") {
    return { projectType: "sow", detectedFromDocument: false, overridden: false };
  }
  if ((selected === "rfp" || !selected) && detectedRfi) {
    return { projectType: "rfi", detectedFromDocument: true, overridden: selected === "rfp" };
  }
  return { projectType: selected ?? "rfp", detectedFromDocument: false, overridden: false };
}

export function thresholdsFor(projectType: ProjectType) {
  return projectType === "rfi" ? RFI_REC_THRESHOLDS : BID_REC_THRESHOLDS;
}
