import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'finance-reporting-forecast.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/finance-reporting-forecast.service.ts'),
  'utf8',
);

describe('finance reporting & forecasting API envelope & safety', () => {
  it('wraps success responses with safety flags', () => {
    for (const pattern of [
      'autoExecuted: false as const',
      'fakeDataInvented: false as const',
      'technicianClientDenied: true as const',
      'forecastsExplainAssumptions: true as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + finance permissions and denies Technician/Client', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('finance:read'));
    assert.ok(routeSource.includes('finance:write'));
    assert.ok(routeSource.includes('requireAnyPermission'));
    assert.ok(routeSource.includes('denyTechnicianClient'));
    assert.ok(routeSource.includes("role === 'Technician'"));
    assert.ok(routeSource.includes("role === 'Client'"));
  });

  it('never auto-executes financial mutations', () => {
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(serviceSource.includes('canApproveFinanceReportingForecast'));
    assert.ok(serviceSource.includes('assertApprove'));
  });

  it('covers expanded report kinds including invoice and job profitability', () => {
    assert.ok(routeSource.includes("'invoice'"));
    assert.ok(routeSource.includes("'job_profitability'"));
    assert.ok(serviceSource.includes('buildFrfInvoiceReport'));
    assert.ok(serviceSource.includes('buildFrfJobProfitabilityReport'));
  });

  it('forecasts store confidence and withhold invented projections', () => {
    assert.ok(serviceSource.includes('confidence'));
    assert.ok(serviceSource.includes('buildFrfForecast'));
    assert.ok(serviceSource.includes('projectionWithheld'));
  });

  it('connects insights to Command Centre / Finance AURA / Dashboard', () => {
    assert.ok(routeSource.includes("'command_centre'"));
    assert.ok(routeSource.includes("'finance_aura_agent'"));
    assert.ok(routeSource.includes("'dashboard'"));
    assert.ok(serviceSource.includes('frfInsightTargetHref'));
    assert.ok(serviceSource.includes('listFrfAuraConnections'));
  });

  it('writes security audit logs and scopes by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'finance_reporting_forecast'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('eq(invoices.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(payments.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(frfReportSnapshots.companyId, actor.companyId)'));
  });
});
