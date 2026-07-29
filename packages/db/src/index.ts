import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

export type DatabaseClient = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema });
}

export * from './schema/index.js';

export async function checkDbConnection(connectionString: string): Promise<boolean> {
  const client = postgres(connectionString, { max: 1 });
  try {
    await client`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.end();
  }
}

export { drizzle } from 'drizzle-orm/postgres-js';
