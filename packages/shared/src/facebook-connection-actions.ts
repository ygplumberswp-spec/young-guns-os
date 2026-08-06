import type { FacebookConnectionState } from './facebook-business.js';
import type { SocialConnectionFoundationStatus } from './social-connection.js';

/** Normalized UI states for Facebook connection management actions. */
export type FacebookConnectionUiStatus =
  | 'not_configured'
  | 'ready_to_connect'
  | 'disconnected'
  | 'partial'
  | 'connected_limited'
  | 'connected'
  | 'reconnect_required'
  | 'error';

export type FacebookConnectionUiAction =
  | 'connect'
  | 'choose_page'
  | 'choose_correct_page'
  | 'grant_business_portfolio'
  | 'grant_page_read'
  | 'enable_content_features'
  | 'check_health'
  | 'reconnect'
  | 'disconnect'
  | 'view_setup';

export type FacebookConnectionActionPlan = {
  primary: FacebookConnectionUiAction | null;
  secondary: FacebookConnectionUiAction[];
  tertiary: FacebookConnectionUiAction[];
};

export const FACEBOOK_CONNECTION_ACTION_LABELS: Record<FacebookConnectionUiAction, string> = {
  connect: 'Connect',
  choose_page: 'Choose Page',
  choose_correct_page: 'Choose correct Page',
  grant_business_portfolio: 'Grant Business Portfolio access',
  grant_page_read: 'Grant Page read access',
  enable_content_features: 'Enable Facebook content features',
  check_health: 'Check health',
  reconnect: 'Reconnect',
  disconnect: 'Disconnect',
  view_setup: 'View setup requirements',
};

export function normalizeFacebookConnectionUiStatus(input: {
  foundationStatus?: SocialConnectionFoundationStatus;
  connectionState?: FacebookConnectionState;
}): FacebookConnectionUiStatus {
  if (input.connectionState) {
    switch (input.connectionState) {
      case 'configuration_required':
        return 'not_configured';
      case 'disconnected':
        return 'disconnected';
      case 'partial':
        return 'partial';
      case 'connected_limited':
        return 'connected_limited';
      case 'connected':
        return 'connected';
      case 'reauthorisation_required':
      case 'expired':
        return 'reconnect_required';
      default:
        return 'error';
    }
  }

  switch (input.foundationStatus) {
    case 'NOT_CONFIGURED':
      return 'not_configured';
    case 'READY_TO_CONNECT':
      return 'ready_to_connect';
    case 'DISCONNECTED':
      return 'disconnected';
    case 'ACCOUNT_SELECTION_REQUIRED':
      return 'partial';
    case 'CONNECTED':
      return 'connected';
    case 'RECONNECT_REQUIRED':
      return 'reconnect_required';
    case 'ERROR':
      return 'error';
    default:
      return 'not_configured';
  }
}

export type FacebookConnectionActionPlanContext = {
  /** When true, partial state shows Grant Business Portfolio access instead of Choose Page. */
  needsBusinessPortfolioAccess?: boolean;
  /** When true, stored Page id does not match the verified tenant Page. */
  pageSelectionMismatch?: boolean;
  /** When true, a Page is already stored — Choose Page must not be the primary action. */
  pageStored?: boolean;
  /** When true, pages_read_engagement is already granted. */
  hasPageReadEngagement?: boolean;
  /** When true, at least one content-upgrade permission is still missing from the token. */
  missingContentFeatures?: boolean;
};

/**
 * Exactly one primary action per state; secondary/tertiary actions never duplicate primary.
 * Used by Integrations Social Connections card and Facebook Business workspace.
 */
export function resolveFacebookConnectionActionPlan(
  status: FacebookConnectionUiStatus,
  context: FacebookConnectionActionPlanContext = {},
): FacebookConnectionActionPlan {
  switch (status) {
    case 'partial':
      if (context.pageSelectionMismatch) {
        return { primary: 'choose_correct_page', secondary: ['disconnect'], tertiary: [] };
      }
      if (context.needsBusinessPortfolioAccess) {
        return { primary: 'grant_business_portfolio', secondary: ['disconnect'], tertiary: [] };
      }
      if (context.pageStored) {
        return {
          primary: 'check_health',
          secondary: [
            ...(context.missingContentFeatures ? (['enable_content_features'] as const) : []),
            'reconnect',
            'disconnect',
          ],
          tertiary: [],
        };
      }
      return { primary: 'choose_page', secondary: ['disconnect'], tertiary: [] };
    case 'connected_limited':
      if (context.hasPageReadEngagement && context.pageStored) {
        return {
          primary: 'check_health',
          secondary: [
            ...(context.missingContentFeatures ? (['enable_content_features'] as const) : []),
            'reconnect',
            'disconnect',
          ],
          tertiary: [],
        };
      }
      return { primary: 'grant_page_read', secondary: ['disconnect'], tertiary: [] };
    case 'connected':
      return {
        primary: 'check_health',
        secondary: [
          ...(context.missingContentFeatures ? (['enable_content_features'] as const) : []),
          'reconnect',
          'disconnect',
        ],
        tertiary: [],
      };
    case 'disconnected':
      return { primary: 'connect', secondary: [], tertiary: [] };
    case 'reconnect_required':
      return { primary: 'reconnect', secondary: ['disconnect'], tertiary: [] };
    case 'error':
      return { primary: 'reconnect', secondary: ['disconnect'], tertiary: [] };
    case 'not_configured':
      return { primary: 'connect', secondary: [], tertiary: ['view_setup'] };
    case 'ready_to_connect':
      return { primary: 'connect', secondary: [], tertiary: ['view_setup'] };
    default:
      return { primary: 'connect', secondary: [], tertiary: [] };
  }
}

export function facebookConnectionActionAllowed(
  plan: FacebookConnectionActionPlan,
  action: FacebookConnectionUiAction,
): boolean {
  if (plan.primary === action) return true;
  if (plan.secondary.includes(action)) return true;
  if (plan.tertiary.includes(action)) return true;
  return false;
}
