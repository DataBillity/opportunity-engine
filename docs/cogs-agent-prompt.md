# Handoff prompt

Copy everything below the line into the next agent.

---

You are working in the Opportunity Engine repo (DataBillity). Your job is to apply an already completed cost-of-goods-sold analysis. Treat the numbers and packaging rules below as settled. Recompute them only if `packages/ai/src/gateway.ts` or the Claude call sites have changed since this prompt was written.

This analysis is for the platform owner. It covers two things at once:

1. What it costs the platform owner to run **Tenant One** on the platform Claude key.
2. How to price **new tenants who bring their own Claude account**.

## Identity of the two bills

Tenant One is the owner workspace. In code that is the DataBillity organization, id `databillity` (`DATABILLITY_ORG_ID` in `packages/db/src/organization.ts`). It is inserted with `uses_platform_key = true` and no customer secret, so every Claude call uses `ANTHROPIC_API_KEY`. Anthropic invoices the platform owner.

New tenants are created in `apps/web/src/app/api/auth/signup/route.ts` with `usesPlatformKey: false`. Signup requires their own `sk-ant-…` key, stored encrypted on the organization. Model routes wrap work in `runWithAnthropicKey` (`packages/ai/src/gateway.ts`, `apps/web/src/lib/org-model.ts`). Those calls bill the tenant's Anthropic account. The platform owner's cost for that tenant is the shared stack only.

Resolution order in `resolveModelAccess`: a stored customer key wins; the platform key is used only when `usesPlatformKey` is true and no customer key is stored. Leave `uses_platform_key` off for paying tenants unless a platform-key credit pack is actually being sold. Do not add Claude credits to a bring-your-own-key package. That would charge them for tokens Anthropic already bills them for.

## Model rates (do not invent others)

The only model door is `callModel` in `packages/ai/src/gateway.ts`. Model id is `claude-sonnet-5-5`. Rates match Sonnet 5.5 list price:

- Uncached input: $2 / million tokens
- 1-hour cache write: $4 / million tokens
- 5-minute cache write: $2.50 / million tokens (the gateway requests 1-hour caches, so use $4)
- Cache read: $0.20 / million tokens
- Output: $10 / million tokens

`costFromUsage` in that file is the billing implementation. One credit, defined below, is $0.10 of that `costUsd`.

Token estimate used here: 4 characters of extracted solicitation text per token. `max_tokens` is 128,000. Callers do not set a lower cap. A single call that filled the output cap would cost about $1.28 in output before input. Normal drafts are much smaller. That cap is the tail a credit balance has to absorb.

The gateway sets `thinking: { type: "between_tools" }` and sends no tools. Sonnet 5.5 bills thinking as output. Expect thinking near zero. The 1.35× allowance below covers a parse retry on some steps plus a small amount of thinking.

`capSourceText` in `packages/core/src/scoring/pursuit-triage.ts` does not truncate; it only normalizes whitespace. The proposal route accepts up to 1.5 million characters of package text (about 375,000 tokens), inside Sonnet 5.5's 1 million token context.

## What spends Claude, and what does not

The worker (`apps/worker`) does not call Claude. Its 11 BullMQ queues log jobs and return. LinkedIn ingest, opportunity alignment, pursuit scoring, and ICP matching are deterministic and cost no tokens.

`packages/ai/src/lead-agent-prompts.ts` is not called. Do not budget credits for it.

Every real Claude spend is one of these:

| Action | Route | Calls | Cache behavior |
| --- | --- | --- | --- |
| RFP ingest | `POST /api/projects/ingest` | 2 extraction passes (`extractSolicitationWithModel`) and 1 Go/No-Go (`assessRfpGoNoGo`), started together with `Promise.all` | Three different prefixes. Each cold-starts a 1-hour cache write of the package. Parallel calls do not share a cache. |
| RFI or SOW ingest | same route | 2 extraction passes. No Go/No-Go. | Two cold writes of the package. |
| Go/No-Go rerun | `POST /api/projects/gonogo` | 1, with one retry on unusable JSON | A rerun inside the hour reads the ingest write. |
| RFP proposal | `POST /api/response/rfp`, client driver `runRfpProposalJob` in `apps/web/src/lib/rfp-proposal-generation.ts` | 1 plan, then up to 6 section batches (`batchProposalSections`, max 4 sections or 7 pages per batch) plus forms and compliance in parallel, then 1 review. A typical proposal is about 8 calls. Each step retries once on unusable JSON. Failed section batches get one extra try. | `buildRfpProposalPromptParts` puts the package, Go/No-Go text, capabilities, partners, and reviewer notes in `cachePrefix`. The plan writes that prefix. Later steps in the same hour read it at 10% of input price. |
| RFI or SOW full draft | `POST /api/response/generate` with `mode: "package"` (`generateRfiResponsePackage`), then a cover letter | 2 | System prompt is a 1-hour cache block. For an RFI, `collectResponseFacts` includes the full source excerpt in the user message, billed as normal input every time. A SOW package includes the source excerpt only when no `rfiSummary` exists. After a successful ingest, the summary exists, so the SOW draft is facts-only. |
| One section | RFP: another `sections` step via `runRfpSectionJob`. RFI/SOW: `generateResponseDraft` with default `includeSourceExcerpt` | 1 | A warm RFP section reads the package cache. An RFI or SOW section sends the source text again as uncached input. |
| Partner file | `POST /api/partners/ingest` | 1 per file, max 5 files, 12 MB each | The whole user message is `cachePrefix`. It is written and usually never read. |
| Outreach | `POST /api/outreach/generate` | 1 | Short. About half a cent. |

Upload limits: 5 files, 12 MB each (`MAX_FILE_BYTES`, `MAX_FILES` in `apps/web/src/lib/extract-document.ts`). Ingest and proposal routes set `maxDuration = 300`.

## Settled unit costs on the platform key

Document bands are extracted text, not PDF bytes. Light ≈ 15,000 tokens (~20 pages). Standard ≈ 40,000 tokens (~60–80 pages). Heavy ≈ 120,000 tokens (~200 pages). Proposal prompts also send clipped capability resumes and the Go/No-Go JSON.

These are clean-run Claude costs. Multiply by 1.35 when granting credits.

| Action | Light | Standard | Heavy |
| --- | ---: | ---: | ---: |
| RFP ingest (extract + Go/No-Go) | $0.31 | $0.68 | $1.71 |
| RFP proposal draft | $0.36 | $0.85 | $1.85 |
| RFP, ingest and one full draft | $0.67 | $1.54 | $3.57 |
| RFP section, cache still warm | $0.05 | $0.08 | $0.13 |
| RFP section, cache expired | $0.15 | $0.31 | $0.70 |
| RFI, ingest and full draft and cover letter | $0.32 | $0.67 | $1.61 |
| RFI or SOW section regen (source sent again) | $0.05 | $0.10 | $0.26 |
| SOW, ingest and full draft and cover letter | $0.26 | $0.54 | $1.27 |
| Partner file | $0.02 | $0.06 | $0.14 |
| Outreach email | $0.01 | $0.01 | $0.01 |

A package at the 1.5 million character cap is about $8.10 for ingest plus one proposal draft ($11 after the 1.35 allowance). Most of that is three simultaneous cache writes of the same text at double input price.

Credit equivalents after the 1.35 allowance, at $0.10 per credit:

- Standard RFP cycle: 21 credits
- Heavy RFP cycle: 49 credits
- Max-size RFP cycle: 110 credits
- Light RFP cycle: 9 credits

## Tenant One monthly budget

These are the platform owner's Anthropic invoices for operating Tenant One.

| Month | Activity | Modeled Claude | Allowance (1.35×) |
| --- | --- | ---: | ---: |
| Quiet | 1 light RFP, 1 standard RFI, 4 partner files, 10 emails, 2 warm section edits | $1.73 | $3 |
| Active | 2 standard RFPs, 2 light RFPs, 3 RFIs, 1 SOW, section edits, 15 partner files, 40 emails | $10.35 | $14 |
| Heavy | 6 heavy RFPs, 4 standard RFPs, 3 heavy RFIs, 4 full redrafts, 20 large partner files | $42.82 | $58 |

One extra max-size RFP adds about $8 modeled, $11 allowance.

## Credit rules

1 credit = $0.10 of platform Claude `costUsd`. Grant the allowance, not the raw model figure.

| Grant | Credits | Claude covered |
| --- | ---: | ---: |
| Quiet month | 30 | $3 |
| Standing grant for an active Tenant One month | 150 | $15 |
| Heavy month | 600 | $60 |
| Top-up pack | 100 | $10 |

Use 150 credits as the standing monthly grant. A proposal-heavy month needs 600 credits, or the standing grant plus five top-up packs.

If a future tenant is ever put on the platform key, sell the credit at $0.15 or more so the token cost is covered. At $0.10 the pack matches Anthropic and leaves no margin for support or card fees. Do not sell those credits to a tenant who brings their own key.

## Shared stack (the platform owner pays this for Tenant One and every other tenant)

| Service | Role | Monthly COGS |
| --- | --- | --- |
| Vercel Pro | Next.js app. Ingest and drafting run as functions with `maxDuration` 300. | $20 plan, including $20 usage credit. A long Claude wait in `iad1` is about $0.001 of CPU plus provisioned memory (memory is billed while the function waits on Anthropic). Hundreds of drafts stay inside the credit. |
| Railway Pro | Worker plus Redis. | $20 plan, including $20 usage. Idle worker roughly 0.1 vCPU and 0.4 GB, plus a small Redis, is about $8–15 of usage, inside the credit. Railway resource rates: $20 / vCPU-month, $10 / GB RAM-month, $0.05 / GB egress, $0.15 / GB volume-month. |
| Neon Launch | One shared Postgres. Workspace JSON, including solicitation text, is in `shared_workspace`. | $10 typical. $40 if 0.5 CU stays on all month. Rates: $0.106 / CU-hour, $0.35 / GB-month, scale-to-zero after 5 minutes. Storage for dozens of packages is cents. |
| Resend | Password reset only. | $0 under 3,000 emails/month. Pro is $20 for 50,000. |
| Cloudflare R2 | Optional. Uploads are parsed in the request and stored as text in Postgres, not as objects. | $0 until objects are stored. Then $0.015 / GB-month, no egress fee. |
| Langfuse, Cloudflare AI Gateway, Turnstile, Google OAuth | Present as optional env vars. The gateway calls `https://api.anthropic.com/v1/messages` directly. | $0 until those products are turned on. |

Shared stack is about $50/month, and about $80/month if Neon stays warm. That bill exists for Tenant One alone. Each extra bring-your-own-Claude workspace adds about $1–3/month (a slice of Neon, a few long Vercel calls, workspace storage) until count forces Vercel overage or a larger Neon compute. Around 200 active workspaces the stack can rise to $100–180/month total. A busy Tenant One Claude bill is still the larger line.

## How to price a new tenant who brings their own Claude account

Their Anthropic invoice is theirs. The platform fee covers hosting only: app, database, worker, auth email. No model credits.

| Situation | Incremental COGS | Fully loaded share of the $50–80 floor |
| --- | ---: | ---: |
| First few paying tenants | $1–3 | $25–40, because two or three fees have to carry Vercel, Railway, and Neon |
| About 10 tenants | $1–3 | $8–12 |
| About 25 tenants | $2–4 | $5–8 |

The single public price that covers cost from the first paying tenant is **$40 per workspace per month**. Two tenants at that price cover the $80 stack ceiling. Raise that fee when a tenant's storage or support load shows up in Neon or Vercel. Do not raise it because their proposals got longer.

## Packages to set up

| Package | Who pays Claude | Include | Cost it covers |
| --- | --- | --- | --- |
| Tenant One, internal | Platform owner | 150 credits/month standing, 100-credit top-ups, 600 credits in a heavy month | $15 Claude in an ordinary month, $60 in a heavy month, plus the shared $50–80 stack |
| Workspace, bring your own Claude | The tenant | App, database, worker, auth email. No credits. | $40 / workspace / month while the tenant count is small |

## Rules for whatever you build or recommend next

- Meter platform-key usage from gateway `costUsd`, not from a flat "per pursuit" guess, once logging exists. Until then, use the credit grants above.
- Do not flip `uses_platform_key` on for a customer organization in order to "include AI" in the $40 fee.
- Do not size credits for scoring, search, pipeline, LinkedIn import, or the Railway worker. Those paths do not call Claude.
- Do not assume RFI section edits are as cheap as warm RFP section edits. RFI and SOW section drafts resend the source text as uncached input.
- Keep the 1.35× allowance when converting a modeled dollar figure into credits.
- The longer write-up of this same analysis is `docs/cogs-platform-owner.md`. If that file and this prompt disagree, this prompt is the instruction and the doc is the backup.
