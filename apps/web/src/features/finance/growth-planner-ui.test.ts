import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('GROWTH-001 Growth Planner UI', () => {
  it('FinanceNav links to growth-planner route', () => {
    const navSource = readFileSync(join(here, 'FinanceNav.tsx'), 'utf8');
    assert.match(navSource, /\/finance\/growth-planner/);
    assert.match(navSource, /Growth Planner/);
  });

  it('page gates with canViewGrowthPlanner and plan sections', () => {
    const pageSource = readFileSync(
      join(here, '../../pages/finance/GrowthPlannerPage.tsx'),
      'utf8',
    );
    assert.match(pageSource, /canViewGrowthPlanner/);
    assert.match(pageSource, /fetchGrowthPlannerPlan/);
    assert.match(pageSource, /Growth plan not configured/);
    assert.match(pageSource, /Monthly Goal/);
    assert.match(pageSource, /Required Output/);
    assert.match(pageSource, /Pipeline Requirement/);
    assert.match(pageSource, /Capacity/);
    assert.match(pageSource, /Profit Guardrails/);
    assert.match(pageSource, /Growth Status/);
    assert.match(pageSource, /Assumptions & Data Quality/);
    assert.match(pageSource, /growth-planner__metrics/);
  });

  it('App registers /finance/growth-planner', () => {
    const appSource = readFileSync(join(here, '../../App.tsx'), 'utf8');
    assert.match(appSource, /path="\/finance\/growth-planner"/);
    assert.match(appSource, /GrowthPlannerPage/);
  });

  it('FIN-001 includes light Growth Planner link without redesign', () => {
    const pageSource = readFileSync(
      join(here, '../../pages/finance/OwnerFinancialCommandPage.tsx'),
      'utf8',
    );
    assert.match(pageSource, /\/finance\/growth-planner/);
    assert.match(pageSource, /Growth Planner/);
  });

  it('responsive CSS covers desktop tablet and mobile breakpoints', () => {
    const css = readFileSync(join(here, '../../index.css'), 'utf8');
    assert.match(css, /growth-planner__metrics/);
    assert.match(css, /@media \(max-width: 1024px\)/);
    assert.match(css, /@media \(max-width: 640px\)/);
  });
});
