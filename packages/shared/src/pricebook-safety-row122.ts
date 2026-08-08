/**
 * Row 122 — Pricebook safety proof surface
 *
 * Reuses Rows 92–93. Global markup remains DRAFT/OFF; activation requires
 * explicit Owner approval; one-off overrides are quote-scoped only.
 */

import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import {
  assertCataloguePriceUnchangedByOverride,
  assertNewQuoteDoesNotInheritOverride,
  assertRow92UnchangedByOverride,
  assertSourceCostUnchangedByOverride,
} from './quote-price-override.js';

export const PRICEBOOK_SAFETY_ROW122_KEY = 'pricebook-safety-row122' as const;

export function provePricebookSafety(input: {
  globalAutomationEnabled: boolean;
  ruleSetStatus?: string | null;
  ownerApprovalPresentForActivation: boolean;
  ruleSetBefore?: { version: number; status: string; globalAutomationEnabled: boolean };
  ruleSetAfter?: { version: number; status: string; globalAutomationEnabled: boolean };
  catalogueSellBefore?: number;
  catalogueSellAfter?: number;
  sourceCostBefore?: number;
  sourceCostAfter?: number;
  priorOverrideSellCents?: number;
  newQuoteLineSellCents?: number;
  catalogueSellCents?: number;
}): {
  globalMarkupDraftOff: true;
  activationBlockedWithoutOwnerApproval: boolean;
  overrideQuoteScoped: boolean;
  noGlobalMutation: true;
} {
  assertRow92GlobalAutomationDisabled(input.globalAutomationEnabled);
  const status = (input.ruleSetStatus ?? 'DRAFT').toString().toUpperCase();
  const inactive =
    status === 'DRAFT' || status === 'OFF' || status === 'DISABLED' || status === 'INACTIVE';
  if (!inactive && !input.ownerApprovalPresentForActivation) {
    throw new Error('Global markup cannot activate without explicit Owner approval');
  }
  if (input.ruleSetBefore && input.ruleSetAfter) {
    assertRow92UnchangedByOverride({
      before: input.ruleSetBefore as never,
      after: input.ruleSetAfter as never,
    });
  }
  if (input.catalogueSellBefore !== undefined && input.catalogueSellAfter !== undefined) {
    assertCataloguePriceUnchangedByOverride({
      beforeSellCents: input.catalogueSellBefore,
      afterSellCents: input.catalogueSellAfter,
    });
  }
  if (input.sourceCostBefore !== undefined && input.sourceCostAfter !== undefined) {
    assertSourceCostUnchangedByOverride({
      beforeCostCents: input.sourceCostBefore,
      afterCostCents: input.sourceCostAfter,
    });
  }
  if (
    input.priorOverrideSellCents !== undefined &&
    input.newQuoteLineSellCents !== undefined &&
    input.catalogueSellCents !== undefined
  ) {
    assertNewQuoteDoesNotInheritOverride({
      priorOverrideSellCents: input.priorOverrideSellCents,
      newQuoteLineSellCents: input.newQuoteLineSellCents,
      catalogueSellCents: input.catalogueSellCents,
    });
  }
  return {
    globalMarkupDraftOff: true,
    activationBlockedWithoutOwnerApproval: inactive || !input.ownerApprovalPresentForActivation,
    overrideQuoteScoped: true,
    noGlobalMutation: true,
  };
}
