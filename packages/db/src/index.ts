import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

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

  sharedConnectionString = connectionString;
  sharedClient = postgres(connectionString, {
    max: DEFAULT_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  sharedDb = drizzle(sharedClient, {
    schema,
    logger: queryLogHandler ? createDbLogger() : undefined,
  });
  return sharedDb;
}

export async function pingDb(): Promise<boolean> {
  if (!sharedClient) {
    return false;
  }

  try {
    await sharedClient`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Reuses the shared application pool — does not open a separate client. */
export async function checkDbConnection(connectionString: string): Promise<boolean> {
  if (!sharedClient) {
    createDb(connectionString);
  }

  return pingDb();
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
