# Platform COGS: Tenant One and bring-your-own-Claude tenants

This is the cost of goods sold for the platform owner running Opportunity Engine.

Two bills are separate:

1. **Tenant One** is the owner workspace. In this codebase that is the DataBillity organization (`databillity`). It is created with `uses_platform_key = true` and no customer key, so every Claude call uses `ANTHROPIC_API_KEY`. Anthropic invoices the platform owner.
2. **New tenants** sign up with their own Claude key. Signup sets `uses_platform_key = false` and stores that key on the organization. `runWithAnthropicKey` sends their calls to their Anthropic account. The platform owner's COGS for those tenants is the shared stack only.

A stored customer key wins over the platform key. Leave `uses_platform_key` off for paying tenants unless a platform-key credit pack is actually being sold.

Rates below are Claude Sonnet 5.5 list prices, which match `packages/ai/src/gateway.ts`: **$2 / MTok input, $4 / MTok for a 1-hour cache write, $0.20 / MTok cache read, $10 / MTok output**. One token is estimated at 4 characters of extracted solicitation text. Figures are model cost for a clean run. A planning allowance of **1.35×** covers a parse retry on some steps and a small amount of thinking billed as output. The gateway asks for `thinking: between_tools` and does not send tools, so thinking is expected to stay near zero.

## What spends Claude

Every model call goes through `callModel`. The worker does not call Claude. LinkedIn ingest, opportunity alignment, pursuit scoring, and ICP matching are deterministic.

| Action | Route | Calls | What is cached for 1 hour |
| --- | --- | --- | --- |
| RFP ingest | `POST /api/projects/ingest` | 2 extraction passes and 1 Go/No-Go, in parallel | Each call writes its own copy of the package. Parallel calls do not share a cache. |
| RFI or SOW ingest | same route | 2 extraction passes | Same pattern, no Go/No-Go. |
| Go/No-Go rerun | `POST /api/projects/gonogo` | 1 | A rerun inside the hour reads the ingest write. |
| RFP proposal | `POST /api/response/rfp`, driven by `runRfpProposalJob` | 1 plan, then up to 6 section batches plus forms and compliance, then 1 review. A typical proposal is about 8 calls. | The plan writes the package, capabilities, and Go/No-Go text. Later steps in that hour read it back at 10% of input price. |
| RFI or SOW full draft | `POST /api/response/generate` (`mode: package`) plus a cover letter | 2 | The system prompt is cached. The RFI source text sits in the user message and is billed as normal input on every draft. |
| One section | RFP: another proposal step. RFI/SOW: `mode` omitted | 1 | A warm RFP section reads the package cache. An RFI or SOW section sends the source text again as normal input. |
| Partner file | `POST /api/partners/ingest` | 1 per file, up to 5 | The file is written to cache and usually never read back. |
| Outreach email | `POST /api/outreach/generate` | 1 | Short prompt. About half a cent. |

`capSourceText` does not truncate. The proposal route accepts up to 1.5 million characters of package text (about 375,000 tokens), which still fits Sonnet 5.5's 1M context. Output is allowed up to the model maximum of 128,000 tokens. A call that actually filled that cap would cost about **$1.28 in output** before input. Normal drafts are far smaller. That cap is the tail risk a credit balance has to absorb.

Lead-agent prompts in `packages/ai/src/lead-agent-prompts.ts` are not called.

## Cost of one pursuit on the platform key

Document bands are extracted text, not PDF bytes: **light ~15k tokens (~20 pages), standard ~40k tokens (~60–80 pages), heavy ~120k tokens (~200 pages)**. Capabilities text sent with a proposal includes clipped resumes. Go/No-Go JSON is sent again into the proposal prompt.

| Action | Light | Standard | Heavy |
| --- | ---: | ---: | ---: |
| RFP ingest (extract + Go/No-Go) | $0.31 | $0.68 | $1.71 |
| RFP proposal draft | $0.36 | $0.85 | $1.85 |
| **RFP, ingest and one full draft** | **$0.67** | **$1.54** | **$3.57** |
| RFP section, cache still warm | $0.05 | $0.08 | $0.13 |
| RFP section, cache expired | $0.15 | $0.31 | $0.70 |
| RFI, ingest and full draft and cover letter | $0.32 | $0.67 | $1.61 |
| RFI or SOW section regen (source sent again) | $0.05 | $0.10 | $0.26 |
| SOW, ingest and full draft and cover letter | $0.26 | $0.54 | $1.27 |
| Partner file | $0.02 | $0.06 | $0.14 |
| Outreach email | $0.01 | $0.01 | $0.01 |

A package at the 1.5 million character cap is about **$8.10** for ingest plus one proposal draft. Most of that is three cold cache writes of the same text at double input price during ingest, because those three calls start together.

The RFP draft is the step that uses the cache well: one write, then about seven reads. An RFI draft does not put the source text on a cache breakpoint, so editing several RFI sections repeats the document price.

## Tenant One monthly Claude bill

These are the platform owner's Anthropic invoices for operating Tenant One. Add the 1.35× allowance when granting credits.

| Month | What Tenant One did | Modeled Claude | Allowance (1.35×) |
| --- | --- | ---: | ---: |
| Quiet | 1 light RFP, 1 standard RFI, 4 partner files, 10 emails, 2 warm section edits | $1.73 | $3 |
| Active | 2 standard and 2 light RFPs, 3 RFIs, 1 SOW, section edits, 15 partner files, 40 emails | $10.35 | $14 |
| Heavy | 6 heavy RFPs, 4 standard RFPs, 3 heavy RFIs, 4 full redrafts, 20 large partner files | $42.82 | $58 |

One extra max-size RFP on top of any of these adds about **$8 modeled, $11 allowance**.

## Credits for Tenant One

Define **1 credit = $0.10 of platform Claude cost** (the `costUsd` the gateway already returns). Grant the allowance column, not the raw model column.

| Tenant One package | Credits / month | Claude cost covered |
| --- | ---: | ---: |
| Quiet | 30 | $3 |
| Active (standing grant) | 150 | $15 |
| Heavy | 600 | $60 |
| Top-up pack | 100 | $10 |

A standing **150-credit** grant covers an active capture month. A proposal-heavy month needs the **600-credit** grant, or the standing grant plus five top-up packs. One standard RFP is about **21 credits** after the allowance ($1.54 × 1.35). One heavy RFP is about **49 credits**. One max-size RFP is about **110 credits**.

Sell a platform-key credit to a future tenant at **$0.15 or more** if the goal is only to cover Claude, and higher once support and card fees are included. At $0.10 the pack matches Anthropic and leaves the platform owner with no margin on tokens.

## The rest of the stack

These services are shared by Tenant One and every bring-your-own-Claude tenant. They do not scale with tokens.

| Service | Role in this repo | Monthly COGS |
| --- | --- | --- |
| Vercel Pro | Next.js app. Ingest and drafting run here, `maxDuration` 300s. | **$20** plan, which includes $20 of usage credit. A long Claude wait is about **$0.001** of CPU and memory in `iad1` (memory is billed while the function waits). Hundreds of drafts stay inside the credit. |
| Railway Pro | Worker plus Redis. The worker listens on 11 BullMQ queues and logs jobs. It does not call Claude or score pursuits. | **$20** plan, which includes $20 of usage. An idle worker (~0.1 vCPU, ~0.4 GB) plus a small Redis is about **$8–15** of usage, inside the credit. |
| Neon Launch | One shared Postgres database. Workspaces, including solicitation text, live in `shared_workspace`. | **$10** typical, **$40** if a 0.5 CU compute stays on all month ($0.106 / CU-hour, $0.35 / GB-month). Scale-to-zero after 5 minutes is available. Storage for dozens of packages is cents. |
| Resend | Password reset only. | **$0** under 3,000 emails/month. Pro is $20 for 50,000. |
| Cloudflare R2 | Optional in `.env.example`. Uploads are parsed in the request and stored as text in Postgres. | **$0** until objects are stored. Then $0.015 / GB-month and no egress fee. |
| Langfuse, Cloudflare AI Gateway, Turnstile, Google OAuth | Optional env vars. The gateway calls `api.anthropic.com` directly. | **$0** until those products are turned on. |

**Shared stack: about $50/month, and about $80/month if Neon stays warm.** That bill exists for Tenant One alone. Extra bring-your-own-Claude tenants add about **$1–3/month each** (a slice of Neon compute, a few long Vercel invocations, and workspace storage) until the tenant count pushes past the Vercel transfer credit or forces a larger Neon compute.

At roughly 200 active workspaces, Vercel overage and a larger Neon compute can lift the stack toward **$100–180/month** total. Claude on Tenant One, if that workspace is busy, is still the larger line.

## Pricing new tenants who bring their own Claude account

Their Anthropic invoice is theirs. A platform fee priced to "include Claude credits" double-charges them and does not match any cost the platform owner pays.

The platform owner's COGS to host one of these tenants:

| Tenants on the platform besides the fixed stack | Incremental COGS | Fully loaded, sharing the $50–80 floor |
| --- | ---: | ---: |
| The first few | $1–3 | $25–40, because two or three fees have to carry Vercel, Railway, and Neon |
| About 10 | $1–3 | $8–12 |
| About 25 | $2–4 | $5–8 |

A single public price that covers cost from the first paying tenant is **$40 per workspace per month**. Two tenants at that price cover the $80 stack ceiling. Incremental cost is covered from the first tenant. There is no Claude credit in this package.

| Package | Who pays Claude | What to include | Price that covers the platform owner's cost |
| --- | --- | --- | --- |
| Tenant One, internal | Platform owner | 150 credits/month standing, 100-credit top-ups, 600 credits in a heavy month | Budget **$15** Claude in an ordinary month and **$60** in a heavy month, plus the shared **$50–80** stack |
| Workspace, bring your own Claude | The tenant, on their Anthropic account | App, database, worker, auth email. No model credits. | **$40 / workspace / month** while the tenant count is small |

Raise the workspace fee only when a tenant's storage or support load shows up in Neon or Vercel, not when their proposals get longer. Longer proposals raise their Claude bill, which they already pay.
