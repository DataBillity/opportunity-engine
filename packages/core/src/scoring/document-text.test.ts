import { describe, expect, it } from "vitest";
import {
  combineSolicitationDocuments,
  isQuestionAnswerDocument,
  normalizeSolicitationText,
  omitQuestionAnswerDocuments,
  orderSolicitationDocuments,
} from "./document-text";
import { extractSolicitationHeuristic } from "./pursuit-triage";

const header = "California Victim Compensation Board (CalVCB)\nRFI 26-001";

const pdfText = `${header}
Page 1 of 4
RFI No. 26-001
Compensation and Restitution System Modernization
RESPONSE REQUESTED NO LATER THAN: September 24th, 2026 2:00PM (PST)
ISSUED BY: State of California
${header}
Page 2 of 4
TABLE OF CONTENTS
1. INTRODUCTION AND OVERVIEW .................................................................. 3
A. PROJECT PURPOSE.................................................................................3
C. PROJECT VISION ....................................................................................3
D. CURRENT CHALLENGES ...........................................................................3
${header}
Page 3 of 4
1. INTRODUCTION AND OVERVIEW
CalVCB is issuing this Request for Information (RFI) to solicit input from qualified vendors for
a modernization solution to replace CalVCB's current claims processing system. This RFI is for
information and planning purposes only.
A. PROJECT PURPOSE
The objective is to conduct market research that will assist CalVCB in investigating alternatives to
modernizing the current processes with a highly configurable solution.
C. PROJECT VISION
CalVCB is seeking an agile, robust, highly configurable claims compensation and
restitution system. The solution should streamline, integrate, and automate process workflows
for internal and external users.
D. CURRENT CHALLENGES
Due to missing functionality and system limitations, external business processes have been created.
1. Lack of agility in making updates or additions to functionality within the current
system. Changes are heavily dependent on coding, resulting in time consuming updates.
${header}
Page 4 of 4
2. Lack of an adjustments module results in code updates and dependency on external databases.
3. Lack of appeals workflow resulting in external processes that are manually integrated.
4. Separation of duties must be managed manually, and the system does not provide any warning.
The current process results in:
• Higher number of phone calls and emails
• Increased escalations
• Inconsistent information
across divisions, claimants, and providers
E. SUBMISSION OF QUESTIONS
Questions must be submitted by September 2, 2026.

Attachment 3
Response to Vendor Questions
20. What is CalVCB's estimated timeframe for implementation and target go-live date?
A: To be determined.
21. Is there a budget range for the implementation?
A: These have not been established.
22. Is custom development on the table?
A: No preference.
23. Is a phased rollout acceptable?
A: No preference.
24. Is there an incumbent vendor?
A: No.`;

describe("normalizeSolicitationText", () => {
  it("drops table-of-contents entries, page markers, and running headers", () => {
    const text = normalizeSolicitationText(pdfText);
    expect(text).not.toMatch(/\.{5,}/);
    expect(text).not.toMatch(/Page \d of 4/);
    expect(text).not.toContain("California Victim Compensation Board (CalVCB)");
    expect(text).toContain("D. CURRENT CHALLENGES");
    expect(text).toContain("A: No preference.");
  });
});

describe("combining uploaded documents", () => {
  const upload = [
    { name: "26-001_CalVCB_2026_RFI_Modernization_Solution_Attachment_3.pdf", text: "Response to Vendor Questions\n1. Is there a budget?\nA: No." },
    { name: "26-001_CalVCB_2026_RFI_Modernization_Solution_Attachment_1.docx", text: "Part I: Company Information" },
    { name: "26-001_CalVCB_2026_RFI_Modernization_Solution_final.pdf", text: pdfText },
    { name: "empty-scan.pdf", text: "" },
  ];

  it("puts the main RFI first and the attachments in number order, whatever the upload order", () => {
    expect(orderSolicitationDocuments(upload).map(doc => doc.name.replace(/^26-001_CalVCB_2026_RFI_Modernization_Solution_/, ""))).toEqual([
      "final.pdf",
      "empty-scan.pdf",
      "Attachment_1.docx",
      "Attachment_3.pdf",
    ]);
  });

  it("labels each cleaned document and skips files with no text", () => {
    const combined = combineSolicitationDocuments(upload);
    expect(combined.match(/^===== DOCUMENT: .* =====$/gm)).toEqual([
      "===== DOCUMENT: 26-001_CalVCB_2026_RFI_Modernization_Solution_final.pdf =====",
      "===== DOCUMENT: 26-001_CalVCB_2026_RFI_Modernization_Solution_Attachment_1.docx =====",
      "===== DOCUMENT: 26-001_CalVCB_2026_RFI_Modernization_Solution_Attachment_3.pdf =====",
    ]);
    expect(combined).not.toMatch(/Page \d of 4/);
    const extraction = extractSolicitationHeuristic(combined, "26-001_CalVCB_2026_RFI_Modernization_Solution_final.pdf", "rfi");
    expect(extraction.inferredName).toBe("Compensation and Restitution System Modernization");
    expect(JSON.stringify(extraction)).not.toContain("===== DOCUMENT");
  });
});

describe("heuristic scope summary on real PDF text", () => {
  const extraction = extractSolicitationHeuristic(pdfText, "26-001_CalVCB_RFI.pdf", "rfi");

  it("finds the Current Challenges section, not the table of contents", () => {
    expect(extraction.challenges.length).toBeGreaterThanOrEqual(4);
    expect(extraction.challenges[0]).toMatch(/^Lack of agility/);
    expect(extraction.challenges.join(" ")).not.toMatch(/\.{5,}|Page \d/);
    expect(extraction.rfiSummary?.challengeThemes.find(theme => theme.rootCause)?.theme).toBe("Agility and change cost");
  });

  it("takes the objective from the scope, not the cover page or deadline", () => {
    expect(extraction.objective.join(" ")).toMatch(/replace CalVCB's current claims processing system|configurable/);
    expect(extraction.objective.join(" ")).not.toMatch(/RESPONSE REQUESTED|September 24/);
    expect(extraction.inferredName).toBe("Compensation and Restitution System Modernization");
  });

  it("reads the consequence bullets and open issuer answers", () => {
    expect(extraction.rfiSummary?.consequences).toEqual([
      "Higher number of phone calls and emails",
      "Increased escalations",
      "Inconsistent information across divisions, claimants, and providers",
    ]);
    const gaps = extraction.rfiSummary?.gaps.join("\n") ?? "";
    expect(gaps).toMatch(/Q20: .*To be determined/);
    expect(gaps).toMatch(/Q21: .*not been established/);
    expect(gaps).not.toMatch(/Q24/);
  });

  it("describes the end state from the vision, not the current system", () => {
    expect(extraction.deliverables.join(" ")).toMatch(/highly configurable claims compensation/);
  });
});

describe("vendor Q&A documents", () => {
  const worksheet = `PART II: Solution
Describe your proposed solution, highlighting where it can automate existing work.
Describe the product(s) and associated modules that will be included in your proposed solution.
What is your approach to User Acceptance testing?
How will existing data be validated prior to migration?`;
  const qa = `Response to Vendor Questions
RFI No. 26-001
40. Do you have a headcount for users in the Joint Powers offices and Criminal Restitution Compact offices?
A: Between 350-400 users.
44. Please provide approximate record counts and data volumes for claims, bills, and payments.
A: Use the link on the publications page.
50. How does CalVCB envision the scope of the future modernization effort?
A: To be determined.`;
  const docs = [
    { name: "26-001_RFI_final.pdf", text: pdfText },
    { name: "26-001_RFI_Attachment_1.docx", text: worksheet },
    { name: "26-001_RFI_Attachment_3.pdf", text: qa },
  ];
  const combined = combineSolicitationDocuments(docs);

  it("recognizes the Q&A by its title and leaves the worksheet alone", () => {
    expect(isQuestionAnswerDocument("Attachment_3.pdf", qa)).toBe(true);
    expect(isQuestionAnswerDocument("RFI_Questions_and_Answers.pdf", "1. Is there a budget?")).toBe(true);
    expect(isQuestionAnswerDocument("Attachment_1.docx", worksheet)).toBe(false);
    expect(isQuestionAnswerDocument("final.pdf", pdfText)).toBe(false);
  });

  it("replaces only the Q&A document and keeps every label", () => {
    const stripped = omitQuestionAnswerDocuments(combined, "vendor Q&A omitted");
    expect(stripped.match(/^===== DOCUMENT: .* =====$/gm)).toHaveLength(3);
    expect(stripped).toContain("[vendor Q&A omitted]");
    expect(stripped).not.toContain("headcount for users");
    expect(stripped).toContain("What is your approach to User Acceptance testing?");
    expect(omitQuestionAnswerDocuments("plain text with no labels")).toBe("plain text with no labels");
  });

  it("never turns vendor questions into questions to answer", () => {
    const extraction = extractSolicitationHeuristic(combined, "26-001_RFI_final.pdf", "rfi");
    const asked = extraction.requirements.map(item => item.requirementText).join("\n");
    expect(asked).toContain("What is your approach to User Acceptance testing?");
    expect(asked).not.toMatch(/headcount|record counts|future modernization/);
    expect(extraction.responseSections.map(section => section.title).join(" ")).not.toMatch(/Vendor Questions/i);
    expect(extraction.rfiSummary?.gaps.join("\n") ?? "").toMatch(/Q50/);
  });
});
