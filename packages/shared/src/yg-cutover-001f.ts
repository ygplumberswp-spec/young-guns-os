/**
 * YG-CUTOVER-001F acceptance contracts — paperless Technician → invoice → payment.
 */

export const YG_CUTOVER_001F_TITLE =
  'COMPLETE PAPERLESS TECHNICIAN → INVOICE → PAYMENT WORKFLOW' as const;

export const YG_CUTOVER_001F_REUSES = [
  'YG-CUTOVER-001E Technician RBAC / assigned-job truth',
  'UNIVERSAL PHONE COMPATIBILITY',
  'Technician Field Mobile safe-area + Messages',
  'JPE / CASH / FIN / invoices / payments',
  'Cartrack telemetry + Google Maps navigation',
  'Gated completion + evidence + offline queue',
] as const;

export const YG_CUTOVER_001F_FORBIDDEN_FOR_TECHNICIAN = [
  'profit',
  'margin',
  'wages',
  'company finance',
  'bank',
  'JPE',
] as const;

export const YG_CUTOVER_001F_FORBIDDEN_FOR_CLIENT = [
  'supplier cost',
  'cost prices',
  'wage rates',
  'internal labour cost',
  'markup',
  'margin',
  'company profit',
  'JPE',
  'internal notes',
  'supplier receipts unless explicitly shared',
] as const;
