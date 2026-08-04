/**
 * Canonical Young Guns Plumbing visual tokens for the entire TITAN application.
 * App shell (`--titan-*` / `--yg-*`) and documents (`DOCUMENT_COLOR_TOKENS`) share this source.
 */

import { contrastRatio, DOCUMENT_COLOR_TOKENS } from './document-engine.js';

/** App-shell CSS variable names (mirrored in packages/ui/src/tokens.css). */
export const YOUNG_GUNS_APP_TOKEN_NAMES = {
  bgApp: '--yg-bg-app',
  bgSurface: '--yg-bg-surface',
  bgElevated: '--yg-bg-elevated',
  bgInput: '--yg-bg-input',
  bluePrimary: '--yg-blue-primary',
  blueHover: '--yg-blue-hover',
  blueMuted: '--yg-blue-muted',
  blueBorder: '--yg-blue-border',
  textPrimary: '--yg-text-primary',
  textSecondary: '--yg-text-secondary',
  textMuted: '--yg-text-muted',
  textDisabled: '--yg-text-disabled',
} as const;

/** Hex values aligned with the approved document palette. */
export const YOUNG_GUNS_APP_COLORS = {
  bgApp: DOCUMENT_COLOR_TOKENS.pageBackground,
  bgSurface: DOCUMENT_COLOR_TOKENS.panelBackground,
  bgElevated: DOCUMENT_COLOR_TOKENS.panelBackgroundRaised,
  bgInput: '#060910',
  bluePrimary: DOCUMENT_COLOR_TOKENS.brandBlue,
  blueHover: DOCUMENT_COLOR_TOKENS.brandBlueBright,
  blueMuted: 'rgba(31, 122, 236, 0.14)',
  blueBorder: DOCUMENT_COLOR_TOKENS.panelBorder,
  textPrimary: DOCUMENT_COLOR_TOKENS.textPrimary,
  textSecondary: '#C5D0DE',
  textMuted: DOCUMENT_COLOR_TOKENS.textMuted,
  textDisabled: '#6B7788',
  success: DOCUMENT_COLOR_TOKENS.positive,
  warning: DOCUMENT_COLOR_TOKENS.warning,
  danger: DOCUMENT_COLOR_TOKENS.danger,
  info: DOCUMENT_COLOR_TOKENS.labelBlue,
  reviewStar: '#FACC15',
} as const;

export type DocumentStatusTone =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'paid'
  | 'partial'
  | 'overdue'
  | 'cancelled'
  | 'default';

/** Maps finance/document statuses to accessible display colours. */
export function documentStatusTone(status: string | null | undefined): DocumentStatusTone {
  const normalised = (status ?? 'draft').toLowerCase().replace(/\s+/g, '_');
  const map: Record<string, DocumentStatusTone> = {
    draft: 'draft',
    sent: 'sent',
    viewed: 'viewed',
    accepted: 'accepted',
    declined: 'declined',
    expired: 'expired',
    paid: 'paid',
    partial: 'partial',
    part_paid: 'partial',
    overdue: 'overdue',
    cancelled: 'cancelled',
    void: 'cancelled',
  };
  return map[normalised] ?? 'default';
}

export function documentStatusColor(tone: DocumentStatusTone): string {
  switch (tone) {
    case 'paid':
    case 'accepted':
      return YOUNG_GUNS_APP_COLORS.success;
    case 'overdue':
    case 'declined':
      return YOUNG_GUNS_APP_COLORS.danger;
    case 'partial':
    case 'sent':
    case 'viewed':
      return YOUNG_GUNS_APP_COLORS.info;
    case 'expired':
    case 'cancelled':
      return YOUNG_GUNS_APP_COLORS.warning;
    case 'draft':
    default:
      return YOUNG_GUNS_APP_COLORS.textMuted;
  }
}

/** WCAG AA for normal text (4.5:1). */
export function meetsWcagAaNormalText(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 4.5;
}

/** WCAG AA for large text / UI components (3:1). */
export function meetsWcagAaLargeText(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 3;
}

export const YOUNG_GUNS_SLOGAN = 'Your #2 Is Our #1 Priority.';

export const YOUNG_GUNS_REVIEW_HEADING = 'We appreciate your support';

/** RGB triplet for rgba(var(--titan-accent-rgb), alpha) usage in legacy CSS. */
export const YOUNG_GUNS_BLUE_RGB = '31, 122, 236';
