import type postgres from 'postgres';

export type DbEndpointSummary = {
  host: string;
  port: number;
  database: string;
  sslmode: string | null;
  isSupabaseDirect: boolean;
  isSupabasePooler: boolean;
  isPrivateHost: boolean;
};

/** Redacted connection endpoint facts for logs (never includes credentials). */
export function summarizeDatabaseUrl(connectionString: string): DbEndpointSummary {
  try {
    const normalized = connectionString.replace(/^postgres(ql)?:/i, 'http:');
    const url = new URL(normalized);
    const host = url.hostname || '(unknown)';
    const port = Number(url.port || 5432);
    const database = (url.pathname || '/').replace(/^\//, '') || 'postgres';
    const sslmode = url.searchParams.get('sslmode');
    const isSupabaseDirect = /^db\.[a-z0-9-]+\.supabase\.co$/i.test(host);
    const isSupabasePooler = host.includes('pooler.supabase.com');
    const isPrivateHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.railway.internal') ||
      host.endsWith('.local');

    return {
      host,
      port,
      database,
      sslmode,
      isSupabaseDirect,
      isSupabasePooler,
      isPrivateHost,
    };
  } catch {
    return {
      host: '(unparseable)',
      port: 0,
      database: '(unknown)',
      sslmode: null,
      isSupabaseDirect: false,
      isSupabasePooler: false,
      isPrivateHost: false,
    };
  }
}

/**
 * Client options for hosted Postgres (Supabase/Railway).
 * - Public/hosted hosts: require TLS
 * - Supabase pooler (esp. transaction mode :6543): disable prepared statements
 */
export function buildPostgresClientOptions(
  connectionString: string,
): postgres.Options<Record<string, never>> {
  const endpoint = summarizeDatabaseUrl(connectionString);
  const options: postgres.Options<Record<string, never>> = {
    max: 8,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  };

  const wantsSsl =
    !endpoint.isPrivateHost &&
    (endpoint.isSupabaseDirect ||
      endpoint.isSupabasePooler ||
      endpoint.sslmode === 'require' ||
      endpoint.sslmode === 'verify-full' ||
      endpoint.sslmode === 'verify-ca' ||
      process.env.NODE_ENV === 'production');

  if (wantsSsl) {
    options.ssl = 'require';
  }

  // Transaction pooler and Supavisor generally reject prepared statements.
  if (endpoint.isSupabasePooler || endpoint.port === 6543) {
    options.prepare = false;
  }

  return options;
}

export function sanitizeDbError(error: unknown): { code: string; message: string } {
  const err = error as { code?: unknown; message?: unknown; name?: unknown };
  const rawMessage = typeof err?.message === 'string' ? err.message : String(error);
  const code =
    typeof err?.code === 'string' && err.code.trim().length > 0
      ? err.code
      : typeof err?.name === 'string' && err.name.trim().length > 0
        ? err.name
        : 'DB_ERROR';

  const message = rawMessage
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/password=[^&\s]+/gi, 'password=[REDACTED]')
    .replace(/:[^:@/\s]+@/g, ':[REDACTED]@')
    .slice(0, 400);

  return { code, message };
}
