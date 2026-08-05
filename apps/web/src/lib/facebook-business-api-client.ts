import type {
  FacebookAttributionChain,
  FacebookAuraAction,
  FacebookCapabilityState,
  FacebookConnectionState,
  FacebookContentStatus,
  FacebookContentType,
  FacebookDashboardCard,
  FacebookInsightCoverage,
  FacebookMessengerAvailability,
  FacebookPageDiscoveryDiagnosis,
  FacebookPageDiscoveryResult,
  FacebookPageDiscoveryRow,
  FacebookDirectPageLookupSanitized,
  FacebookPendingPageCandidate,
  FacebookPermission,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as FacebookBusinessApiClientError };

const BASE = '/facebook-business';

/**
 * Connection view. Access tokens are never part of this shape — the API only
 * reports whether credentials exist, never their value.
 */
export type FacebookConnectionView = {
  pageId: string | null;
  pageName: string | null;
  pageUrl: string | null;
  pageCategory: string | null;
  state: FacebookConnectionState;
  stateLabel: string;
  usable: boolean;
  detail: string;
  requiredAction: string | null;
  capabilities: FacebookCapabilityState[];
  grantedPermissions: string[];
  missingPermissions: FacebookPermission[];
  messenger: FacebookMessengerAvailability;
  appConfigured: boolean;
  encryptionConfigured: boolean;
  lastVerifiedAt: string | null;
  lastVerificationMessage: string | null;
  lastSyncedAt: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  webhookSubscribedAt: string | null;
  syncPolicy: {
    webhookPrimary: boolean;
    pollingBackfillMinutes: number;
    scrapingAllowed: boolean;
    browserAutomationAllowed: boolean;
    note: string;
  };
  brand: {
    businessName: string;
    phone: string;
    email: string;
    serviceArea: string;
    logoAssetId: string | null;
    logoNote: string;
  };
  hasStoredCredentials: boolean;
};

export type FacebookPageOption = FacebookPageDiscoveryRow;

export type FacebookPagesDiscoveryResponse = FacebookPageDiscoveryResult & {
  pages: FacebookPageDiscoveryRow[];
  diagnosis: FacebookPageDiscoveryDiagnosis;
  pendingPageCandidate: FacebookPendingPageCandidate | null;
  directLookup: FacebookDirectPageLookupSanitized | null;
};

export type FacebookContentMediaView = {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sourceContext: string;
  privacyReviewRequired: boolean;
  privacyNotes: string[];
};

export type FacebookContentView = {
  id: string;
  status: FacebookContentStatus;
  contentType: FacebookContentType;
  title: string;
  body: string;
  linkUrl: string | null;
  marketingDraftId: string | null;
  scheduledFor: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  rejectedAt: string | null;
  decisionNotes: string | null;
  externalPostId: string | null;
  publishedAt: string | null;
  publishAttempts: number;
  lastPublishError: string | null;
  brandCheckWarnings: string[];
  privacyAcknowledgedAt: string | null;
  media: FacebookContentMediaView[];
  createdAt: string;
};

export type FacebookCommentView = {
  id: string;
  externalCommentId: string;
  externalPostId: string | null;
  authorName: string | null;
  body: string;
  classification: 'enquiry' | 'complaint' | 'praise' | 'question' | 'spam' | 'general';
  classificationConfident: boolean;
  leadCandidate: boolean;
  answered: boolean;
  occurredAt: string | null;
};

export type FacebookLeadView = {
  id: string;
  source: 'lead_ad' | 'messenger' | 'comment' | 'utm_link';
  stage: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  urgency: string;
  leadId: string | null;
  duplicateOutcome: string | null;
  duplicateReason: string | null;
  reviewRequired: boolean;
  assignedToUserId: string | null;
  utmCampaign: string | null;
  receivedAt: string | null;
};

export type FacebookInsightsView = {
  coverage: FacebookInsightCoverage;
  metrics: Array<{
    contentId: string | null;
    externalPostId: string | null;
    metricName: string;
    metricValue: number;
    source: string;
    periodEnd: string;
    fetchedAt: string;
  }>;
};

export type FacebookSyncRunView = {
  id: string;
  trigger: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  commentsIngested: number;
  leadsIngested: number;
  skippedCapabilities: string[];
  message: string;
};

export type FacebookNotificationView = {
  id: string;
  kind: string;
  title: string;
  body: string;
  sendCount: number;
  lastSentAt: string | null;
};

// ─── Connection ──────────────────────────────────────────────────────────────

export function fetchFacebookConnection(accessToken: string) {
  return request<FacebookConnectionView>(`${BASE}/connection`, { accessToken });
}

export function fetchFacebookCapabilities(accessToken: string) {
  return request<FacebookCapabilityState[]>(`${BASE}/capabilities`, { accessToken });
}

export function startFacebookOAuth(accessToken: string, returnPath?: string) {
  return request<{ authorizationUrl: string }>(`${BASE}/oauth/start`, {
    method: 'POST',
    accessToken,
    body: { returnPath },
  });
}

export function fetchFacebookPages(accessToken: string) {
  return request<FacebookPagesDiscoveryResponse>(`${BASE}/pages`, { accessToken });
}

export function selectFacebookPage(accessToken: string, pageId: string) {
  return request<FacebookConnectionView>(`${BASE}/pages/select`, {
    method: 'POST',
    accessToken,
    body: { pageId },
  });
}

export function checkFacebookConnection(accessToken: string) {
  return request<FacebookConnectionView>(`${BASE}/connection/check`, {
    method: 'POST',
    accessToken,
  });
}

export function disconnectFacebook(accessToken: string) {
  return request<FacebookConnectionView>(`${BASE}/connection/disconnect`, {
    method: 'POST',
    accessToken,
  });
}

// ─── Content ─────────────────────────────────────────────────────────────────

export function fetchFacebookContent(accessToken: string, status?: FacebookContentStatus) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<FacebookContentView[]>(`${BASE}/content${query}`, { accessToken });
}

export function createFacebookContent(
  accessToken: string,
  body: {
    title: string;
    body: string;
    contentType?: FacebookContentType;
    linkUrl?: string | null;
    scheduledFor?: string | null;
  },
) {
  return request<FacebookContentView>(`${BASE}/content`, { method: 'POST', accessToken, body });
}

export function updateFacebookContent(
  accessToken: string,
  contentId: string,
  body: { title?: string; body?: string; linkUrl?: string | null; scheduledFor?: string | null },
) {
  return request<FacebookContentView>(`${BASE}/content/${contentId}`, {
    method: 'PATCH',
    accessToken,
    body,
  });
}

export function transitionFacebookContent(
  accessToken: string,
  contentId: string,
  to: FacebookContentStatus,
  notes?: string,
) {
  return request<FacebookContentView>(`${BASE}/content/${contentId}/transition`, {
    method: 'POST',
    accessToken,
    body: { to, notes },
  });
}

export function rejectFacebookContent(accessToken: string, contentId: string, notes: string) {
  return request<FacebookContentView>(`${BASE}/content/${contentId}/reject`, {
    method: 'POST',
    accessToken,
    body: { notes },
  });
}

export function publishFacebookContent(accessToken: string, contentId: string) {
  return request<FacebookContentView>(`${BASE}/content/${contentId}/publish`, {
    method: 'POST',
    accessToken,
  });
}

export function cancelFacebookContent(accessToken: string, contentId: string) {
  return request<FacebookContentView>(`${BASE}/content/${contentId}/cancel`, {
    method: 'POST',
    accessToken,
  });
}

export function acknowledgeFacebookPrivacy(accessToken: string, contentId: string) {
  return request<{ acknowledged: boolean }>(`${BASE}/content/${contentId}/privacy-acknowledge`, {
    method: 'POST',
    accessToken,
  });
}

export function fetchFacebookAttribution(accessToken: string, contentId: string) {
  return request<FacebookAttributionChain>(`${BASE}/content/${contentId}/attribution`, {
    accessToken,
  });
}

// ─── Comments and replies ────────────────────────────────────────────────────

export function fetchFacebookComments(accessToken: string, onlyUnanswered = false) {
  const query = onlyUnanswered ? '?unanswered=true' : '';
  return request<FacebookCommentView[]>(`${BASE}/comments${query}`, { accessToken });
}

export function draftFacebookCommentReply(
  accessToken: string,
  commentId: string,
  body: string,
  auraGenerated = false,
) {
  return request<{ id: string; status: string; body: string }>(
    `${BASE}/comments/${commentId}/reply`,
    { method: 'POST', accessToken, body: { body, auraGenerated } },
  );
}

export function approveAndSendFacebookReply(accessToken: string, replyId: string) {
  return request<{ id: string; status: string; externalReplyId: string }>(
    `${BASE}/replies/${replyId}/approve-send`,
    { method: 'POST', accessToken },
  );
}

export function convertFacebookCommentToLead(accessToken: string, commentId: string) {
  return request<{ fbLeadId: string | null }>(`${BASE}/comments/${commentId}/convert-to-lead`, {
    method: 'POST',
    accessToken,
  });
}

// ─── Leads ───────────────────────────────────────────────────────────────────

export function fetchFacebookLeads(accessToken: string) {
  return request<FacebookLeadView[]>(`${BASE}/leads`, { accessToken });
}

export function assignFacebookLead(accessToken: string, fbLeadId: string, assignToUserId: string) {
  return request<{ id: string; stage: string; assignedToUserId: string | null }>(
    `${BASE}/leads/${fbLeadId}/assign`,
    { method: 'POST', accessToken, body: { assignToUserId } },
  );
}

export function resolveFacebookLeadDuplicate(
  accessToken: string,
  fbLeadId: string,
  decision: 'merge' | 'separate',
  mergeIntoLeadId?: string,
) {
  return request<{ id: string; decision: string }>(
    `${BASE}/leads/${fbLeadId}/resolve-duplicate`,
    { method: 'POST', accessToken, body: { decision, mergeIntoLeadId } },
  );
}

// ─── Insights, sync, notifications, dashboard ────────────────────────────────

export function fetchFacebookInsights(accessToken: string) {
  return request<FacebookInsightsView>(`${BASE}/insights`, { accessToken });
}

export function refreshFacebookInsights(accessToken: string) {
  return request<{ stored: number; coverage: FacebookInsightCoverage }>(
    `${BASE}/insights/refresh`,
    { method: 'POST', accessToken },
  );
}

export function runFacebookSync(accessToken: string) {
  return request<{ runId: string; commentsIngested: number; skippedCapabilities: string[] }>(
    `${BASE}/sync`,
    { method: 'POST', accessToken },
  );
}

export function fetchFacebookSyncRuns(accessToken: string) {
  return request<FacebookSyncRunView[]>(`${BASE}/sync-runs`, { accessToken });
}

export function fetchFacebookNotifications(accessToken: string) {
  return request<FacebookNotificationView[]>(`${BASE}/notifications`, { accessToken });
}

export function fetchFacebookDashboardCard(accessToken: string) {
  return request<FacebookDashboardCard>(`${BASE}/dashboard-card`, { accessToken });
}

/** Asks the API whether an AURA action needs the user to confirm before running. */
export function precheckFacebookAuraAction(
  accessToken: string,
  action: FacebookAuraAction,
  confirmed = false,
) {
  return request<{
    action: FacebookAuraAction;
    requiresConfirmation: boolean;
    allowed: boolean;
    note: string;
  }>(`${BASE}/aura/precheck`, { method: 'POST', accessToken, body: { action, confirmed } });
}
