/**
 * Row 123 — Plan estimate → actual profit handoff proof
 *
 * Reuses Rows 94, 98, 106–107. Missing evidence stays incomplete.
 * No invented plan scale/cost/profit.
 */

import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const PLAN_ESTIMATE_ACTUAL_PROFIT_ROW123_KEY = 'plan-estimate-actual-profit-row123' as const;

export type PlanProfitHandoffStep =
  | 'plan_takeoff'
  | 'water_waste_geyser_quantities'
  | 'materials'
  | 'labour'
  | 'site_direct_cost'
  | 'estimated_gp'
  | 'quote'
  | 'job'
  | 'actual_job_cost_profit_after_close';

export type PlanProfitHandoffEvidence = {
  step: PlanProfitHandoffStep;
  status: 'PRESENT' | 'INCOMPLETE' | 'MISSING';
  note: string;
};

export function provePlanEstimateToActualProfitHandoff(input: {
  hasPlanTakeoff: boolean;
  hasWaterWasteGeyserQuantities: boolean;
  hasMaterials: boolean;
  hasLabour: boolean;
  hasSiteDirectCost: boolean;
  estimatedGpCents: number | null;
  hasQuoteLink: boolean;
  hasJobLink: boolean;
  actualProfitAfterCloseCents: number | null;
  jobClosed: boolean;
}): {
  steps: PlanProfitHandoffEvidence[];
  completeness: 'COMPLETE' | 'INCOMPLETE';
  inventedValues: false;
} {
  const steps: PlanProfitHandoffEvidence[] = [
    {
      step: 'plan_takeoff',
      status: input.hasPlanTakeoff ? 'PRESENT' : 'MISSING',
      note: input.hasPlanTakeoff ? 'Plan/takeoff present' : 'Plan/takeoff evidence missing',
    },
    {
      step: 'water_waste_geyser_quantities',
      status: input.hasWaterWasteGeyserQuantities ? 'PRESENT' : 'INCOMPLETE',
      note: 'Quantity evidence',
    },
    {
      step: 'materials',
      status: input.hasMaterials ? 'PRESENT' : 'INCOMPLETE',
      note: 'Materials evidence',
    },
    {
      step: 'labour',
      status: input.hasLabour ? 'PRESENT' : 'INCOMPLETE',
      note: 'Labour evidence',
    },
    {
      step: 'site_direct_cost',
      status: input.hasSiteDirectCost ? 'PRESENT' : 'INCOMPLETE',
      note: 'Site/direct cost evidence',
    },
    {
      step: 'estimated_gp',
      status: input.estimatedGpCents != null ? 'PRESENT' : 'INCOMPLETE',
      note:
        input.estimatedGpCents != null
          ? `Estimated GP ${input.estimatedGpCents}c`
          : 'Estimated GP unknown — not invented',
    },
    {
      step: 'quote',
      status: input.hasQuoteLink ? 'PRESENT' : 'MISSING',
      note: 'Quote link',
    },
    {
      step: 'job',
      status: input.hasJobLink ? 'PRESENT' : 'MISSING',
      note: 'Job link',
    },
    {
      step: 'actual_job_cost_profit_after_close',
      status:
        input.jobClosed && input.actualProfitAfterCloseCents != null
          ? 'PRESENT'
          : input.jobClosed
            ? 'INCOMPLETE'
            : 'INCOMPLETE',
      note:
        input.actualProfitAfterCloseCents != null
          ? `Actual profit ${input.actualProfitAfterCloseCents}c`
          : 'Actual profit after close incomplete — not invented',
    },
  ];
  const completeness = steps.every((s) => s.status === 'PRESENT') ? 'COMPLETE' : 'INCOMPLETE';
  return { steps, completeness, inventedValues: false };
}

export function assertRow123SafetyGates(input: {
  row92AutomationEnabled: boolean;
  inventedPlanScale?: boolean;
  inventedCost?: boolean;
  inventedProfit?: boolean;
}): { row92Off: true; inventedValues: false } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if (input.inventedPlanScale || input.inventedCost || input.inventedProfit) {
    throw new Error('Row 123 forbids invented plan scale/cost/profit');
  }
  return { row92Off: true, inventedValues: false };
}
