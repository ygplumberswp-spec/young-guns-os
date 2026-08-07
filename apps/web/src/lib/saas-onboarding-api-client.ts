import type {
  SaasOnboardingAdvanceInput,
  SaasOnboardingCompanyDetailsInput,
  SaasOnboardingInviteInput,
  SaasOnboardingOperationsInput,
  SaasOnboardingSelectPlanInput,
  SaasOnboardingSkipIntegrationInput,
  SaasOnboardingState,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as SaasOnboardingApiClientError };

export async function fetchOnboardingState(accessToken: string): Promise<SaasOnboardingState> {
  const data = await request<{ state: SaasOnboardingState }>('/onboarding/state', {
    accessToken,
  });
  return data.state;
}

export async function saveOnboardingCompany(
  accessToken: string,
  body: SaasOnboardingCompanyDetailsInput,
): Promise<SaasOnboardingState> {
  const data = await request<{ state: SaasOnboardingState }>('/onboarding/company', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.state;
}

export async function selectOnboardingPlan(
  accessToken: string,
  body: SaasOnboardingSelectPlanInput,
): Promise<SaasOnboardingState> {
  const data = await request<{ state: SaasOnboardingState }>('/onboarding/plan', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.state;
}

export async function inviteOnboardingTeamMember(
  accessToken: string,
  body: SaasOnboardingInviteInput,
): Promise<SaasOnboardingState> {
  const data = await request<{ state: SaasOnboardingState }>('/onboarding/team/invite', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.state;
}

export async function markOnboardingImport(
  accessToken: string,
  mode: 'start_clean' | 'importing' | 'complete',
): Promise<SaasOnboardingState> {
  const data = await request<{ state: SaasOnboardingState }>('/onboarding/import', {
    accessToken,
    method: 'POST',
    body: { mode },
  });
  return data.state;
}

export async function skipOnboardingIntegration(
  accessToken: string,
  body: SaasOnboardingSkipIntegrationInput,
): Promise<SaasOnboardingState> {
  const data = await request<{ state: SaasOnboardingState }>('/onboarding/integrations/skip', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.state;
}

export async function completeOnboardingIntegrations(
  accessToken: string,
): Promise<SaasOnboardingState> {
  const data = await request<{ state: SaasOnboardingState }>('/onboarding/integrations/complete', {
    accessToken,
    method: 'POST',
  });
  return data.state;
}

export async function saveOnboardingOperations(
  accessToken: string,
  body: SaasOnboardingOperationsInput,
): Promise<SaasOnboardingState> {
  const data = await request<{ state: SaasOnboardingState }>('/onboarding/operations', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.state;
}

export async function advanceOnboardingStep(
  accessToken: string,
  body: SaasOnboardingAdvanceInput,
): Promise<SaasOnboardingState> {
  const data = await request<{ state: SaasOnboardingState }>('/onboarding/advance', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.state;
}

export async function activateOnboarding(accessToken: string): Promise<SaasOnboardingState> {
  const data = await request<{ state: SaasOnboardingState }>('/onboarding/activate', {
    accessToken,
    method: 'POST',
  });
  return data.state;
}
