import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(url);
const tables = await sql`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename LIKE 'security_%'
  ORDER BY tablename
`;
console.log('Security tables:', tables.map((t) => t.tablename).join(', ') || '(none)');
const hasLoginEvents = tables.some((t) => t.tablename === 'security_login_events');
console.log('security_login_events exists:', hasLoginEvents);
await sql.end();
process.exit(hasLoginEvents ? 0 : 1);
