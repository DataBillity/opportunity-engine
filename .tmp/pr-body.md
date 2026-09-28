## Why
Carey's feedback on the CalVCB RFI: the Objective read "provide information… by when," Challenges said none were found even though the RFI has a "Current Challenges" section, and the Response Builder showed no change. Her follow-up asked whether the platform parses the document separately from summarizing it, and included a revised summary prompt.

It does, and that split was the problem. Production data shows OPP-2629's summary was built entirely by the text parser (`triageMode: heuristic`), and its stored objective is literally the cover page and table of contents:
1. **Text extraction:** each file becomes plain text. Files were joined with no labels, so the model couldn't tell the main RFI from the worksheet or the Q&A. The first file uploaded was treated as the main document; for OPP-3384 that was Attachment 1.
2. **Text parser (always runs):** sentence matching. It broke on PDF text: table-of-contents lines, page headers.
3. **Model summary:** merged over the parser's output field by field. When the model failed (truncated output at 7,000 tokens), the parser's output was all that was left. When the model succeeded but left a field empty, the parser filled it. That's where the table-of-contents "Next step" and the evidence cut off at a fixed length came from.

## What changed
**Commit 1: robustness**
- RFI extraction runs as two parallel passes. The summary pass (Claude) writes the Scope Summary; the structure pass (Gemini) extracts requirements.
- Truncated JSON is repaired, and a parse failure retries once with the other provider. Ingest `maxDuration` is 300.
- The parser strips table-of-contents lines, page markers, and running headers, and anchors section headings.
- RFI package drafting gets 14,000 tokens, a 130 s timeout, and a provider retry. The generate route's `maxDuration` is 300.

**Commit 2: the PM's prompt and platform changes it asked for**
- **New summary prompt** (`packages/ai/src/rfi-summary-prompt.ts`), the PM's text with small adaptations:
  - Service rows use our `service` field.
  - The example's response sections are objects.
  - The prompt knows about the document labels.
  - Requirements, eligibility constraints, and pass/fail stay in the parallel structure pass so the summary can't be cut off.
- **Documents are labeled and ordered:** each file becomes `===== DOCUMENT: name =====` and is cleaned separately. The main RFI goes first, then attachments in number order. The request lists every file.
- **`issuerQuestions`** added to the schema (question, basis, evidence, type, priority, timing). It's shown as "Questions for the issuer" after the Scope Summary, and gaps are relabeled "Gaps for the bid team".
- **No parser backfill:** when the model writes the summary, its fields stand as returned. The parser is used only when the model summary fails entirely.
- **Source line:** the Scope Summary says which model wrote it. If the text parser wrote it, it says so, gives the reason, and asks for a re-upload.
- **Drafter:**
  - Receives the issuer questions and the Scope Summary framing.
  - Response-format rules are binding: no cover letter or extra material when the worksheet is the response or attachments are prohibited, and the most restrictive reading wins.
  - Section list follows the worksheet parts.
- Lenient parsing: `name` in service rows is read as `service`, and response sections sent as strings ("Part I: Company Information") are accepted.

## Verification
- Core tests (29) and ai tests (10) pass, including new tests for:
  - document ordering and labels,
  - the no-backfill merge,
  - issuer-question parsing,
  - JSON repair,
  - PDF-style text.
- `tsc` is clean for contracts, core, ai, and web.
- The real CalVCB files run through the new pipeline produce clean model input: main RFI first, labeled attachments, with the table of contents and page headers removed.
- The live model run with the new prompt is still to do. Model keys aren't available locally right now.

## Caveat
The prompt's illustrative example is the CalVCB RFI itself, so a CalVCB re-run will look close to perfect whether or not the prompt generalizes. It should also be checked on a different RFI.

## After deploy
Existing pursuits keep their stored summary; re-upload the CalVCB documents as an **RFI**. OPP-3384 is typed RFP (it predates project types), so it shows the RFP flow in the Response Builder.
