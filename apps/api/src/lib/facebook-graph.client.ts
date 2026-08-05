import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  FACEBOOK_GRAPH_BASE_URL,
  FACEBOOK_OAUTH_BASIC_SCOPES,
  FACEBOOK_OAUTH_DIALOG_URL,
  FACEBOOK_PAGE_LIST_ENDPOINT,
  FACEBOOK_PAGE_LIST_FIELDS,
  FACEBOOK_DIRECT_PAGE_LOOKUP_FIELDS,
  type FacebookPermission,
  type RawFacebookAccountRow,
  type FacebookDirectPageLookupRaw,
} from '@titan/shared';

/**
 * Meta Graph API client.
 *
 * Only the documented Graph API is used — no scraping and no browser
 * automation. Every failure is classified so callers can tell an outage from a
 * revoked token from a permission Meta never granted, because those three
 * demand completely different responses.
 */

export type FacebookGraphErrorKind =
  | 'auth'
  | 'permission'
  | 'rate_limit'
  | 'provider_unavailable'
  | 'invalid_request'
  | 'unknown';

export class FacebookGraphError extends Error {
  constructor(
    public readonly kind: FacebookGraphErrorKind,
    message: string,
    public readonly graphCode: number | null = null,
    public readonly graphSubcode: number | null = null,
    public readonly httpStatus: number | null = null,
    /** False only when the request never left TITAN, which makes a retry safe. */
    public readonly reachedProvider: boolean = true,
  ) {
    super(message);
    this.name = 'FacebookGraphError';
  }

  get transient(): boolean {
    return this.kind === 'rate_limit' || this.kind === 'provider_unavailable';
  }
}

/**
 * Graph error codes that mean the token is no longer usable. 190 covers expired,
 * revoked and invalidated sessions; 102 is a session problem; 463/467 are
 * expiry and invalidity subcodes Meta returns alongside them.
 */
const AUTH_CODES = new Set([102, 190, 463, 467]);
/** 10 and the 200-299 band are "the app was not granted this". */
const PERMISSION_CODES = new Set([10, 200, 210, 230, 283, 294]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
/** Meta's own "try again" codes. */
const TRANSIENT_CODES = new Set([1, 2]);

function classifyGraphError(
  code: number | null,
  httpStatus: number,
): FacebookGraphErrorKind {
  if (code !== null) {
    if (AUTH_CODES.has(code)) return 'auth';
    if (PERMISSION_CODES.has(code) || (code >= 200 && code <= 299)) return 'permission';
    if (RATE_LIMIT_CODES.has(code)) return 'rate_limit';
    if (TRANSIENT_CODES.has(code)) return 'provider_unavailable';
  }
  if (httpStatus === 401 || httpStatus === 403) return 'auth';
  if (httpStatus === 429) return 'rate_limit';
  if (httpStatus >= 500) return 'provider_unavailable';
  if (httpStatus >= 400) return 'invalid_request';
  return 'unknown';
}

export type FacebookAppConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  /**
   * Facebook Login for Business configuration ID from Meta App Dashboard.
   * When set, OAuth uses config_id only — never combined with scope parameter.
   */
  loginConfigId?: string | null;
};

export type FacebookPageSummary = {
  id: string;
  name: string;
  category: string | null;
  /** Page access token. Held in memory only until the Owner picks a Page. */
  accessToken: string;
  tasks: string[];
};

export type FacebookPublishedPost = {
  postId: string;
};

export type FacebookCommentPayload = {
  id: string;
  message: string;
  createdTime: string | null;
  fromName: string | null;
  fromId: string | null;
  parentId: string | null;
};

export type FacebookLeadPayload = {
  id: string;
  formId: string | null;
  createdTime: string | null;
  fields: Record<string, string>;
};

export type FacebookInsightPayload = {
  name: string;
  value: number;
  periodStart: string | null;
  periodEnd: string | null;
};

type GraphRequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  searchParams?: Record<string, string | number | undefined>;
  body?: Record<string, string | number | boolean | undefined>;
  accessToken: string;
  timeoutMs?: number;
};

export class FacebookGraphClient {
  constructor(
    private readonly config: FacebookAppConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * Meta requires the app secret proof on server-to-server calls when the app
   * has it enabled, and it costs nothing to always send it.
   */
  private appSecretProof(accessToken: string): string {
    return createHmac('sha256', this.config.appSecret).update(accessToken).digest('hex');
  }

  /**
   * Builds Meta OAuth authorize URL.
   *
   * - With `loginConfigId`: Facebook Login for Business (config_id only, no scope).
   * - Without: least-privilege scope flow (pages_show_list only at initial connect).
   */
  buildAuthorizeUrl(
    state: string,
    scopes: FacebookPermission[] = FACEBOOK_OAUTH_BASIC_SCOPES,
  ): string {
    const params = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: this.config.redirectUri,
      state,
      response_type: 'code',
      // Forces the Page picker so the Owner can correct a wrong earlier grant.
      auth_type: 'rerequest',
    });

    if (this.config.loginConfigId?.trim()) {
      params.set('config_id', this.config.loginConfigId.trim());
    } else {
      params.set('scope', scopes.join(','));
    }

    return `${FACEBOOK_OAUTH_DIALOG_URL}?${params.toString()}`;
  }

  private async request<T>(path: string, options: GraphRequestOptions): Promise<T> {
    const url = new URL(`${FACEBOOK_GRAPH_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(options.searchParams ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    url.searchParams.set('access_token', options.accessToken);
    url.searchParams.set('appsecret_proof', this.appSecretProof(options.accessToken));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);

    let response: Response;
    try {
      const init: RequestInit = { method: options.method ?? 'GET', signal: controller.signal };
      if (options.body) {
        const form = new URLSearchParams();
        for (const [key, value] of Object.entries(options.body)) {
          if (value !== undefined) form.set(key, String(value));
        }
        init.body = form;
        init.headers = { 'content-type': 'application/x-www-form-urlencoded' };
      }
      response = await this.fetchImpl(url, init);
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      // A timeout is ambiguous: the request may well have been processed, so
      // callers must not treat it as "safe to send again".
      throw new FacebookGraphError(
        'provider_unavailable',
        aborted
          ? 'Facebook did not respond within the timeout.'
          : `Could not reach Facebook: ${error instanceof Error ? error.message : 'network error'}`,
        null,
        null,
        null,
        aborted,
      );
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      const graphError = (parsed as { error?: { message?: string; code?: number; error_subcode?: number } })
        .error;
      const code = typeof graphError?.code === 'number' ? graphError.code : null;
      throw new FacebookGraphError(
        classifyGraphError(code, response.status),
        graphError?.message ?? `Facebook returned HTTP ${response.status}.`,
        code,
        typeof graphError?.error_subcode === 'number' ? graphError.error_subcode : null,
        response.status,
        true,
      );
    }

    return parsed as T;
  }

  private async fetchGraphJson<T>(absoluteUrl: string): Promise<{ body: T; httpStatus: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.fetchImpl(absoluteUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = {};
      }

      if (!response.ok) {
        const graphError = (parsed as { error?: { message?: string; code?: number; error_subcode?: number; type?: string } })
          .error;
        const code = typeof graphError?.code === 'number' ? graphError.code : null;
        throw new FacebookGraphError(
          classifyGraphError(code, response.status),
          graphError?.message ?? `Facebook returned HTTP ${response.status}.`,
          code,
          typeof graphError?.error_subcode === 'number' ? graphError.error_subcode : null,
          response.status,
          true,
        );
      }

      return { body: parsed as T, httpStatus: response.status };
    } catch (error) {
      if (error instanceof FacebookGraphError) throw error;
      const aborted = error instanceof Error && error.name === 'AbortError';
      throw new FacebookGraphError(
        'provider_unavailable',
        aborted
          ? 'Facebook did not respond within the timeout.'
          : `Could not reach Facebook: ${error instanceof Error ? error.message : 'network error'}`,
        null,
        null,
        null,
        aborted,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Exchanges the OAuth code for a short-lived user token. */
  async exchangeCodeForUserToken(code: string): Promise<{ accessToken: string; expiresIn: number | null }> {
    const url = new URL(`${FACEBOOK_GRAPH_BASE_URL}/oauth/access_token`);
    url.searchParams.set('client_id', this.config.appId);
    url.searchParams.set('client_secret', this.config.appSecret);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('code', code);

    const response = await this.fetchImpl(url, { method: 'GET' });
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string; code?: number };
    };

    if (!response.ok || !body.access_token) {
      const code = typeof body.error?.code === 'number' ? body.error.code : null;
      throw new FacebookGraphError(
        classifyGraphError(code, response.status),
        body.error?.message ?? 'Facebook did not return an access token for this authorisation code.',
        code,
        null,
        response.status,
      );
    }

    return { accessToken: body.access_token, expiresIn: body.expires_in ?? null };
  }

  /**
   * Short-lived user tokens last about an hour. Exchanging for a long-lived one
   * is what lets the Page tokens derived from it survive past that.
   */
  async exchangeForLongLivedUserToken(
    shortLivedToken: string,
  ): Promise<{ accessToken: string; expiresIn: number | null }> {
    const url = new URL(`${FACEBOOK_GRAPH_BASE_URL}/oauth/access_token`);
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', this.config.appId);
    url.searchParams.set('client_secret', this.config.appSecret);
    url.searchParams.set('fb_exchange_token', shortLivedToken);

    const response = await this.fetchImpl(url, { method: 'GET' });
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string; code?: number };
    };

    if (!response.ok || !body.access_token) {
      const code = typeof body.error?.code === 'number' ? body.error.code : null;
      throw new FacebookGraphError(
        classifyGraphError(code, response.status),
        body.error?.message ?? 'Facebook did not return a long-lived token.',
        code,
        null,
        response.status,
      );
    }

    return { accessToken: body.access_token, expiresIn: body.expires_in ?? null };
  }

  /** Permissions Meta actually granted — the only trustworthy source. */
  async getGrantedPermissions(userAccessToken: string): Promise<string[]> {
    const body = await this.request<{ data?: Array<{ permission?: string; status?: string }> }>(
      '/me/permissions',
      { accessToken: userAccessToken },
    );
    return (body.data ?? [])
      .filter((entry) => entry.status === 'granted' && entry.permission)
      .map((entry) => entry.permission as string);
  }

  /** Sanitized token inspection — never returns the token itself. */
  async inspectAccessToken(userAccessToken: string): Promise<{
    isValid: boolean;
    appId: string | null;
    userIdPresent: boolean;
    expiresAt: number | null;
    scopes: string[];
  }> {
    const appAccessToken = `${this.config.appId}|${this.config.appSecret}`;
    const url = new URL(`${FACEBOOK_GRAPH_BASE_URL}/debug_token`);
    url.searchParams.set('input_token', userAccessToken);
    url.searchParams.set('access_token', appAccessToken);

    const response = await this.fetchImpl(url, { method: 'GET' });
    const body = (await response.json().catch(() => ({}))) as {
      data?: {
        is_valid?: boolean;
        app_id?: string;
        user_id?: string;
        expires_at?: number;
        scopes?: string[];
      };
      error?: { message?: string; code?: number };
    };

    if (!response.ok || !body.data) {
      return {
        isValid: false,
        appId: null,
        userIdPresent: false,
        expiresAt: null,
        scopes: [],
      };
    }

    return {
      isValid: Boolean(body.data.is_valid),
      appId: body.data.app_id ?? null,
      userIdPresent: Boolean(body.data.user_id),
      expiresAt: typeof body.data.expires_at === 'number' ? body.data.expires_at : null,
      scopes: body.data.scopes ?? [],
    };
  }

  /**
   * Fetches managed Pages from Meta, following pagination. Returns every provider
   * row — callers must not treat an empty mapped list as "no Pages" without
   * checking rawRowCount and provider errors.
   */
  async discoverPages(userAccessToken: string): Promise<{
    rows: RawFacebookAccountRow[];
    httpStatus: number;
    pagingPageCount: number;
    hasPaging: boolean;
    providerError: {
      code: number | null;
      subcode: number | null;
      type: string | null;
      message: string;
    } | null;
  }> {
    const rows: RawFacebookAccountRow[] = [];
    let pagingPageCount = 0;
    let hasPaging = false;
    let httpStatus = 200;
    let providerError: {
      code: number | null;
      subcode: number | null;
      type: string | null;
      message: string;
    } | null = null;

    let absoluteNextUrl: string | null = null;

    while (true) {
      pagingPageCount += 1;
      let body: {
        data?: RawFacebookAccountRow[];
        paging?: { next?: string };
      };

      try {
        if (absoluteNextUrl) {
          const fetched = await this.fetchGraphJson<typeof body>(absoluteNextUrl);
          body = fetched.body;
          httpStatus = fetched.httpStatus;
        } else {
          body = await this.request<typeof body>(FACEBOOK_PAGE_LIST_ENDPOINT, {
            accessToken: userAccessToken,
            searchParams: {
              fields: FACEBOOK_PAGE_LIST_FIELDS,
              limit: 100,
            },
          });
          httpStatus = 200;
        }
      } catch (error) {
        if (error instanceof FacebookGraphError) {
          providerError = {
            code: error.graphCode,
            subcode: error.graphSubcode,
            type: error.kind,
            message: error.message,
          };
          httpStatus = error.httpStatus ?? 502;
        } else {
          providerError = {
            code: null,
            subcode: null,
            type: 'unknown',
            message: error instanceof Error ? error.message : 'Unknown Facebook error.',
          };
          httpStatus = 502;
        }
        break;
      }

      rows.push(...(body.data ?? []));

      if (body.paging?.next) {
        hasPaging = true;
        absoluteNextUrl = body.paging.next;
        continue;
      }

      break;
    }

    return { rows, httpStatus, pagingPageCount, hasPaging, providerError };
  }

  /** Best-effort Page token lookup when /me/accounts omits access_token. */
  async tryResolvePageAccessToken(
    pageId: string,
    userAccessToken: string,
  ): Promise<string | null> {
    const result = await this.lookupPageDirect(pageId, userAccessToken);
    return result.raw?.access_token ?? null;
  }

  /**
   * Meta documented specific-Page lookup: GET /{page-id}?fields=id,name,access_token,tasks.
   * Returns provider metadata for sanitized diagnosis; raw.access_token is for server-side use only.
   */
  async lookupPageDirect(
    pageId: string,
    userAccessToken: string,
  ): Promise<{
    raw: FacebookDirectPageLookupRaw | null;
    httpStatus: number;
    providerError: {
      code: number | null;
      subcode: number | null;
      type: string | null;
      message: string;
    } | null;
  }> {
    try {
      const body = await this.request<FacebookDirectPageLookupRaw>(`/${pageId}`, {
        accessToken: userAccessToken,
        searchParams: { fields: FACEBOOK_DIRECT_PAGE_LOOKUP_FIELDS },
      });
      return { raw: body, httpStatus: 200, providerError: null };
    } catch (error) {
      if (error instanceof FacebookGraphError) {
        return {
          raw: null,
          httpStatus: error.httpStatus ?? 502,
          providerError: {
            code: error.graphCode,
            subcode: error.graphSubcode,
            type: error.kind,
            message: error.message,
          },
        };
      }
      return {
        raw: null,
        httpStatus: 502,
        providerError: {
          code: null,
          subcode: null,
          type: 'unknown',
          message: error instanceof Error ? error.message : 'Unknown Facebook error.',
        },
      };
    }
  }

  /** Returns only Pages with usable tokens — used for server-side selection validation. */
  async listPages(userAccessToken: string): Promise<FacebookPageSummary[]> {
    const discovery = await this.discoverPages(userAccessToken);
    const summaries: FacebookPageSummary[] = [];

    for (const page of discovery.rows) {
      if (!page.id || !page.name) continue;
      let token = page.access_token ?? null;
      if (!token) {
        token = await this.tryResolvePageAccessToken(page.id, userAccessToken);
      }
      if (!token) continue;
      summaries.push({
        id: page.id,
        name: page.name,
        category: page.category ?? null,
        accessToken: token,
        tasks: page.tasks ?? [],
      });
    }

    return summaries;
  }

  /** The real request that proves the connection works. */
  async verifyPage(
    pageId: string,
    pageAccessToken: string,
  ): Promise<{ id: string; name: string; link: string | null; category: string | null }> {
    const body = await this.request<{
      id?: string;
      name?: string;
      link?: string;
      category?: string;
    }>(`/${pageId}`, {
      accessToken: pageAccessToken,
      searchParams: { fields: 'id,name,link,category' },
    });

    if (!body.id) {
      throw new FacebookGraphError('unknown', 'Facebook returned no Page id for this request.');
    }

    return {
      id: body.id,
      name: body.name ?? '',
      link: body.link ?? null,
      category: body.category ?? null,
    };
  }

  async publishPost(input: {
    pageId: string;
    pageAccessToken: string;
    message: string;
    link?: string | null;
    /** Unix seconds. Facebook creates the post unpublished until this time. */
    scheduledPublishTime?: number | null;
    attachedMediaIds?: string[];
  }): Promise<FacebookPublishedPost> {
    const body: Record<string, string | number | boolean | undefined> = {
      message: input.message,
    };
    if (input.link) body.link = input.link;
    if (input.scheduledPublishTime) {
      body.published = false;
      body.scheduled_publish_time = input.scheduledPublishTime;
    }
    input.attachedMediaIds?.forEach((mediaId, index) => {
      body[`attached_media[${index}]`] = JSON.stringify({ media_fbid: mediaId });
    });

    const response = await this.request<{ id?: string; post_id?: string }>(
      `/${input.pageId}/feed`,
      { method: 'POST', accessToken: input.pageAccessToken, body },
    );

    const postId = response.post_id ?? response.id;
    if (!postId) {
      throw new FacebookGraphError(
        'unknown',
        'Facebook accepted the request but returned no post id, so publication cannot be confirmed.',
      );
    }
    return { postId };
  }

  /** Uploads a photo unpublished so it can be attached to a feed post. */
  async uploadPhoto(input: {
    pageId: string;
    pageAccessToken: string;
    imageUrl: string;
  }): Promise<{ mediaId: string }> {
    const response = await this.request<{ id?: string }>(`/${input.pageId}/photos`, {
      method: 'POST',
      accessToken: input.pageAccessToken,
      body: { url: input.imageUrl, published: false },
    });
    if (!response.id) {
      throw new FacebookGraphError('unknown', 'Facebook returned no photo id for the upload.');
    }
    return { mediaId: response.id };
  }

  async deleteScheduledPost(postId: string, pageAccessToken: string): Promise<void> {
    await this.request<unknown>(`/${postId}`, { method: 'DELETE', accessToken: pageAccessToken });
  }

  async listPostComments(input: {
    postId: string;
    pageAccessToken: string;
    since?: number;
    limit?: number;
  }): Promise<FacebookCommentPayload[]> {
    const body = await this.request<{
      data?: Array<{
        id?: string;
        message?: string;
        created_time?: string;
        from?: { name?: string; id?: string };
        parent?: { id?: string };
      }>;
    }>(`/${input.postId}/comments`, {
      accessToken: input.pageAccessToken,
      searchParams: {
        fields: 'id,message,created_time,from,parent',
        limit: input.limit ?? 100,
        since: input.since,
        filter: 'stream',
      },
    });

    return (body.data ?? [])
      .filter((comment) => comment.id)
      .map((comment) => ({
        id: comment.id as string,
        message: comment.message ?? '',
        createdTime: comment.created_time ?? null,
        fromName: comment.from?.name ?? null,
        fromId: comment.from?.id ?? null,
        parentId: comment.parent?.id ?? null,
      }));
  }

  async replyToComment(input: {
    commentId: string;
    pageAccessToken: string;
    message: string;
  }): Promise<{ replyId: string }> {
    const response = await this.request<{ id?: string }>(`/${input.commentId}/comments`, {
      method: 'POST',
      accessToken: input.pageAccessToken,
      body: { message: input.message },
    });
    if (!response.id) {
      throw new FacebookGraphError('unknown', 'Facebook returned no id for the posted reply.');
    }
    return { replyId: response.id };
  }

  async listPagePosts(input: {
    pageId: string;
    pageAccessToken: string;
    limit?: number;
  }): Promise<Array<{ id: string; createdTime: string | null; message: string | null }>> {
    const body = await this.request<{
      data?: Array<{ id?: string; created_time?: string; message?: string }>;
    }>(`/${input.pageId}/published_posts`, {
      accessToken: input.pageAccessToken,
      searchParams: { fields: 'id,created_time,message', limit: input.limit ?? 50 },
    });

    return (body.data ?? [])
      .filter((post) => post.id)
      .map((post) => ({
        id: post.id as string,
        createdTime: post.created_time ?? null,
        message: post.message ?? null,
      }));
  }

  async getLeadgenLead(leadId: string, pageAccessToken: string): Promise<FacebookLeadPayload> {
    const body = await this.request<{
      id?: string;
      form_id?: string;
      created_time?: string;
      field_data?: Array<{ name?: string; values?: string[] }>;
    }>(`/${leadId}`, {
      accessToken: pageAccessToken,
      searchParams: { fields: 'id,form_id,created_time,field_data' },
    });

    const fields: Record<string, string> = {};
    for (const field of body.field_data ?? []) {
      if (field.name && field.values?.[0]) fields[field.name] = field.values[0];
    }

    return {
      id: body.id ?? leadId,
      formId: body.form_id ?? null,
      createdTime: body.created_time ?? null,
      fields,
    };
  }

  async getPostInsights(input: {
    postId: string;
    pageAccessToken: string;
    metrics: string[];
  }): Promise<FacebookInsightPayload[]> {
    const body = await this.request<{
      data?: Array<{
        name?: string;
        values?: Array<{ value?: unknown; end_time?: string }>;
      }>;
    }>(`/${input.postId}/insights`, {
      accessToken: input.pageAccessToken,
      searchParams: { metric: input.metrics.join(',') },
    });

    const results: FacebookInsightPayload[] = [];
    for (const metric of body.data ?? []) {
      if (!metric.name) continue;
      for (const entry of metric.values ?? []) {
        // Facebook returns breakdown objects for some metrics; only plain
        // numeric values are recorded rather than guessing at a total.
        if (typeof entry.value !== 'number') continue;
        results.push({
          name: metric.name,
          value: entry.value,
          periodStart: null,
          periodEnd: entry.end_time ?? null,
        });
      }
    }
    return results;
  }

  /** Subscribes the Page to the webhook fields TITAN consumes. */
  async subscribePageWebhooks(input: {
    pageId: string;
    pageAccessToken: string;
    fields: string[];
  }): Promise<void> {
    await this.request<unknown>(`/${input.pageId}/subscribed_apps`, {
      method: 'POST',
      accessToken: input.pageAccessToken,
      body: { subscribed_fields: input.fields.join(',') },
    });
  }

  /** Best-effort revocation so a disconnect also ends the grant on Meta's side. */
  async revokePermissions(userAccessToken: string): Promise<void> {
    await this.request<unknown>('/me/permissions', {
      method: 'DELETE',
      accessToken: userAccessToken,
    });
  }
}

/**
 * Validates Meta's `X-Hub-Signature-256` header.
 *
 * An unsigned or wrongly signed payload is rejected outright — anyone can POST
 * to a public webhook URL, and a forged lead or comment would otherwise flow
 * straight into the CRM.
 */
export function verifyFacebookWebhookSignature(input: {
  rawBody: Buffer | string;
  signatureHeader: string | undefined;
  appSecret: string;
}): boolean {
  if (!input.signatureHeader?.startsWith('sha256=')) return false;

  const provided = input.signatureHeader.slice('sha256='.length);
  const expected = createHmac('sha256', input.appSecret)
    .update(input.rawBody)
    .digest('hex');

  const providedBuffer = Buffer.from(provided, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}
