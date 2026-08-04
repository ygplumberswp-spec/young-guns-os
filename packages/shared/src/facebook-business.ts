/**
 * Facebook Business Integration (TITAN V1.0 Phase 3)
 *
 * Facebook is the external platform. TITAN is the planning, approval, workflow,
 * lead and intelligence layer around it. This module holds the pure domain rules
 * so honesty is enforced in one testable place:
 *
 * - `connected` is only reachable after a verified token + Page + permission +
 *   successful provider request. Every other situation maps to an explicit,
 *   named state rather than an optimistic "connected".
 * - Capabilities are derived from the permissions Meta actually granted, never
 *   from the permissions we asked for.
 * - Nothing reaches Facebook without an approval decision recorded in TITAN.
 * - Attribution never claims a link that was not observed end to end.
 *
 * Extends the Marketing Agent Foundation (migration 0136) and the Social Media
 * Integration Layer (0137); it replaces neither.
 */

import {
  canAccessMarketingAgent,
  canApproveMarketingAgentPublish,
  canWriteMarketingAgent,
} from './marketing-agent.js';

// ─── Provider surface ────────────────────────────────────────────────────────

/** Pinned so a Meta-side default version bump can never silently change behaviour. */
export const FACEBOOK_GRAPH_VERSION = 'v21.0';
export const FACEBOOK_GRAPH_BASE_URL = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`;
export const FACEBOOK_OAUTH_DIALOG_URL = `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`;

/** Web route for the Facebook Business workspace. */
export const FACEBOOK_BUSINESS_HREF = '/facebook-business';

/** Young Guns Plumbing operates in Cape Town; all scheduling is anchored here. */
export const FACEBOOK_SCHEDULING_TIME_ZONE = 'Africa/Johannesburg';

/**
 * Facebook refuses scheduled_publish_time outside this window from now.
 * Enforced locally so the Owner gets a clear message instead of a Graph error.
 */
export const FACEBOOK_MIN_SCHEDULE_LEAD_MINUTES = 10;
export const FACEBOOK_MAX_SCHEDULE_LEAD_DAYS = 180;

// ─── Meta permissions ────────────────────────────────────────────────────────

/**
 * The permissions TITAN can make use of. Most require Meta App Review before
 * they are granted to a live app, so each one is treated as absent until the
 * provider confirms it on the token.
 */
export type FacebookPermission =
  | 'pages_show_list'
  | 'pages_read_engagement'
  | 'pages_manage_posts'
  | 'pages_manage_engagement'
  | 'pages_manage_metadata'
  | 'pages_messaging'
  | 'leads_retrieval'
  | 'pages_read_user_content'
  | 'read_insights'
  | 'business_management';

export const FACEBOOK_PERMISSIONS: FacebookPermission[] = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_engagement',
  'pages_manage_metadata',
  'pages_messaging',
  'leads_retrieval',
  'pages_read_user_content',
  'read_insights',
  'business_management',
];

/** Requested at authorise time. Meta decides what is actually granted. */
export const FACEBOOK_REQUESTED_SCOPES: FacebookPermission[] = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_engagement',
  'pages_manage_metadata',
  'pages_messaging',
  'leads_retrieval',
  'pages_read_user_content',
  'read_insights',
];

export type FacebookCapability =
  | 'list_pages'
  | 'read_page'
  | 'publish_posts'
  | 'schedule_posts'
  | 'read_comments'
  | 'reply_comments'
  | 'read_messages'
  | 'send_messages'
  | 'retrieve_leads'
  | 'read_insights';

export const FACEBOOK_CAPABILITIES: FacebookCapability[] = [
  'list_pages',
  'read_page',
  'publish_posts',
  'schedule_posts',
  'read_comments',
  'reply_comments',
  'read_messages',
  'send_messages',
  'retrieve_leads',
  'read_insights',
];

/**
 * Each capability and the permissions Meta requires for it. A capability is
 * available only when every listed permission is granted — partial grants
 * surface as an explicit missing-permission list, never as a silent failure.
 */
export const FACEBOOK_CAPABILITY_REQUIREMENTS: Record<FacebookCapability, FacebookPermission[]> = {
  list_pages: ['pages_show_list'],
  read_page: ['pages_read_engagement'],
  publish_posts: ['pages_manage_posts'],
  schedule_posts: ['pages_manage_posts'],
  read_comments: ['pages_read_engagement'],
  reply_comments: ['pages_manage_engagement'],
  read_messages: ['pages_messaging'],
  send_messages: ['pages_messaging'],
  retrieve_leads: ['leads_retrieval'],
  read_insights: ['read_insights'],
};

export const FACEBOOK_CAPABILITY_LABELS: Record<FacebookCapability, string> = {
  list_pages: 'List Pages',
  read_page: 'Read Page details',
  publish_posts: 'Publish posts',
  schedule_posts: 'Schedule posts',
  read_comments: 'Read comments',
  reply_comments: 'Reply to comments',
  read_messages: 'Read Messenger conversations',
  send_messages: 'Send Messenger replies',
  retrieve_leads: 'Retrieve Lead Ads leads',
  read_insights: 'Read Page and post insights',
};

export type FacebookCapabilityState = {
  capability: FacebookCapability;
  label: string;
  available: boolean;
  requiredPermissions: FacebookPermission[];
  missingPermissions: FacebookPermission[];
  /** Owner-facing reason. Empty when the capability is available. */
  blockedReason: string;
};

export function resolveFacebookCapability(
  capability: FacebookCapability,
  grantedPermissions: readonly string[],
): FacebookCapabilityState {
  const required = FACEBOOK_CAPABILITY_REQUIREMENTS[capability];
  const granted = new Set(grantedPermissions);
  const missing = required.filter((permission) => !granted.has(permission));

  return {
    capability,
    label: FACEBOOK_CAPABILITY_LABELS[capability],
    available: missing.length === 0,
    requiredPermissions: [...required],
    missingPermissions: missing,
    blockedReason:
      missing.length === 0
        ? ''
        : `Blocked by Meta permission — ${FACEBOOK_CAPABILITY_LABELS[capability]} requires ${missing.join(
            ', ',
          )}. Grant it during authorisation, or complete Meta App Review if the permission is not yet approved for this app.`,
  };
}

export function resolveFacebookCapabilities(
  grantedPermissions: readonly string[],
): FacebookCapabilityState[] {
  return FACEBOOK_CAPABILITIES.map((capability) =>
    resolveFacebookCapability(capability, grantedPermissions),
  );
}

// ─── Connection state (Phase C) ──────────────────────────────────────────────

/**
 * Deliberately wider than a boolean. Each state tells the Owner what to do next
 * and none of them can be reached by assumption — see `resolveFacebookConnectionState`.
 */
export type FacebookConnectionState =
  | 'configuration_required'
  | 'disconnected'
  | 'connected'
  | 'partial'
  | 'missing_permission'
  | 'reauthorisation_required'
  | 'expired'
  | 'provider_unavailable';

export const FACEBOOK_CONNECTION_STATES: FacebookConnectionState[] = [
  'configuration_required',
  'disconnected',
  'connected',
  'partial',
  'missing_permission',
  'reauthorisation_required',
  'expired',
  'provider_unavailable',
];

export const FACEBOOK_CONNECTION_STATE_LABELS: Record<FacebookConnectionState, string> = {
  configuration_required: 'Configuration required',
  disconnected: 'Disconnected',
  connected: 'Connected',
  partial: 'Partial',
  missing_permission: 'Missing permission',
  reauthorisation_required: 'Reauthorisation required',
  expired: 'Expired',
  provider_unavailable: 'Provider unavailable',
};

/** Capabilities without which the connection cannot do its core job. */
export const FACEBOOK_CORE_CAPABILITIES: FacebookCapability[] = ['read_page'];

export type FacebookConnectionStateInput = {
  /** META_APP_ID + META_APP_SECRET present on the API host. */
  appConfigured: boolean;
  /** Encrypted Page access token stored for this company. */
  hasStoredToken: boolean;
  /** A Page has been selected and its id persisted. */
  pageSelected: boolean;
  /** Token expiry, when Meta returned one. Null means long-lived/never-expiring Page token. */
  tokenExpiresAt: Date | null;
  /** Permissions Meta reported as granted on the token (`/me/permissions`). */
  grantedPermissions: readonly string[];
  /** Outcome of the most recent real Graph request. Null when never probed. */
  lastVerification: FacebookVerificationOutcome | null;
  /** Owner explicitly disconnected. */
  disconnectedAt: Date | null;
  now: Date;
};

export type FacebookVerificationOutcome = {
  /** The provider returned a successful response for a real request. */
  ok: boolean;
  /** Set when the failure was an auth/token problem (Graph code 190 family). */
  authError: boolean;
  /** Set when the failure was a permission problem (Graph code 10 / 200 family). */
  permissionError: boolean;
  /** Set when Facebook was unreachable or returned 5xx / rate limit. */
  providerUnavailable: boolean;
  checkedAt: Date;
  message: string;
};

export type FacebookConnectionStateResult = {
  state: FacebookConnectionState;
  label: string;
  /** True only for `connected`. Everything else must not be presented as working. */
  usable: boolean;
  /** Plain-language explanation shown to the Owner. */
  detail: string;
  /** Concrete next step, or null when nothing is required. */
  requiredAction: string | null;
  capabilities: FacebookCapabilityState[];
  missingPermissions: FacebookPermission[];
};

/**
 * The single place `connected` can be produced.
 *
 * Order matters: configuration and explicit disconnection come first, then
 * provider reachability, then token validity, then permissions. A verified
 * success is required — a stored token alone never implies a working link.
 */
export function resolveFacebookConnectionState(
  input: FacebookConnectionStateInput,
): FacebookConnectionStateResult {
  const capabilities = resolveFacebookCapabilities(input.grantedPermissions);
  const missingPermissions = missingFacebookPermissions(input.grantedPermissions);

  const build = (
    state: FacebookConnectionState,
    detail: string,
    requiredAction: string | null,
  ): FacebookConnectionStateResult => ({
    state,
    label: FACEBOOK_CONNECTION_STATE_LABELS[state],
    usable: state === 'connected',
    detail,
    requiredAction,
    capabilities,
    missingPermissions,
  });

  if (!input.appConfigured) {
    return build(
      'configuration_required',
      'No Meta app credentials are configured on this TITAN host, so Facebook cannot be contacted at all.',
      'Set META_APP_ID and META_APP_SECRET on the API host, then authorise the Young Guns Plumbing Page.',
    );
  }

  if (input.disconnectedAt) {
    return build(
      'disconnected',
      'The Facebook connection was disconnected in TITAN. Stored credentials have been cleared.',
      'Reconnect and select the Young Guns Plumbing Page to resume.',
    );
  }

  if (!input.hasStoredToken) {
    return build(
      'disconnected',
      'No Facebook credentials are stored for this company.',
      'Connect Facebook and grant access to the Young Guns Plumbing Page.',
    );
  }

  if (input.tokenExpiresAt && input.tokenExpiresAt.getTime() <= input.now.getTime()) {
    return build(
      'expired',
      'The stored Facebook access token has passed its expiry date, so no request can succeed.',
      'Reconnect Facebook to issue a fresh long-lived token.',
    );
  }

  // Provider problems are reported before token/permission conclusions — an
  // outage tells us nothing about whether our credentials are still good.
  if (input.lastVerification?.providerUnavailable) {
    return build(
      'provider_unavailable',
      `Facebook did not respond successfully to the last request: ${input.lastVerification.message}`,
      'No action required yet. TITAN will retry; reconnect only if this persists.',
    );
  }

  if (input.lastVerification?.authError) {
    return build(
      'reauthorisation_required',
      `Facebook rejected the stored credentials: ${input.lastVerification.message}`,
      'Reconnect Facebook. The token was invalidated by Meta (password change, permission removal, or session revocation).',
    );
  }

  if (!input.pageSelected) {
    return build(
      'partial',
      'Facebook authorisation succeeded but no Page has been selected, so TITAN cannot read or publish anything.',
      'Select the Young Guns Plumbing Page to finish the connection.',
    );
  }

  if (!input.lastVerification) {
    return build(
      'partial',
      'Credentials and a Page are stored, but no successful Facebook request has been recorded yet.',
      'Run a connection check to verify the Page against Facebook.',
    );
  }

  if (!input.lastVerification.ok) {
    if (input.lastVerification.permissionError) {
      return build(
        'missing_permission',
        `Facebook refused the last request for permission reasons: ${input.lastVerification.message}`,
        'Reconnect and grant the missing permissions, or complete Meta App Review for them.',
      );
    }
    return build(
      'partial',
      `The last Facebook request did not succeed: ${input.lastVerification.message}`,
      'Run a connection check for details.',
    );
  }

  const missingCore = FACEBOOK_CORE_CAPABILITIES.flatMap(
    (capability) => resolveFacebookCapability(capability, input.grantedPermissions).missingPermissions,
  );

  if (missingCore.length > 0) {
    return build(
      'missing_permission',
      `The Page is reachable, but Meta has not granted ${missingCore.join(', ')}, which TITAN needs to read the Page.`,
      'Reconnect and grant the missing permissions, or complete Meta App Review for them.',
    );
  }

  if (missingPermissions.length > 0) {
    return build(
      'connected',
      `Connected and verified against Facebook. Some optional capabilities are unavailable because Meta has not granted ${missingPermissions.join(
        ', ',
      )}.`,
      null,
    );
  }

  return build('connected', 'Connected and verified against Facebook.', null);
}

export function missingFacebookPermissions(
  grantedPermissions: readonly string[],
): FacebookPermission[] {
  const granted = new Set(grantedPermissions);
  return FACEBOOK_REQUESTED_SCOPES.filter((permission) => !granted.has(permission));
}

// ─── Content workspace (Phase D) ─────────────────────────────────────────────

export type FacebookContentStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled';

export const FACEBOOK_CONTENT_STATUSES: FacebookContentStatus[] = [
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled',
];

export const FACEBOOK_CONTENT_STATUS_LABELS: Record<FacebookContentStatus, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  published: 'Published',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/**
 * `published` is absent from every transition list: it is only ever written by
 * the publisher after Facebook confirms a post id. No human action can set it.
 */
export const FACEBOOK_CONTENT_TRANSITIONS: Record<
  FacebookContentStatus,
  FacebookContentStatus[]
> = {
  draft: ['in_review', 'cancelled'],
  in_review: ['approved', 'draft', 'cancelled'],
  approved: ['scheduled', 'publishing', 'draft', 'cancelled'],
  scheduled: ['publishing', 'approved', 'cancelled'],
  publishing: ['published', 'failed'],
  published: [],
  failed: ['approved', 'scheduled', 'cancelled'],
  cancelled: [],
};

export function canTransitionFacebookContent(
  from: FacebookContentStatus,
  to: FacebookContentStatus,
): boolean {
  return FACEBOOK_CONTENT_TRANSITIONS[from].includes(to);
}

export type FacebookContentType = 'text' | 'link' | 'photo' | 'multi_photo';

export const FACEBOOK_CONTENT_TYPES: FacebookContentType[] = [
  'text',
  'link',
  'photo',
  'multi_photo',
];

/** Video and Reels need endpoints and review TITAN has not been granted; excluded rather than half-built. */
export const FACEBOOK_UNSUPPORTED_CONTENT_TYPES = ['video', 'reel', 'story'] as const;

/**
 * The approval gate. Publishing is refused unless an approval decision exists,
 * the connection is verified, and Meta granted the publishing permission.
 */
export type FacebookPublishEligibilityInput = {
  status: FacebookContentStatus;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  connectionState: FacebookConnectionState;
  capabilities: readonly FacebookCapabilityState[];
  scheduledFor: Date | null;
  now: Date;
};

export type FacebookPublishEligibility = {
  eligible: boolean;
  /** Machine-readable so routes can map to a status code and audit can record it. */
  reasonCode:
    | 'eligible'
    | 'not_approved'
    | 'missing_approval_record'
    | 'connection_not_usable'
    | 'missing_permission'
    | 'already_published'
    | 'cancelled'
    | 'schedule_not_due';
  reason: string;
};

export function evaluateFacebookPublishEligibility(
  input: FacebookPublishEligibilityInput,
): FacebookPublishEligibility {
  const deny = (
    reasonCode: FacebookPublishEligibility['reasonCode'],
    reason: string,
  ): FacebookPublishEligibility => ({ eligible: false, reasonCode, reason });

  if (input.status === 'published') {
    return deny('already_published', 'This post has already been published to Facebook.');
  }
  if (input.status === 'cancelled') {
    return deny('cancelled', 'This post was cancelled and cannot be published.');
  }
  if (input.status !== 'approved' && input.status !== 'scheduled' && input.status !== 'failed') {
    return deny(
      'not_approved',
      `Publishing requires an approved post. This post is ${FACEBOOK_CONTENT_STATUS_LABELS[input.status]}.`,
    );
  }
  // Guards against a status written by any path that skipped the approval step.
  if (!input.approvedByUserId || !input.approvedAt) {
    return deny(
      'missing_approval_record',
      'No approval record exists for this post. TITAN will not publish content that was not explicitly approved.',
    );
  }
  if (input.connectionState !== 'connected') {
    return deny(
      'connection_not_usable',
      `The Facebook connection is ${FACEBOOK_CONNECTION_STATE_LABELS[input.connectionState]}. Publishing needs a verified connection.`,
    );
  }

  const publish = input.capabilities.find((entry) => entry.capability === 'publish_posts');
  if (!publish?.available) {
    return deny(
      'missing_permission',
      publish?.blockedReason ??
        'Blocked by Meta permission — publishing requires pages_manage_posts.',
    );
  }

  if (input.scheduledFor && input.scheduledFor.getTime() > input.now.getTime()) {
    return deny(
      'schedule_not_due',
      `This post is scheduled for ${input.scheduledFor.toISOString()} and is not due yet.`,
    );
  }

  return { eligible: true, reasonCode: 'eligible', reason: 'Approved and ready to publish.' };
}

// ─── Scheduling (Phase F) ────────────────────────────────────────────────────

export type FacebookScheduleValidation =
  | { valid: true; scheduledFor: Date; unixSeconds: number }
  | { valid: false; message: string };

export function validateFacebookSchedule(
  scheduledFor: Date,
  now: Date,
): FacebookScheduleValidation {
  if (Number.isNaN(scheduledFor.getTime())) {
    return { valid: false, message: 'Scheduled time is not a valid date.' };
  }

  const leadMs = scheduledFor.getTime() - now.getTime();
  const minMs = FACEBOOK_MIN_SCHEDULE_LEAD_MINUTES * 60 * 1000;
  const maxMs = FACEBOOK_MAX_SCHEDULE_LEAD_DAYS * 24 * 60 * 60 * 1000;

  if (leadMs < minMs) {
    return {
      valid: false,
      message: `Facebook requires scheduled posts to be at least ${FACEBOOK_MIN_SCHEDULE_LEAD_MINUTES} minutes in the future.`,
    };
  }
  if (leadMs > maxMs) {
    return {
      valid: false,
      message: `Facebook does not accept posts scheduled more than ${FACEBOOK_MAX_SCHEDULE_LEAD_DAYS} days ahead.`,
    };
  }

  return {
    valid: true,
    scheduledFor,
    unixSeconds: Math.floor(scheduledFor.getTime() / 1000),
  };
}

export function formatFacebookScheduleForOwner(value: Date): string {
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: FACEBOOK_SCHEDULING_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

/**
 * Retry safety. The same content row always produces the same key, so a retried
 * publish is recognised by Facebook as the request we already made rather than
 * creating a second post.
 */
export function buildFacebookIdempotencyKey(input: {
  companyId: string;
  contentId: string;
  attempt: number;
}): string {
  return `titan-fb-${input.companyId}-${input.contentId}-${input.attempt}`;
}

/**
 * Retries reuse the attempt number of the request that may already have reached
 * Facebook, so we never publish twice after an ambiguous timeout.
 */
export function nextFacebookPublishAttempt(input: {
  attempts: number;
  lastAttemptReachedProvider: boolean;
}): number {
  return input.lastAttemptReachedProvider ? input.attempts : input.attempts + 1;
}

// ─── Brand controls (Phase E) ────────────────────────────────────────────────

/**
 * Verified Young Guns Plumbing contact details. The logo is intentionally
 * absent: no placeholder or generated mark is acceptable, so the Owner must
 * upload the real asset before it can be attached.
 */
export const YOUNG_GUNS_BRAND = {
  businessName: 'Young Guns Plumbing',
  phone: '066 234 6301',
  phoneE164: '+27662346301',
  email: 'ygplumberswp@gmail.com',
  serviceArea: 'Cape Town, Western Cape',
  logoAssetId: null as string | null,
  logoNote:
    'No logo asset is stored in TITAN. Upload the real Young Guns Plumbing logo to the Marketing media library — TITAN will not generate or substitute one.',
} as const;

export type FacebookBrandCheck = {
  passed: boolean;
  includesPhone: boolean;
  includesEmail: boolean;
  warnings: string[];
};

function normaliseDigits(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/** Advisory only — the Owner may publish copy that omits contact details. */
export function checkFacebookBrandCompliance(body: string): FacebookBrandCheck {
  const digits = normaliseDigits(body);
  const includesPhone =
    digits.includes(normaliseDigits(YOUNG_GUNS_BRAND.phone)) ||
    digits.includes(normaliseDigits(YOUNG_GUNS_BRAND.phoneE164));
  const includesEmail = body.toLowerCase().includes(YOUNG_GUNS_BRAND.email.toLowerCase());

  const warnings: string[] = [];
  if (!includesPhone) {
    warnings.push(`Copy does not include the business phone number (${YOUNG_GUNS_BRAND.phone}).`);
  }
  if (!includesEmail) {
    warnings.push(`Copy does not include the business email (${YOUNG_GUNS_BRAND.email}).`);
  }

  return { passed: warnings.length === 0, includesPhone, includesEmail, warnings };
}

// ─── Media (Phase G) ─────────────────────────────────────────────────────────

export const FACEBOOK_ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export const FACEBOOK_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const FACEBOOK_MAX_PHOTOS_PER_POST = 10;

export type FacebookMediaValidation = {
  valid: boolean;
  errors: string[];
  /** Requires an explicit Owner acknowledgement before the image can be attached. */
  privacyReviewRequired: boolean;
  privacyNotes: string[];
};

export type FacebookMediaCandidate = {
  fileName: string;
  mimeType: string;
  byteSize: number;
  /** Set when the asset came from a customer job, employee record or vehicle photo. */
  sourceContext?: 'job' | 'customer' | 'employee' | 'vehicle' | 'marketing_library' | 'upload';
};

/**
 * Marketing images regularly come out of job documentation, which is where
 * customer addresses, employee faces and number plates leak from. Anything not
 * originating in the marketing library is held for an explicit privacy decision.
 */
export function validateFacebookMedia(candidate: FacebookMediaCandidate): FacebookMediaValidation {
  const errors: string[] = [];
  const privacyNotes: string[] = [];

  if (!FACEBOOK_ALLOWED_IMAGE_MIME_TYPES.includes(candidate.mimeType as never)) {
    errors.push(
      `${candidate.fileName}: ${candidate.mimeType} is not an image type Facebook accepts (${FACEBOOK_ALLOWED_IMAGE_MIME_TYPES.join(', ')}).`,
    );
  }
  if (candidate.byteSize <= 0) {
    errors.push(`${candidate.fileName}: file is empty.`);
  }
  if (candidate.byteSize > FACEBOOK_MAX_IMAGE_BYTES) {
    errors.push(
      `${candidate.fileName}: ${(candidate.byteSize / (1024 * 1024)).toFixed(1)}MB exceeds the ${(
        FACEBOOK_MAX_IMAGE_BYTES /
        (1024 * 1024)
      ).toFixed(0)}MB Facebook photo limit.`,
    );
  }

  const context = candidate.sourceContext ?? 'upload';
  if (context === 'job' || context === 'customer') {
    privacyNotes.push(
      'Sourced from customer records — confirm no customer name, address or property identifier is visible before publishing.',
    );
  }
  if (context === 'employee') {
    privacyNotes.push(
      'Sourced from employee records — confirm the employee consented to their image being published.',
    );
  }
  if (context === 'vehicle') {
    privacyNotes.push(
      'Sourced from vehicle records — confirm number plates are not legible before publishing.',
    );
  }
  if (context === 'upload') {
    privacyNotes.push(
      'Direct upload — confirm no customer, employee or number plate detail is visible before publishing.',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    privacyReviewRequired: privacyNotes.length > 0,
    privacyNotes,
  };
}

// ─── Comments (Phase H) ──────────────────────────────────────────────────────

export type FacebookCommentClassification =
  | 'enquiry'
  | 'complaint'
  | 'praise'
  | 'question'
  | 'spam'
  | 'general';

export const FACEBOOK_COMMENT_CLASSIFICATIONS: FacebookCommentClassification[] = [
  'enquiry',
  'complaint',
  'praise',
  'question',
  'spam',
  'general',
];

const ENQUIRY_MARKERS = [
  'quote',
  'quotation',
  'price',
  'pricing',
  'how much',
  'cost',
  'call me',
  'contact me',
  'available',
  'book',
  'need a plumber',
  'come out',
];
const COMPLAINT_MARKERS = [
  'terrible',
  'awful',
  'worst',
  'never came',
  'no show',
  'refund',
  'complaint',
  'unhappy',
  'disappointed',
  'rude',
  'still leaking',
];
const PRAISE_MARKERS = [
  'thank you',
  'thanks',
  'great job',
  'excellent',
  'brilliant',
  'recommend',
  'awesome',
  'legend',
  'best plumber',
];
const SPAM_MARKERS = [
  'click here',
  'crypto',
  'forex',
  'investment opportunity',
  'follow me',
  'free money',
  'whatsapp +1',
  'bit.ly',
];

export type FacebookCommentClassificationResult = {
  classification: FacebookCommentClassification;
  /** Whether TITAN is confident enough to route this automatically. */
  confident: boolean;
  matchedMarkers: string[];
  /** True when the comment looks like a sales opportunity worth a lead. */
  leadCandidate: boolean;
};

/**
 * Rule-based and deliberately conservative. An unmatched comment is `general`
 * with `confident: false` so a human decides, rather than being filed wrongly.
 */
export function classifyFacebookComment(body: string): FacebookCommentClassificationResult {
  const text = body.toLowerCase();
  const matched = (markers: string[]) => markers.filter((marker) => text.includes(marker));

  const spam = matched(SPAM_MARKERS);
  if (spam.length > 0) {
    return {
      classification: 'spam',
      confident: true,
      matchedMarkers: spam,
      leadCandidate: false,
    };
  }

  const complaint = matched(COMPLAINT_MARKERS);
  if (complaint.length > 0) {
    return {
      classification: 'complaint',
      confident: true,
      matchedMarkers: complaint,
      leadCandidate: false,
    };
  }

  const enquiry = matched(ENQUIRY_MARKERS);
  if (enquiry.length > 0) {
    return {
      classification: 'enquiry',
      confident: true,
      matchedMarkers: enquiry,
      leadCandidate: true,
    };
  }

  const praise = matched(PRAISE_MARKERS);
  if (praise.length > 0) {
    return {
      classification: 'praise',
      confident: true,
      matchedMarkers: praise,
      leadCandidate: false,
    };
  }

  if (text.trim().endsWith('?')) {
    return {
      classification: 'question',
      confident: false,
      matchedMarkers: [],
      leadCandidate: false,
    };
  }

  return {
    classification: 'general',
    confident: false,
    matchedMarkers: [],
    leadCandidate: false,
  };
}

/** Moderation TITAN will never perform, and the reason shown if it is attempted. */
export const FACEBOOK_PROHIBITED_MODERATION_ACTIONS = {
  hide: 'TITAN does not hide Facebook comments. Moderate directly on the Page so the action is attributable to a person.',
  delete:
    'TITAN does not delete Facebook comments. Moderate directly on the Page so the action is attributable to a person.',
  ban: 'TITAN does not ban Facebook users. Moderate directly on the Page so the action is attributable to a person.',
} as const;

// ─── Messenger (Phase I) ─────────────────────────────────────────────────────

export type FacebookMessengerAvailability = {
  available: boolean;
  reason: string;
  missingPermissions: FacebookPermission[];
  /** Meta's 24-hour standard messaging window, when the platform is available. */
  responseWindowHours: 24;
};

export function resolveFacebookMessengerAvailability(
  grantedPermissions: readonly string[],
): FacebookMessengerAvailability {
  const capability = resolveFacebookCapability('read_messages', grantedPermissions);
  return {
    available: capability.available,
    reason: capability.available
      ? 'Messenger conversations can be read and replied to within Meta’s 24-hour standard messaging window.'
      : 'Blocked by Meta permission — Messenger requires pages_messaging, which Meta grants only after App Review. TITAN shows no Messenger data until it is granted.',
    missingPermissions: capability.missingPermissions,
    responseWindowHours: 24,
  };
}

/**
 * Meta only permits free-form replies within 24 hours of the customer's last
 * message. Outside it, a reply needs an approved message tag we do not have.
 */
export function isWithinMessengerWindow(lastCustomerMessageAt: Date, now: Date): boolean {
  const elapsedMs = now.getTime() - lastCustomerMessageAt.getTime();
  return elapsedMs >= 0 && elapsedMs <= 24 * 60 * 60 * 1000;
}

// ─── Leads (Phase J) ─────────────────────────────────────────────────────────

export type FacebookLeadSource = 'lead_ad' | 'messenger' | 'comment' | 'utm_link';

export const FACEBOOK_LEAD_SOURCES: FacebookLeadSource[] = [
  'lead_ad',
  'messenger',
  'comment',
  'utm_link',
];

/** `sourceKey` written to the existing `lead_sources` table. */
export const FACEBOOK_LEAD_SOURCE_KEY = 'facebook';

export type FacebookLeadCandidate = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  externalLeadId: string | null;
};

export type FacebookExistingLead = {
  leadId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  externalLeadId: string | null;
};

export type FacebookDuplicateDecision = {
  /** `duplicate` merges; `review` never merges silently; `new` creates. */
  outcome: 'duplicate' | 'review' | 'new';
  matchedLeadId: string | null;
  matchedOn: Array<'external_lead_id' | 'email' | 'phone' | 'name'>;
  reason: string;
};

function normaliseEmail(value: string | null): string | null {
  return value?.trim().toLowerCase() || null;
}

/** Last 9 digits ignore +27 / 0 prefix differences without matching unrelated numbers. */
function normalisePhone(value: string | null): string | null {
  const digits = value ? normaliseDigits(value) : '';
  if (digits.length < 9) return null;
  return digits.slice(-9);
}

function normaliseName(value: string | null): string | null {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') || null;
}

/**
 * Only an exact provider lead id, email or phone match is strong enough to
 * merge. A name-only match goes to `review` — merging two different customers
 * who share a common name is worse than a duplicate row.
 */
export function detectFacebookLeadDuplicate(
  candidate: FacebookLeadCandidate,
  existing: readonly FacebookExistingLead[],
): FacebookDuplicateDecision {
  const candidateEmail = normaliseEmail(candidate.email);
  const candidatePhone = normalisePhone(candidate.phone);
  const candidateName = normaliseName(candidate.fullName);

  for (const lead of existing) {
    if (
      candidate.externalLeadId &&
      lead.externalLeadId &&
      candidate.externalLeadId === lead.externalLeadId
    ) {
      return {
        outcome: 'duplicate',
        matchedLeadId: lead.leadId,
        matchedOn: ['external_lead_id'],
        reason: 'Facebook returned a lead id already imported into TITAN.',
      };
    }
  }

  for (const lead of existing) {
    const matchedOn: FacebookDuplicateDecision['matchedOn'] = [];
    if (candidateEmail && normaliseEmail(lead.email) === candidateEmail) matchedOn.push('email');
    if (candidatePhone && normalisePhone(lead.phone) === candidatePhone) matchedOn.push('phone');

    if (matchedOn.length > 0) {
      return {
        outcome: 'duplicate',
        matchedLeadId: lead.leadId,
        matchedOn,
        reason: `An existing lead shares the same ${matchedOn.join(' and ')}.`,
      };
    }
  }

  for (const lead of existing) {
    if (candidateName && normaliseName(lead.fullName) === candidateName) {
      return {
        outcome: 'review',
        matchedLeadId: lead.leadId,
        matchedOn: ['name'],
        reason:
          'An existing lead has the same name but no matching email or phone. TITAN will not merge on a name alone — confirm manually.',
      };
    }
  }

  return {
    outcome: 'new',
    matchedLeadId: null,
    matchedOn: [],
    reason: 'No existing lead matches this contact.',
  };
}

export type FacebookUtm = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
};

export function parseFacebookUtm(url: string): FacebookUtm {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return { source: null, medium: null, campaign: null, content: null, term: null };
  }
  const read = (key: string) => params.get(key)?.trim() || null;
  return {
    source: read('utm_source'),
    medium: read('utm_medium'),
    campaign: read('utm_campaign'),
    content: read('utm_content'),
    term: read('utm_term'),
  };
}

export function isFacebookOriginatedUtm(utm: FacebookUtm): boolean {
  const source = utm.source?.toLowerCase() ?? '';
  return source === 'facebook' || source === 'fb' || source === 'meta';
}

// ─── Lead response workflow (Phase K) ────────────────────────────────────────

export type FacebookLeadWorkflowStage =
  | 'imported'
  | 'matched'
  | 'classified'
  | 'assigned'
  | 'reply_drafted'
  | 'reply_approved'
  | 'responded'
  | 'converted'
  | 'closed';

export const FACEBOOK_LEAD_WORKFLOW_STAGES: FacebookLeadWorkflowStage[] = [
  'imported',
  'matched',
  'classified',
  'assigned',
  'reply_drafted',
  'reply_approved',
  'responded',
  'converted',
  'closed',
];

export const FACEBOOK_LEAD_WORKFLOW_TRANSITIONS: Record<
  FacebookLeadWorkflowStage,
  FacebookLeadWorkflowStage[]
> = {
  imported: ['matched', 'classified', 'closed'],
  matched: ['classified', 'assigned', 'closed'],
  classified: ['assigned', 'reply_drafted', 'closed'],
  assigned: ['reply_drafted', 'responded', 'closed'],
  reply_drafted: ['reply_approved', 'assigned', 'closed'],
  reply_approved: ['responded', 'closed'],
  responded: ['converted', 'closed'],
  converted: ['closed'],
  closed: [],
};

export function canTransitionFacebookLeadStage(
  from: FacebookLeadWorkflowStage,
  to: FacebookLeadWorkflowStage,
): boolean {
  return FACEBOOK_LEAD_WORKFLOW_TRANSITIONS[from].includes(to);
}

export type FacebookLeadUrgency = 'emergency' | 'high' | 'normal' | 'low';

const EMERGENCY_MARKERS = [
  'burst',
  'flooding',
  'flood',
  'emergency',
  'urgent',
  'no water',
  'sewage',
  'geyser burst',
  'water everywhere',
];
const HIGH_MARKERS = ['leak', 'leaking', 'blocked', 'blockage', 'today', 'asap', 'as soon as'];

export function classifyFacebookLeadUrgency(text: string): {
  urgency: FacebookLeadUrgency;
  matchedMarkers: string[];
} {
  const lower = text.toLowerCase();
  const emergency = EMERGENCY_MARKERS.filter((marker) => lower.includes(marker));
  if (emergency.length > 0) return { urgency: 'emergency', matchedMarkers: emergency };

  const high = HIGH_MARKERS.filter((marker) => lower.includes(marker));
  if (high.length > 0) return { urgency: 'high', matchedMarkers: high };

  return { urgency: 'normal', matchedMarkers: [] };
}

/**
 * Booking stays a human decision. TITAN prepares the reply and surfaces the
 * urgency; it never confirms an appointment on the customer's behalf.
 */
export const FACEBOOK_LEAD_AUTOMATION_POLICY = {
  autoBook: false,
  autoReply: false,
  autoMerge: false,
  note: 'TITAN imports, matches, classifies, assigns and drafts. Sending a reply and booking a job both require an explicit person.',
} as const;

// ─── Insights (Phase L) ──────────────────────────────────────────────────────

export type FacebookInsightSource = 'organic' | 'paid' | 'combined' | 'unknown';

export type FacebookInsightCoverage = {
  /** Null when Meta returned no data — never zero-filled to look complete. */
  requestedFrom: string;
  requestedTo: string;
  /** The range Meta actually returned data for. */
  coveredFrom: string | null;
  coveredTo: string | null;
  complete: boolean;
  source: FacebookInsightSource;
  note: string;
};

export function buildFacebookInsightCoverage(input: {
  requestedFrom: Date;
  requestedTo: Date;
  returnedDates: readonly Date[];
  source: FacebookInsightSource;
}): FacebookInsightCoverage {
  const iso = (value: Date) => value.toISOString();

  if (input.returnedDates.length === 0) {
    return {
      requestedFrom: iso(input.requestedFrom),
      requestedTo: iso(input.requestedTo),
      coveredFrom: null,
      coveredTo: null,
      complete: false,
      source: input.source,
      note: 'Facebook returned no insight rows for this range. No figures are shown rather than showing zeros.',
    };
  }

  const times = input.returnedDates.map((value) => value.getTime()).sort((a, b) => a - b);
  const coveredFrom = new Date(times[0]!);
  const coveredTo = new Date(times[times.length - 1]!);

  // Meta reports Page insights on whole days, so tolerate sub-day edges.
  const dayMs = 24 * 60 * 60 * 1000;
  const complete =
    coveredFrom.getTime() - input.requestedFrom.getTime() <= dayMs &&
    input.requestedTo.getTime() - coveredTo.getTime() <= dayMs;

  return {
    requestedFrom: iso(input.requestedFrom),
    requestedTo: iso(input.requestedTo),
    coveredFrom: iso(coveredFrom),
    coveredTo: iso(coveredTo),
    complete,
    source: input.source,
    note: complete
      ? `Facebook returned ${input.source} insights covering the full requested range.`
      : `Facebook returned ${input.source} insights for part of the requested range only. Figures cover ${iso(coveredFrom)} to ${iso(coveredTo)}.`,
  };
}

export const FACEBOOK_INSIGHT_SOURCE_LABELS: Record<FacebookInsightSource, string> = {
  organic: 'Organic',
  paid: 'Paid',
  combined: 'Organic + Paid',
  unknown: 'Source not reported by Facebook',
};

// ─── Attribution (Phase M) ───────────────────────────────────────────────────

export type FacebookAttributionStep =
  | 'post'
  | 'enquiry'
  | 'lead'
  | 'quote'
  | 'job'
  | 'invoice'
  | 'payment';

export const FACEBOOK_ATTRIBUTION_STEPS: FacebookAttributionStep[] = [
  'post',
  'enquiry',
  'lead',
  'quote',
  'job',
  'invoice',
  'payment',
];

export type FacebookAttributionLink = {
  step: FacebookAttributionStep;
  entityId: string | null;
  /** `observed` when TITAN recorded the link itself; `reported` when Facebook did. */
  evidence: 'observed' | 'reported' | 'none';
  occurredAt: string | null;
};

export type FacebookAttributionChain = {
  links: FacebookAttributionLink[];
  /** The furthest step with unbroken evidence back to the post. */
  confirmedThrough: FacebookAttributionStep | null;
  complete: boolean;
  /** Value is only stated once the chain reaches payment with evidence. */
  attributedValueCents: number | null;
  note: string;
};

/**
 * Walks the chain from the post forward and stops at the first missing link.
 * A payment with no evidenced lead in between is not credited to Facebook —
 * over-claiming marketing ROI is the failure mode this exists to prevent.
 */
export function buildFacebookAttributionChain(input: {
  links: readonly FacebookAttributionLink[];
  paymentValueCents: number | null;
}): FacebookAttributionChain {
  const byStep = new Map(input.links.map((link) => [link.step, link]));
  const ordered: FacebookAttributionLink[] = FACEBOOK_ATTRIBUTION_STEPS.map(
    (step) =>
      byStep.get(step) ?? {
        step,
        entityId: null,
        evidence: 'none' as const,
        occurredAt: null,
      },
  );

  let confirmedThrough: FacebookAttributionStep | null = null;
  for (const link of ordered) {
    if (link.evidence === 'none' || !link.entityId) break;
    confirmedThrough = link.step;
  }

  const complete = confirmedThrough === 'payment';

  return {
    links: ordered,
    confirmedThrough,
    complete,
    attributedValueCents: complete ? input.paymentValueCents : null,
    note: complete
      ? 'Every step from the Facebook post through to payment is evidenced.'
      : confirmedThrough
        ? `Evidenced as far as ${confirmedThrough}. Later steps are not attributed to Facebook because the chain is not evidenced beyond that point.`
        : 'No evidenced link from this Facebook post to any enquiry.',
  };
}

// ─── AURA (Phase N) ──────────────────────────────────────────────────────────

export type FacebookAuraAction =
  | 'draft_post'
  | 'improve_copy'
  | 'suggest_schedule'
  | 'draft_comment_reply'
  | 'draft_lead_reply'
  | 'summarise_performance';

export const FACEBOOK_AURA_ACTIONS: FacebookAuraAction[] = [
  'draft_post',
  'improve_copy',
  'suggest_schedule',
  'draft_comment_reply',
  'draft_lead_reply',
  'summarise_performance',
];

/**
 * Every action that would reach a customer requires a confirmation step, so
 * AURA can prepare work but never completes an outward-facing action alone.
 */
export const FACEBOOK_AURA_CONFIRMATION_REQUIRED: Record<FacebookAuraAction, boolean> = {
  draft_post: false,
  improve_copy: false,
  suggest_schedule: false,
  draft_comment_reply: true,
  draft_lead_reply: true,
  summarise_performance: false,
};

export function facebookAuraRequiresConfirmation(action: FacebookAuraAction): boolean {
  return FACEBOOK_AURA_CONFIRMATION_REQUIRED[action];
}

// ─── Owner dashboard card (Phase O) ──────────────────────────────────────────

/**
 * Deliberately small. Follower and reach figures are excluded — they would be
 * invented unless read_insights is granted and verified.
 */
export type FacebookDashboardCard = {
  pageName: string | null;
  state: FacebookConnectionState;
  stateLabel: string;
  lastSyncedAt: string | null;
  awaitingApproval: number;
  newLeads: number;
  unansweredComments: number;
  href: string;
  /** Rendered only once a verified connection exists. */
  visible: boolean;
};

export function buildFacebookDashboardCard(input: {
  pageName: string | null;
  state: FacebookConnectionState;
  lastSyncedAt: string | null;
  awaitingApproval: number;
  newLeads: number;
  unansweredComments: number;
}): FacebookDashboardCard {
  return {
    pageName: input.pageName,
    state: input.state,
    stateLabel: FACEBOOK_CONNECTION_STATE_LABELS[input.state],
    lastSyncedAt: input.lastSyncedAt,
    awaitingApproval: input.awaitingApproval,
    newLeads: input.newLeads,
    unansweredComments: input.unansweredComments,
    href: FACEBOOK_BUSINESS_HREF,
    visible: input.state !== 'configuration_required',
  };
}

// ─── Notifications (Phase P) ─────────────────────────────────────────────────

export type FacebookNotificationKind =
  | 'connection_broken'
  | 'permission_missing'
  | 'publish_failed'
  | 'new_lead'
  | 'unanswered_comment'
  | 'approval_pending';

/**
 * One key per underlying problem. A provider error that stays unresolved keeps
 * producing the same key, so the Owner is told once rather than every poll.
 */
export function buildFacebookNotificationDedupeKey(input: {
  companyId: string;
  kind: FacebookNotificationKind;
  subjectId: string | null;
}): string {
  return [`fb`, input.companyId, input.kind, input.subjectId ?? 'connection'].join(':');
}

export function shouldSendFacebookNotification(input: {
  lastSentAt: Date | null;
  resolvedSinceLastSend: boolean;
  now: Date;
  /** Re-raise an unresolved problem at most this often. */
  repeatAfterHours?: number;
}): boolean {
  if (!input.lastSentAt) return true;
  if (input.resolvedSinceLastSend) return true;
  const repeatMs = (input.repeatAfterHours ?? 24) * 60 * 60 * 1000;
  return input.now.getTime() - input.lastSentAt.getTime() >= repeatMs;
}

// ─── Webhooks and polling (Phase Q) ──────────────────────────────────────────

export type FacebookWebhookField =
  | 'feed'
  | 'leadgen'
  | 'messages'
  | 'message_deliveries'
  | 'mention';

export const FACEBOOK_SUBSCRIBED_WEBHOOK_FIELDS: FacebookWebhookField[] = [
  'feed',
  'leadgen',
  'messages',
];

/**
 * Webhooks can be dropped by either side, so polling backfills rather than
 * being the primary path. Browser automation and scraping are never used —
 * only the documented Graph API.
 */
export const FACEBOOK_SYNC_POLICY = {
  webhookPrimary: true,
  pollingBackfillMinutes: 15,
  scrapingAllowed: false,
  browserAutomationAllowed: false,
  note: 'Webhooks deliver in near real time; a 15-minute poll backfills anything Meta failed to deliver. TITAN only uses the documented Graph API.',
} as const;

export type FacebookRetryDecision = {
  retry: boolean;
  delaySeconds: number;
  reason: string;
};

/**
 * Only transient failures are retried. An auth or permission failure will fail
 * identically forever, so it is surfaced to the Owner instead of looping.
 */
export function decideFacebookRetry(input: {
  attempt: number;
  transient: boolean;
  maxAttempts?: number;
}): FacebookRetryDecision {
  const maxAttempts = input.maxAttempts ?? 5;

  if (!input.transient) {
    return {
      retry: false,
      delaySeconds: 0,
      reason: 'The failure is not transient — retrying would fail the same way. Owner action is required.',
    };
  }
  if (input.attempt >= maxAttempts) {
    return {
      retry: false,
      delaySeconds: 0,
      reason: `Gave up after ${maxAttempts} attempts. Raised for Owner attention.`,
    };
  }

  const delaySeconds = Math.min(2 ** input.attempt * 30, 15 * 60);
  return {
    retry: true,
    delaySeconds,
    reason: `Transient failure — retrying in ${delaySeconds}s (attempt ${input.attempt + 1} of ${maxAttempts}).`,
  };
}

// ─── RBAC (Phase R) ──────────────────────────────────────────────────────────

type Identity = { roleName: string; permissions: string[] };

/** Reuses Marketing Agent access so Technician and Client stay excluded. */
export function canAccessFacebookBusiness(identity: Identity): boolean {
  return canAccessMarketingAgent(identity);
}

export function canWriteFacebookBusiness(identity: Identity): boolean {
  return canWriteMarketingAgent(identity);
}

/** Approving content that will reach the public is an Owner-level decision. */
export function canApproveFacebookContent(identity: Identity): boolean {
  return canApproveMarketingAgentPublish(identity);
}

/** Connecting and disconnecting moves credentials, so it is Owner-only. */
export function canManageFacebookConnection(identity: Identity): boolean {
  return canApproveMarketingAgentPublish(identity);
}

/** Lead handling is wider than publishing — sales roles need it. */
export function canWorkFacebookLeads(identity: Identity): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') return false;
  if (identity.permissions.includes('*')) return true;
  return (
    canWriteFacebookBusiness(identity) ||
    identity.permissions.includes('leads:write') ||
    identity.permissions.includes('leads:read')
  );
}

// ─── Audit (Phase S) ─────────────────────────────────────────────────────────

const SECRET_KEY_PATTERN =
  /(token|secret|password|signature|credential|appsecret|access_token|client_secret)/i;

/**
 * Audit records everything a Facebook action did, but a token in an audit row
 * is a token in a log aggregator. Anything secret-shaped is replaced with a
 * marker that still proves a value was present.
 */
export function redactFacebookAuditMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      redacted[key] = value === null || value === undefined ? null : '[redacted]';
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      redacted[key] = redactFacebookAuditMetadata(value as Record<string, unknown>);
      continue;
    }
    redacted[key] = value;
  }

  return redacted;
}

export type FacebookAuditAction =
  | 'connection.oauth_started'
  | 'connection.oauth_completed'
  | 'connection.page_selected'
  | 'connection.verified'
  | 'connection.disconnected'
  | 'content.created'
  | 'content.updated'
  | 'content.submitted'
  | 'content.approved'
  | 'content.rejected'
  | 'content.scheduled'
  | 'content.publish_attempted'
  | 'content.published'
  | 'content.publish_failed'
  | 'content.cancelled'
  | 'comment.imported'
  | 'comment.reply_drafted'
  | 'comment.reply_approved'
  | 'comment.reply_sent'
  | 'lead.imported'
  | 'lead.linked'
  | 'lead.review_required'
  | 'insights.refreshed'
  | 'webhook.received'
  | 'webhook.rejected';
