import dns from 'node:dns';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';
import {
  buildPostgresClientOptions,
  sanitizeDbError,
  summarizeDatabaseUrl,
} from './connection-options.js';

export {
  buildPostgresClientOptions,
  sanitizeDbError,
  summarizeDatabaseUrl,
  type DbEndpointSummary,
} from './connection-options.js';

/** Prefer IPv4 for hosted platforms (e.g. Railway) that cannot reach Supabase IPv6. */
export function preferIpv4DnsOrder(): void {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {
    // Older Node runtimes may not support this API.
  }
}

/** Headroom below Supabase session-mode pool limits (typically 15). */
const DEFAULT_POOL_MAX = 8;

let sharedClient: postgres.Sql | null = null;
let sharedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sharedConnectionString: string | null = null;

export type DbQueryLogEvent = {
  query: string;
  paramCount: number;
};

let queryLogHandler: ((event: DbQueryLogEvent) => void) | null = null;

/** Development-only query observer; never log parameter values. */
export function setDbQueryLogHandler(handler: ((event: DbQueryLogEvent) => void) | null) {
  queryLogHandler = handler;
}

function createDbLogger() {
  return {
    logQuery(query: string, params: unknown[]) {
      queryLogHandler?.({ query, paramCount: params.length });
    },
  };
}

export type DatabaseClient = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  if (sharedDb && sharedClient && sharedConnectionString === connectionString) {
    return sharedDb;
  }

  if (sharedClient) {
    void closeDb();
  }

  preferIpv4DnsOrder();

  const options = buildPostgresClientOptions(connectionString);
  options.max = DEFAULT_POOL_MAX;

  sharedConnectionString = connectionString;
  sharedClient = postgres(connectionString, options);
  sharedDb = drizzle(sharedClient, {
    schema,
    logger: queryLogHandler ? createDbLogger() : undefined,
  });
  return sharedDb;
}

export async function pingDb(): Promise<boolean> {
  const result = await probeDbConnection();
  return result.ok;
}

export type DbProbeResult =
  | { ok: true; endpoint: ReturnType<typeof summarizeDatabaseUrl> }
  | {
      ok: false;
      endpoint: ReturnType<typeof summarizeDatabaseUrl>;
      code: string;
      message: string;
    };

/** Probe the shared pool (creating it if needed). Never returns secrets. */
export async function probeDbConnection(connectionString?: string): Promise<DbProbeResult> {
  const url = connectionString ?? sharedConnectionString ?? '';
  const endpoint = summarizeDatabaseUrl(url || 'postgres://invalid');

  if (!url) {
    return {
      ok: false,
      endpoint,
      code: 'NOT_CONFIGURED',
      message: 'DATABASE_URL is not configured',
    };
  }

  try {
    createDb(url);
    if (!sharedClient) {
      return {
        ok: false,
        endpoint,
        code: 'CLIENT_MISSING',
        message: 'Database client was not initialized',
      };
    }
    await sharedClient`SELECT 1`;
    return { ok: true, endpoint };
  } catch (error) {
    const sanitized = sanitizeDbError(error);
    return {
      ok: false,
      endpoint,
      code: sanitized.code,
      message: sanitized.message,
    };
  }
}

/** Reuses the shared application pool — does not open a separate client. */
export async function checkDbConnection(connectionString: string): Promise<boolean> {
  const result = await probeDbConnection(connectionString);
  return result.ok;
}

export async function closeDb(): Promise<void> {
  if (sharedClient) {
    try {
      await sharedClient.end({ timeout: 5 });
    } catch {
      // Ignore shutdown errors during hot reload.
    }
    sharedClient = null;
    sharedDb = null;
    sharedConnectionString = null;
  }
}

export * from './schema/index.js';

export { drizzle } from 'drizzle-orm/postgres-js';
