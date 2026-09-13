/**
 * LinkedIn Connections bulk ingest — DISC-13
 * Stages: ingest → entity-resolution → enrichment → scoring → intake
 */
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import postgres from "postgres";
import {
  parseLinkedInConnectionsCsv,
  evaluateLinkedInBatch,
  buildDecisionRecord,
} from "@opportunity-engine/core";
import type { LinkedInBatchResult, EvaluatedLead, ResolvedAccount } from "@opportunity-engine/core";
import { computeSubmissionKey } from "../runtime/idempotency";
import { logger } from "../runtime/logger";

const SOURCE = "linkedin_connections_csv";
const DECISION_POINT = "D-DISC-13";
const BATCH_LABEL = "LinkedIn Connections — 2026-09-13";

export interface IngestReport {
  batchId: string;
  rowCount: number;
  skippedEmpty: number;
  excluded: number;
  evaluated: number;
  accountsInserted: number;
  contactsInserted: number;
  leadsInserted: number;
  scoresInserted: number;
  routingCounts: LinkedInBatchResult["routingCounts"];
  seniorityCounts: Record<string, number>;
  industryCounts: Record<string, number>;
  emailCount: number;
  uniqueCompanies: number;
  pipelineAccounts: number;
  discoveryAccounts: number;
  qualifiedCount: number;
}

export async function runLinkedInIngest(opts: {
  csvPath: string;
  databaseUrl: string;
}): Promise<IngestReport> {
  const csvText = readFileSync(opts.csvPath, "utf8");
  const sql = postgres(opts.databaseUrl, { max: 4, ssl: "require" });

  try {
    logger.info("ETL ingest: parse", { source: SOURCE });
    const rows = parseLinkedInConnectionsCsv(csvText);

    const submissionKey = computeSubmissionKey(SOURCE, {
      label: BATCH_LABEL,
      rowCount: rows.length,
      gate: "score62_icp_or_capability_v1",
    });
    const existing = await sql<{ id: string; result_ref: string | null }[]>`
      SELECT id, result_ref FROM job_submission
      WHERE source = ${SOURCE} AND submission_key = ${submissionKey}
      LIMIT 1
    `;
    if (existing[0]?.result_ref) {
      logger.info("ETL ingest: idempotent hit", { submissionKey, batchId: existing[0].result_ref });
    }

    logger.info("ETL entity-resolution + enrichment + scoring", { rows: rows.length });
    const batch = evaluateLinkedInBatch(rows);
    const qualifiedAccounts = batch.accounts
      .map((account) => ({
        ...account,
        leads: account.leads.filter((l) => l.routing === "pipeline"),
      }))
      .filter((account) => account.leads.length > 0);

    logger.info("ETL intake: persist qualified accounts only", {
      evaluated: batch.evaluated,
      qualifiedLeads: batch.qualifiedCount,
      qualifiedAccounts: qualifiedAccounts.length,
    });

    const report = await persistBatch(sql, { ...batch, accounts: qualifiedAccounts }, submissionKey);
    logger.info("ETL complete", report as unknown as Record<string, unknown>);
    return report;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function persistBatch(
  sql: postgres.Sql,
  batch: LinkedInBatchResult,
  submissionKey: string,
): Promise<IngestReport> {
  const batchId = randomUUID();
  const now = new Date();
  const accountIdByKey = new Map<string, string>();

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO source_batch (id, label, row_count, evaluated_count, uploaded_at)
      VALUES (${batchId}, ${BATCH_LABEL}, ${batch.rowCount}, ${batch.evaluated}, ${now})
    `;

    for (const chunk of chunks(batch.accounts, 100)) {
      for (const account of chunk) {
        const id = randomUUID();
        accountIdByKey.set(account.key, id);
        await tx`
          INSERT INTO account (
            id, legal_name, sector, size_band, summary, classification, retention_class, created_at, updated_at
          ) VALUES (
            ${id}, ${account.legalName}, ${account.sector}, ${account.sizeBand},
            ${account.leads[0]?.whyGoodFit ?? null},
            'internal', 'standard', ${now}, ${now}
          )
        `;
        for (const alias of account.aliases) {
          await tx`
            INSERT INTO account_alias (account_id, alias_type, value, source)
            VALUES (${id}, 'name', ${alias}, ${SOURCE})
          `;
        }
      }
    }

    let prevHash: string | null = null;
    let contacts = 0;
    let leadsInserted = 0;
    let scores = 0;

    for (const account of batch.accounts) {
      const accountId = accountIdByKey.get(account.key)!;
      for (const lead of account.leads) {
        const contactId = randomUUID();
        const leadId = randomUUID();
        const scoreRunId = randomUUID();
        const decisionId = randomUUID();

        await tx`
          INSERT INTO contact (
            id, account_id, full_name, role_title, seniority_band, email, source_ref,
            lawful_basis, purpose_tags, classification, retention_class, created_at, updated_at
          ) VALUES (
            ${contactId}, ${accountId}, ${lead.fullName}, ${lead.position || null},
            ${lead.seniorityBand}, ${lead.email}, ${lead.url || `row:${lead.rowNumber}`},
            'legitimate_interests', ${tx.array(["b2b_sales", "relationship_network"])},
            ${lead.email ? "regulated" : "internal"}, 'standard', ${now}, ${now}
          )
        `;
        contacts++;

        const provenance = {
          source: SOURCE,
          batchId,
          rowNumber: lead.rowNumber,
          firstName: lead.firstName,
          lastName: lead.lastName,
          fullName: lead.fullName,
          email: lead.email,
          company: lead.companyRaw,
          position: lead.position,
          linkedinUrl: lead.url || null,
          connectedOn: lead.connectedOn,
          connectedAt: lead.connectedAt,
          seniorityBand: lead.seniorityBand,
          icpVertical: lead.icpVertical,
          icpTags: lead.icpTags,
          commercialMotion: lead.commercialMotion,
          contactId,
        };

        await tx`
          INSERT INTO lead (
            id, account_id, channel, provenance, intent_evidence, current_score, current_score_run_id,
            routing_outcome, classification, retention_class, created_at, updated_at
          ) VALUES (
            ${leadId}, ${accountId}, 'bulk_list', ${tx.json(provenance as never)},
            ${tx.json({
              icpTags: lead.icpTags,
              icpVertical: lead.icpVertical,
              commercialMotion: lead.commercialMotion,
              seniority: lead.seniorityBand,
              why: lead.whyGoodFit,
              scoreComponents: lead.scoreComponents,
            } as never)},
            ${lead.score}, ${scoreRunId}, ${lead.routing},
            'internal', 'standard', ${now}, ${now}
          )
        `;
        leadsInserted++;

        const envelope = buildDecisionRecord(
          {
            decisionType: DECISION_POINT,
            subjectRef: leadId,
            subjectIsIndividual: true,
            inputs: [{ sourceRef: lead.url || `row:${lead.rowNumber}`, capturedAt: now.toISOString() }],
            weightsVersion: "oa-40-35-25",
            graphVersion: "bootstrap",
          },
          {
            total: lead.score,
            ...lead.scoreComponents,
            routing: lead.routing,
          },
          decisionId,
          prevHash,
        );
        prevHash = envelope.rowHash;

        await tx`
          INSERT INTO decision (
            id, decision_point_ref, subject_type, subject_id, subject_is_individual,
            inputs, weights_version, graph_version, output, action_taken,
            retention_class, prev_hash, row_hash, created_at
          ) VALUES (
            ${decisionId}, ${DECISION_POINT}, 'lead', ${leadId}, true,
            ${tx.json([{ sourceRef: lead.url || `row:${lead.rowNumber}`, capturedAt: now.toISOString() }] as never)},
            'oa-40-35-25', 'bootstrap', ${tx.json(envelope.output as never)}, ${lead.routing},
            'extended', ${envelope.prevHash}, ${envelope.rowHash}, ${now}
          )
        `;

        await tx`
          INSERT INTO score_run (
            id, subject_type, subject_id, decision_id, total,
            capability_alignment, intent_timing, account_value_fit,
            weights_version, graph_version, evidence_refs, run_at, created_at
          ) VALUES (
            ${scoreRunId}, 'lead', ${leadId}, ${decisionId}, ${lead.score},
            ${lead.scoreComponents.capabilityAlignment}, ${lead.scoreComponents.intentTiming},
            ${lead.scoreComponents.accountValueFit}, 'oa-40-35-25', 'bootstrap',
            ${tx.json([lead.url || `row:${lead.rowNumber}`] as never)}, ${now}, ${now}
          )
        `;
        scores++;

        await insertEnriched(tx, "contact", contactId, lead, now);
      }
    }

    await tx`
      INSERT INTO job_submission (source, submission_key, payload_hash, claimed_at, completed_at, result_ref)
      VALUES (${SOURCE}, ${submissionKey}, ${String(batch.rowCount)}, ${now}, ${now}, ${batchId})
    `;

    await tx`
      INSERT INTO audit_log (action, subject_type, subject_id, after, at)
      VALUES (
        'bulk_list.ingest',
        'source_batch',
        ${batchId},
        ${tx.json({
          rowCount: batch.rowCount,
          evaluated: batch.evaluated,
          routing: batch.routingCounts,
        } as never)},
        ${now}
      )
    `;

    void contacts;
    void leadsInserted;
    void scores;
  });

  const pipelineAccounts = batch.accounts.filter((a) => a.routing === "pipeline").length;
  const discoveryAccounts = batch.accounts.filter((a) => a.routing === "discovery").length;

  return {
    batchId,
    rowCount: batch.rowCount,
    skippedEmpty: batch.skippedEmpty,
    excluded: batch.excluded,
    evaluated: batch.evaluated,
    accountsInserted: batch.accounts.length,
    contactsInserted: batch.accounts.reduce((n, a) => n + a.leads.length, 0),
    leadsInserted: batch.accounts.reduce((n, a) => n + a.leads.length, 0),
    scoresInserted: batch.accounts.reduce((n, a) => n + a.leads.length, 0),
    routingCounts: batch.routingCounts,
    seniorityCounts: batch.seniorityCounts,
    industryCounts: batch.industryCounts,
    emailCount: batch.emailCount,
    uniqueCompanies: batch.uniqueCompanies,
    pipelineAccounts,
    discoveryAccounts,
    qualifiedCount: batch.qualifiedCount,
  };
}

async function insertEnriched(
  tx: postgres.TransactionSql,
  subjectType: string,
  subjectId: string,
  lead: EvaluatedLead,
  now: Date,
) {
  const fields: Array<[string, string | null]> = [
    ["first_name", lead.firstName || null],
    ["last_name", lead.lastName || null],
    ["full_name", lead.fullName],
    ["email", lead.email],
    ["linkedin_url", lead.url || null],
    ["company", lead.companyRaw || null],
    ["position", lead.position || null],
    ["connected_on", lead.connectedOn || null],
    ["connected_at", lead.connectedAt],
    ["seniority_band", lead.seniorityBand],
    ["industry", lead.industry],
    ["icp_vertical", lead.icpVertical],
    ["icp_tags", lead.icpTags.join(",") || null],
    ["commercial_motion", lead.commercialMotion],
    ["why_good_fit", lead.whyGoodFit],
  ];
  for (const [fieldName, value] of fields) {
    if (!value) continue;
    await tx`
      INSERT INTO enriched_field (
        subject_type, subject_id, field_name, value, source_ref, source_type, captured_at
      ) VALUES (
        ${subjectType}, ${subjectId}, ${fieldName}, ${value},
        ${lead.url || `row:${lead.rowNumber}`}, ${SOURCE}, ${now}
      )
    `;
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type { EvaluatedLead, ResolvedAccount };
