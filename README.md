# Opportunity Engine

DataBillity’s command center for **prospects, partners, and projects**. It scores accounts against the Billity capability taxonomy, triages inbound RFPs and SOWs, maps requirements to consortium or partner coverage, and drafts grounded outreach and bid responses.

The web app is a Next.js operator console. A long-running worker consumes Redis/BullMQ queues for ingest, scoring, and orchestration.

## What it does

- **Dashboard** — lead funnel, score bands, channel mix, and pursuit outcomes
- **Search & Discovery** — find and qualify accounts against ICP verticals
- **Pipeline** — organizations across outbound, inbound, partner, and bulk-list channels
- **Opportunity** — Lane B (RFP) and Lane C (SOW) pursuit packets with Go / No-Go / conditions
- **Response Builder** — requirement-mapped drafts after a Go decision
- **Capability Sources** — graph of DataBillity capabilities, experience, credentials, and people
- **Operator auth** — shared sign-in at `/login`, with Resend-backed password reset

Scoring is deterministic where it can be: opportunity alignment is **40% capability / 35% intent timing / 25% account value**. RFP ingest still parses and scores with heuristic triage when AI keys are absent.

## Monorepo

pnpm workspaces + Turborepo.

```
apps/web          Next.js 15 operator console (port 3100)
apps/worker      BullMQ orchestration worker (Railway)

packages/core    Scoring, entity resolution, LinkedIn ingest (pure functions)
packages/ai      Model gateway (Claude Sonnet 5.5)
packages/db      Drizzle schema and migrations (Neon Postgres)
packages/contracts  Shared Zod contracts at every intake and model-output boundary
```

Database schema is grouped into clusters: identity, graph, gaps, partners, pursuit, governance, consent, outcomes, operations, plus operator auth.

## Stack

| Layer | Service |
| --- | --- |
| App | Next.js 15, React 19, Tailwind |
| Data | Neon Postgres via Drizzle ORM |
| Jobs | Redis + BullMQ |
| AI | Anthropic Claude |
| Email | Resend |
| Deploy | Vercel (web), Railway (worker) |

## Prerequisites

- Node.js 20+
- [pnpm 9](https://pnpm.io/) (`npm install -g pnpm@9`)
- A Neon (or other Postgres) database
- Redis if you are running the worker locally

## Setup

```powershell
pnpm install
Copy-Item .env.example .env.local
```

Fill in at least `DATABASE_URL`. Then push the schema and optionally seed:

```powershell
pnpm db:push
pnpm db:seed
```

`pnpm db:seed` copies demonstration records into one organization's workspace: Search & Discovery (plays, a scored lead list, and candidates), Pipeline, the Partner network, opportunities (RFP, RFI, and SOW), capability sources, the archive, and Response Builder. The default organization is DataBillity. `TENANT_ID=operator` is the legacy workspace id and writes that same organization, not a second row. Set `TENANT_ID` and `TENANT_NAME` to seed a different organization. That creates the organization and its workspace only; signing in still requires a member. An existing workspace is left as it is. Sign-up copies the same demonstration set into the new organization's own row. Workspace reads and writes use the signed-in organization id.

### Run locally

From the repo root (Windows):

```powershell
.\go.ps1
```

That starts the worker in a separate window and the Next.js app in the current one.

| Command | What it starts |
| --- | --- |
| `.\go.ps1` | Worker + frontend on **:3100** |
| `.\go.ps1 -FrontOnly` | Next.js only |
| `.\go.ps1 -WorkerOnly` | Worker only |
| `.\go.ps1 -Port 3100` | Pin the frontend port |

Equivalent npm scripts:

```powershell
pnpm go
pnpm --filter @opportunity-engine/web dev
pnpm --filter @opportunity-engine/worker dev
```

Open [http://localhost:3100](http://localhost:3100). Canonical local ports: frontend **3100**, Langfuse **3040** (not started by `.\go.ps1`).

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Turbo-run all `dev` tasks |
| `pnpm build` | Build the workspace |
| `pnpm lint` | Lint |
| `pnpm test` | Test |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:push` | Push schema to Postgres |
| `pnpm db:seed` | Copy demonstration data into one organization's workspace |
| `pnpm ingest:linkedin` | Evaluate a LinkedIn connections export |

## Environment

Copy `.env.example` to `.env.local`. The launcher will create `.env.local` from the example if it is missing.

| Variable | Required for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Web, worker, Drizzle | Neon connection string |
| `TENANT_ID` / `TENANT_NAME` | `pnpm db:seed` | Optional. Defaults to the DataBillity organization. `operator` maps to that organization. A new id receives its own demonstration workspace |
| `REDIS_URL` | Worker | Local default `redis://localhost:6379` |
| `ANTHROPIC_API_KEY` | AI outreach, extraction, and drafting | Claude Sonnet 5.5 |
| `AUTH_USERNAME` / `AUTH_PASSWORD` / `AUTH_SECRET` | `/login` | Shared operator gate |
| `RESEND_API_KEY` / `RESEND_FROM` | Password reset email | |
| `NEXT_PUBLIC_APP_URL` | Auth links, CORS-facing URLs | `http://localhost:3100` locally |

Cloudflare R2, Turnstile, Google OAuth, and Langfuse keys are optional until those layers are wired in.

## Worker queues

The worker exposes `GET /health` and consumes: `discovery`, `enrichment`, `scoring`, `intake`, `triage`, `drafting`, `deadlines`, `partners`, `rd`, `retention`, `health`.

## License

Private — DataBillity. Not published as an open-source package.
