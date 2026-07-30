import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const email = process.argv[2] ?? '';
const sql = postgres(url);

if (email) {
  const events = await sql`
    SELECT sle.event_type, sle.occurred_at, u.email
    FROM security_login_events sle
    LEFT JOIN users u ON u.id = sle.user_id
    WHERE u.email = ${email}
    ORDER BY sle.occurred_at DESC
    LIMIT 5
  `;
  console.log('Recent security login events for', email, ':', events);
} else {
  const count = await sql`SELECT count(*)::int as c FROM security_login_events`;
  console.log('Total security_login_events rows:', count[0].c);
}

await sql.end();
