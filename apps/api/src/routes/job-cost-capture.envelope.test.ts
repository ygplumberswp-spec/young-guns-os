import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('JPE-004 job cost capture route envelope', () => {
  it('exposes time start/stop and capture checklist on mobile router', () => {
    const routeSource = readSource('src/routes/mobile.ts');
    assert.ok(routeSource.includes("'/workforce/time/start'"));
    assert.ok(routeSource.includes("'/workforce/time/:timeEntryId/stop'"));
    assert.ok(routeSource.includes("'/workforce/time/active'"));
    assert.ok(routeSource.includes("'/jobs/:id/capture-checklist'"));
    assert.ok(routeSource.includes("'/jobs/:id/direct-costs'"));
    assert.ok(routeSource.includes("'/jobs/:id/material-lines/:materialLineId/return'"));
  });

  it('exposes finance direct cost and daily summary routes', () => {
    const routeSource = readSource('src/routes/job-cost-capture.ts');
    assert.ok(routeSource.includes("'/cost-capture/daily-summary'"));
    assert.ok(routeSource.includes("'/jobs/:jobId/direct-costs'"));
    assert.ok(routeSource.includes("'/jobs/:jobId/capture-status'"));
  });

  it('exposes labour rate correction on jobs router', () => {
    const routeSource = readSource('src/routes/jobs.ts');
    assert.ok(routeSource.includes("'/time-entries/:timeEntryId/correct-labour-rate'") || routeSource.includes("'/:jobId/time-entries/:timeEntryId/correct-labour-rate'"));
    assert.ok(routeSource.includes('correctTimeEntryLabourRate'));
  });

  it('wires JobCostCaptureService and refresh bridge events', () => {
    const indexSource = readSource('src/index.ts');
    assert.ok(indexSource.includes('JobCostCaptureService'));
    assert.ok(indexSource.includes('createJobCostCaptureRouter'));
    const bridgeSource = readSource('src/services/job-profitability-refresh.bridge.ts');
    assert.ok(bridgeSource.includes('job.time_captured'));
    assert.ok(bridgeSource.includes('job.direct_cost_captured'));
    assert.ok(bridgeSource.includes('job.material_line_recorded'));
  });

  it('migration 0187 adds time entry idempotency without xero changes', () => {
    const sql = readFileSync(join(root, '../../packages/db/drizzle/0187_job_cost_capture.sql'), 'utf8');
    assert.ok(sql.includes('client_action_id'));
    assert.doesNotMatch(sql, /xero/i);
  });
});
