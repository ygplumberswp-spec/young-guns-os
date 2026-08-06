import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const dashboardSource = readFileSync(
  fileURLToPath(new URL('./ExecutiveDashboard.tsx', import.meta.url)),
  'utf8',
);
const heartbeatSource = readFileSync(
  fileURLToPath(new URL('./BusinessHeartbeatPanel.tsx', import.meta.url)),
  'utf8',
);
const financeSource = readFileSync(
  fileURLToPath(new URL('./FinancialTruthPanel.tsx', import.meta.url)),
  'utf8',
);

describe('DASH-001A dashboard visual polish', () => {
  it('uses primary and secondary heartbeat groups', () => {
    assert.match(heartbeatSource, /primaryMetrics/);
    assert.match(heartbeatSource, /secondaryMetrics/);
    assert.match(heartbeatSource, /exec-heartbeat__primary-grid/);
    assert.match(heartbeatSource, /exec-heartbeat__secondary-grid/);
  });

  it('hides source metadata behind a details disclosure on main surfaces', () => {
    assert.match(heartbeatSource, /DashboardDetailsDisclosure/);
    assert.match(financeSource, /DashboardDetailsDisclosure/);
    assert.doesNotMatch(financeSource, /DASHBOARD_STATE_LABELS/);
  });

  it('uses compact AURA launcher instead of full chat panel', () => {
    assert.match(dashboardSource, /AuraExecutiveChatLauncher/);
    assert.doesNotMatch(dashboardSource, /AuraExecutiveChatPanel/);
  });

  it('places connections and quick links in supporting tools area', () => {
    assert.match(dashboardSource, /exec-dashboard-row--tools/);
    assert.match(dashboardSource, /ConnectionsPanel compact/);
    assert.match(dashboardSource, /QuickLinksPanel compact/);
  });

  it('applies compact list limits from shared constants', () => {
    assert.match(dashboardSource, /DASHBOARD_LIST_LIMITS/);
  });
});
