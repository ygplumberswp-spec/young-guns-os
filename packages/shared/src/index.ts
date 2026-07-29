export const APP_NAME = 'TITAN';
export const AI_NAME = 'AURA';

export type ApiHealthResponse = {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = { data: T } | ApiErrorResponse;

export function isApiError(response: ApiResponse<unknown>): response is ApiErrorResponse {
  return 'error' in response;
}

export * from './auth.js';
export * from './aura.js';
export * from './company.js';
export * from './team.js';
export * from './crm.js';
export * from './jobs.js';
export * from './scheduling.js';
export * from './finance.js';
export * from './inventory.js';
export * from './fleet.js';
export * from './integrations.js';
export * from './communications.js';
export * from './documents.js';
export * from './automation.js';
export * from './agents.js';
export * from './portal.js';
export * from './xero-sync.js';
export * from './whatsapp.js';
export * from './agent-runtime.js';
export * from './recruiting.js';
export * from './intelligence.js';
export * from './mobile.js';
export * from './analytics.js';
export * from './agent-orchestration.js';
export * from './sales.js';
export * from './marketing.js';
export * from './leads.js';
export * from './voice.js';
export * from './customer-support.js';
export * from './workforce.js';
export * from './procurement.js';
export * from './executive.js';
export * from './finance-intelligence.js';
export * from './knowledge.js';
export * from './business-intelligence.js';
export * from './integration-api-management.js';
export * from './portal-experience.js';
export * from './mobile-workforce.js';
export * from './quality-assurance.js';
export * from './communications-intelligence.js';
export * from './asset-equipment.js';
export * from './ai-orchestration.js';
export * from './dispatch-intelligence.js';
export * from './fleet-intelligence.js';
export * from './personal-communications-intelligence.js';
export * from './enterprise-security.js';
export * from './integration-platform.js';
export * from './enterprise-analytics.js';
export * from './enterprise-automation-studio.js';
