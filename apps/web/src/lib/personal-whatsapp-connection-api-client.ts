import { request, ApiClientError } from './api-client';
import type {
  ConnectPersonalWaRequest,
  LinkPersonalWaNumberRequest,
  PersonalWaConnectionDashboard,
  PersonalWaConnectionSummary,
  PersonalWaHealthCheckResult,
  PersonalWaTestingCapability,
  UpdatePersonalWaConnectionPrivacyRequest,
  UpdatePersonalWaConnectionSettingsRequest,
} from '@titan/shared';

export { ApiClientError as PersonalWhatsappConnectionApiClientError };

export async function fetchPersonalWaConnectionDashboard(accessToken: string) {
  const data = await request<{
    dashboard: PersonalWaConnectionDashboard;
    autoSend: false;
    autoImport: false;
  }>('/personal-whatsapp-connection/dashboard', { accessToken });
  return data.dashboard;
}

export async function fetchPersonalWaConnectionStatus(accessToken: string) {
  const data = await request<{ connection: PersonalWaConnectionSummary; autoSend: false }>(
    '/personal-whatsapp-connection/status',
    { accessToken },
  );
  return data.connection;
}

export async function fetchPersonalWaTestingSupport(accessToken: string) {
  const data = await request<{
    testingSupport: PersonalWaTestingCapability[];
    runtimeHonesty: PersonalWaConnectionDashboard['runtimeHonesty'];
    autoSend: false;
  }>('/personal-whatsapp-connection/testing-support', { accessToken });
  return data;
}

export async function linkPersonalWaNumber(
  accessToken: string,
  body: LinkPersonalWaNumberRequest,
) {
  const data = await request<{
    connection: PersonalWaConnectionSummary;
    autoSend: false;
    autoImport: false;
  }>('/personal-whatsapp-connection/link', { method: 'PUT', accessToken, body });
  return data.connection;
}

export async function connectPersonalWa(accessToken: string, body: ConnectPersonalWaRequest = {}) {
  const data = await request<{
    connection: PersonalWaConnectionSummary;
    autoSend: false;
    liveProviderVerified: false;
  }>('/personal-whatsapp-connection/connect', { method: 'POST', accessToken, body });
  return data.connection;
}

export async function disconnectPersonalWaConnection(accessToken: string) {
  const data = await request<{ connection: PersonalWaConnectionSummary; autoSend: false }>(
    '/personal-whatsapp-connection/disconnect',
    { method: 'POST', accessToken },
  );
  return data.connection;
}

export async function reconnectPersonalWaConnection(accessToken: string) {
  const data = await request<{ connection: PersonalWaConnectionSummary; autoSend: false }>(
    '/personal-whatsapp-connection/reconnect',
    { method: 'POST', accessToken },
  );
  return data.connection;
}

export async function checkPersonalWaSessionHealth(accessToken: string) {
  const data = await request<{
    result: PersonalWaHealthCheckResult;
    autoSend: false;
    liveProviderVerified: false;
  }>('/personal-whatsapp-connection/health-check', { method: 'POST', accessToken });
  return data.result;
}

export async function updatePersonalWaConnectionPrivacy(
  accessToken: string,
  body: UpdatePersonalWaConnectionPrivacyRequest,
) {
  const data = await request<{
    connection: PersonalWaConnectionSummary;
    autoSend: false;
    autoImport: false;
    privateByDefault: true;
  }>('/personal-whatsapp-connection/privacy', { method: 'PUT', accessToken, body });
  return data.connection;
}

export async function updatePersonalWaConnectionSettings(
  accessToken: string,
  body: UpdatePersonalWaConnectionSettingsRequest,
) {
  const data = await request<{ connection: PersonalWaConnectionSummary; autoSend: false }>(
    '/personal-whatsapp-connection/settings',
    { method: 'PUT', accessToken, body },
  );
  return data.connection;
}
