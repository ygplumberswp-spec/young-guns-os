import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dashboardDir = join(here, '../features/dashboard');
const integrationsDir = join(here, '../features/integrations');

describe('PERF-001 performance foundation', () => {
  it('executive dashboard defers secondary panels and lazy-loads AURA', () => {
    const source = readFileSync(join(dashboardDir, 'ExecutiveDashboard.tsx'), 'utf8');
    assert.match(source, /useDeferredMount/);
    assert.match(source, /React\.lazy|lazy\(/);
    assert.match(source, /AuraExecutiveChatPanel/);
    assert.match(source, /DashboardSectionSkeleton/);
    assert.match(source, /fetchExecutiveDashboardSummary\(accessToken!, \{ signal \}\)/);
    assert.doesNotMatch(source, /LoadingState/);
  });

  it('connections panel uses scoped cache keys and partial loading', () => {
    const source = readFileSync(join(dashboardDir, 'ConnectionsPanel.tsx'), 'utf8');
    assert.match(source, /integrations\/hub-dashboard:simple/);
    assert.match(source, /integrations\/social-connections-dashboard/);
    assert.match(source, /useStaffCachedQuery/);
    assert.match(source, /hasAnyData/);
  });

  it('social connections section dedupes via shared cache key', () => {
    const source = readFileSync(join(integrationsDir, 'SocialConnectionsSection.tsx'), 'utf8');
    assert.match(source, /integrations\/social-connections-dashboard/);
    assert.match(source, /useStaffCachedQuery/);
    assert.doesNotMatch(source, /useEffect\(\(\) => \{/);
  });

  it('prefetch registry targets dashboard executive summary not legacy stats', () => {
    const source = readFileSync(join(here, 'route-prefetch-registry.ts'), 'utf8');
    assert.match(source, /dashboard\/executive-summary/);
    assert.match(source, /integrations\/hub-dashboard:simple/);
  });

  it('idle preload defers on owner dashboard home', () => {
    const source = readFileSync(join(here, 'preload-coordinator.ts'), 'utf8');
    assert.match(source, /3_500/);
    assert.match(source, /PERF-001/);
  });

  it('vite build splits vendor markdown from main index', () => {
    const source = readFileSync(join(here, '../../vite.config.ts'), 'utf8');
    assert.match(source, /manualChunks/);
    assert.match(source, /vendor-markdown/);
  });

  it('cache policies cover dashboard and integration query keys', () => {
    const source = readFileSync(join(here, 'cache-policies.ts'), 'utf8');
    assert.match(source, /dashboard\/executive-summary/);
    assert.match(source, /integrations\/social-connections-dashboard/);
    assert.match(source, /ops-intelligence\/snapshot/);
  });

  it('owner staff route does not duplicate session bootstrap loading gate', () => {
    const source = readFileSync(join(here, '../components/StaffExperienceRoute.tsx'), 'utf8');
    const ownerBlock = source.split('export function TechnicianRoute')[0] ?? source;
    assert.match(ownerBlock, /ProtectedRoute already gates session bootstrap/);
    assert.doesNotMatch(ownerBlock, /Loading\.\.\./);
  });
});
