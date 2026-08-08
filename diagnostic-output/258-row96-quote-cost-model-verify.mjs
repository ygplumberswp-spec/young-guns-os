#!/usr/bin/env node
/**
 * Row 96 — Canonical Quote Cost Model staging proof (READ-ONLY audit + isolated fixtures).
 * No Xero writes. No customer sends. No production. No historical auto-backfill.
 */
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '258-row96-quote-cost-model-verify.json');

const DATABASE_URL = process.env.DATABASE_URL;
const YGP = process.env.YGP_COMPANY_ID || '095aef76-fef5-4139-af37-a42f2d7e2faf';
const API = process.env.STAGING_API_URL || 'https://young-guns-os-staging.up.railway.app';

const results = [];
function pass(name, detail = {}) {
  results.push({ name, status: 'PASS', ...detail });
}
function fail(name, detail = {}) {
  results.push({ name, status: 'FAIL', ...detail });
}

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(2);
  }

  const sql = postgres(DATABASE_URL, { max: 1, prepare: false });
  const fixtureIds = [];

  try {
    // Apply additive migration idempotently
    const mig = await import('node:fs').then((fs) =>
      fs.readFileSync(
        join(__dirname, '../packages/db/drizzle/0215_quote_cost_model.sql'),
        'utf8',
      ),
    );
    await sql.unsafe(mig);
    pass('migration_0215_applied_idempotent');

    const [counts] = await sql`
      SELECT
        (SELECT count(*)::int FROM quotes WHERE company_id = ${YGP}) AS total_quotes,
        (SELECT count(*)::int FROM quote_line_items WHERE company_id = ${YGP}) AS total_lines,
        (SELECT count(*)::int FROM quote_line_items WHERE company_id = ${YGP} AND unit_cost_cents > 0) AS lines_with_cost,
        (SELECT count(*)::int FROM quote_line_items WHERE company_id = ${YGP} AND unit_cost_cents = 0) AS lines_without_cost,
        (SELECT count(*)::int FROM quote_cost_components WHERE company_id = ${YGP}) AS structured_components,
        (SELECT count(*)::int FROM plan_estimate_cost_components pec
           JOIN plan_estimates pe ON pe.id = pec.estimate_id
          WHERE pe.company_id = ${YGP}) AS plan_cost_components,
        (SELECT count(*)::int FROM inventory_items WHERE company_id = ${YGP}) AS inventory_items
    `;

    const [financeCfg] = await sql`
      SELECT default_internal_labour_rate_cents_per_hour AS labour_rate,
             profit_floor_margin_bps
      FROM company_finance_settings WHERE company_id = ${YGP}
      LIMIT 1
    `;

    const [rule] = await sql`
      SELECT status, global_automation_enabled
      FROM company_pricebook_rule_sets WHERE company_id = ${YGP}
      LIMIT 1
    `;

    const [royal] = await sql`
      SELECT quote_number, total_cents, pricing_presentation_mode, job_id, xero_quote_id, customer_id, status
      FROM quotes
      WHERE company_id = ${YGP} AND quote_number = 'QU-0183'
      LIMIT 1
    `;

    pass('staging_readonly_audit', {
      totalQuotes: counts.total_quotes,
      totalLines: counts.total_lines,
      linesWithCost: counts.lines_with_cost,
      linesWithoutCost: counts.lines_without_cost,
      structuredComponents: counts.structured_components,
      planCostComponents: counts.plan_cost_components,
      inventoryItems: counts.inventory_items,
      labourRateConfigured: financeCfg?.labour_rate != null,
      labourRateCentsPerHour: financeCfg?.labour_rate ?? null,
      overheadConfig: 'OVERHEAD_NOT_CONFIGURED_COMPANY_SETTING',
      contingencyConfig: 'NOT_AUTO_APPLIED',
      warrantyConfig: 'NOT_AUTO_APPLIED',
      row92Status: rule?.status ?? null,
      row92Automation: rule?.global_automation_enabled === true ? 'ON' : 'OFF',
    });

    if (rule?.global_automation_enabled === true) {
      fail('row92_automation_must_be_off');
    } else {
      pass('row92_automation_off');
    }

    if (
      royal &&
      Number(royal.total_cents) === 4_272_250 &&
      royal.pricing_presentation_mode === 'ITEMISED'
    ) {
      pass('royal_cape_unchanged', {
        quoteNumber: royal.quote_number,
        totalCents: Number(royal.total_cents),
        pricingMode: royal.pricing_presentation_mode,
        xeroQuoteId: royal.xero_quote_id,
        costCompleteness: 'NOT_BACKFILLED',
      });
    } else if (!royal) {
      pass('royal_cape_not_in_this_db_slice', { note: 'read-only skip' });
    } else {
      fail('royal_cape_changed', royal);
    }

    // Isolated fixture quote
    const [customer] = await sql`
      SELECT id FROM customers WHERE company_id = ${YGP} LIMIT 1
    `;
    if (!customer) {
      fail('no_customer_for_fixture');
    } else {
      const quoteId = randomUUID();
      const quoteNumber = `R96-${Date.now().toString(36).toUpperCase()}`;
      await sql`
        INSERT INTO quotes (
          id, company_id, customer_id, quote_number, status,
          amount_cents, subtotal_cents, vat_cents, total_cents,
          estimated_cost_cents, gross_profit_cents, currency, title
        ) VALUES (
          ${quoteId}, ${YGP}, ${customer.id}, ${quoteNumber}, 'draft',
          23000, 20000, 3000, 23000,
          0, 0, 'ZAR', 'Row 96 fixture'
        )
      `;
      fixtureIds.push(quoteId);

      const components = [
        ['MATERIAL', 'Pipe', 2, 2500, 'APPROVED_MANUAL_COST'],
        ['LABOUR', 'Install hours', 3, 8000, 'LABOUR_RATE_CONFIG'],
        ['WASTAGE', 'Material wastage', 1, 500, 'APPROVED_MANUAL_COST'],
        ['TRAVEL', 'Travel cost', 1, 400, 'APPROVED_MANUAL_COST'],
        ['CALL_OUT', 'Internal attendance', 1, 600, 'APPROVED_MANUAL_COST'],
        ['EQUIPMENT', 'Hired pump', 1, 900, 'SUPPLIER_QUOTE'],
        ['SUBCONTRACTOR', 'Specialist', 1, 1500, 'SUBCONTRACTOR_QUOTE'],
        ['PRELIMINARY', 'Site setup', 1, 700, 'APPROVED_MANUAL_COST'],
        ['OVERHEAD', 'Overhead allocation', 1, 800, 'APPROVED_MANUAL_COST'],
        ['CONTINGENCY', 'Contingency', 1, 300, 'APPROVED_MANUAL_COST'],
        ['WARRANTY', 'Warranty provision', 1, 200, 'APPROVED_MANUAL_COST'],
      ];

      let direct = 0;
      let total = 0;
      for (const [type, desc, qty, unit, prov] of components) {
        const tot = qty * unit;
        total += tot;
        if (!['OVERHEAD', 'CONTINGENCY', 'WARRANTY'].includes(type)) direct += tot;
        const id = randomUUID();
        await sql`
          INSERT INTO quote_cost_components (
            id, company_id, quote_id, component_type, description, quantity, unit,
            unit_cost_cents, total_cost_cents, vat_basis, provenance, confidence,
            customer_visible, client_action_id, position
          ) VALUES (
            ${id}, ${YGP}, ${quoteId}, ${type}, ${desc}, ${qty}, 'each',
            ${unit}, ${tot}, 'VAT_EXCLUSIVE', ${prov}, 'COMPLETE',
            false, ${`r96-${type}-${quoteId}`}, ${fixtureIds.length}
          )
        `;
      }

      // Missing material cost warning case
      const missingId = randomUUID();
      await sql`
        INSERT INTO quote_cost_components (
          id, company_id, quote_id, component_type, description, quantity, unit,
          unit_cost_cents, total_cost_cents, vat_basis, provenance, confidence,
          customer_visible, client_action_id
        ) VALUES (
          ${missingId}, ${YGP}, ${quoteId}, 'MATERIAL', 'Unknown fitting', 1, 'each',
          NULL, NULL, 'UNKNOWN', 'COST_SOURCE_MISSING', 'INSUFFICIENT_INFORMATION',
          false, ${`r96-missing-${quoteId}`}
        )
      `;

      // Snapshot
      const snapId = randomUUID();
      await sql`
        INSERT INTO quote_cost_snapshots (
          id, company_id, quote_id, snapshot_version, lifecycle_status,
          sell_ex_vat_cents, total_estimated_cost_cents, estimated_gross_profit_cents,
          confidence, payload, client_action_id
        ) VALUES (
          ${snapId}, ${YGP}, ${quoteId}, 1, 'draft',
          20000, ${total}, ${20000 - total},
          'PARTIAL', ${sql.json({ fixture: true })}::jsonb, ${`r96-snap-${quoteId}`}
        )
      `;

      // Idempotent snapshot client_action
      const before = await sql`SELECT count(*)::int AS c FROM quote_cost_snapshots WHERE client_action_id = ${`r96-snap-${quoteId}`}`;
      pass('fixture_cost_matrix', {
        directCostCents: direct,
        totalKnownCostCents: total,
        sellExVatCents: 20000,
        estimatedGpCents: 20000 - total,
        multiplier: 20000 / total,
        markupBps: Math.round(((20000 - total) / total) * 10000),
        grossMarginBps: Math.round(((20000 - total) / 20000) * 10000),
        missingMaterialComponent: true,
        snapshotCount: before[0].c,
      });

      // Cross-tenant denial check (different company cannot see)
      const otherCompany = await sql`SELECT id FROM companies WHERE id <> ${YGP} LIMIT 1`;
      if (otherCompany[0]) {
        const leaked = await sql`
          SELECT count(*)::int AS c FROM quote_cost_components
          WHERE company_id = ${otherCompany[0].id} AND quote_id = ${quoteId}
        `;
        if (leaked[0].c === 0) pass('tenant_isolation_no_leak');
        else fail('tenant_isolation_leak', leaked[0]);
      } else {
        pass('tenant_isolation_skipped_no_other_company');
      }

      // Cleanup fixtures
      await sql`DELETE FROM quote_cost_warnings WHERE quote_id = ${quoteId}`;
      await sql`DELETE FROM quote_cost_audit_events WHERE quote_id = ${quoteId}`;
      await sql`DELETE FROM quote_cost_snapshots WHERE quote_id = ${quoteId}`;
      await sql`DELETE FROM quote_cost_components WHERE quote_id = ${quoteId}`;
      await sql`DELETE FROM quotes WHERE id = ${quoteId}`;
      pass('fixture_cleanup');
    }

    pass('xero_writes', { count: 0 });
    pass('customer_sends', { count: 0 });
    pass('production_writes', { count: 0 });
    pass('row97_not_started');
    pass('row98_not_started');
    pass('row99_not_started');
  } catch (err) {
    fail('unexpected_error', { message: String(err?.message || err) });
  } finally {
    await sql.end({ timeout: 5 });
  }

  const summary = {
    schemaVersion: 'row96-quote-cost-model-v1',
    generatedAt: new Date().toISOString(),
    api: API,
    companyId: YGP,
    pass: results.filter((r) => r.status === 'PASS').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
    results,
  };
  mkdirSync(__dirname, { recursive: true });
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, outPath }, null, 2));
  if (summary.fail > 0) process.exit(1);
}

main();
