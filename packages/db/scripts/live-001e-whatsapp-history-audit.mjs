/**
 * LIVE-001E — Read-only WhatsApp history + connection identity audit (staging only).
 *
 * NEVER production (rshuiaghmtrvvilhqpwm). SELECT only — no UPDATE/DELETE/INSERT.
 * Masks phone numbers and provider IDs in output.
 *
 * Usage (Owner / staging secrets holder):
 *   DATABASE_URL=... node packages/db/scripts/live-001e-whatsapp-history-audit.mjs
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';

function maskPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length <= 4) return `***${digits}`;
  return `${digits.slice(0, 2)}******${digits.slice(-4)}`;
}

function maskId(value) {
  const s = String(value ?? '');
  if (!s) return null;
  if (s.length <= 8) return `${s.slice(0, 2)}…${s.slice(-2)}`;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}
if (baseUrl.toLowerCase().includes(FORBIDDEN)) {
  console.error('Refusing forbidden production ref');
  process.exit(3);
}
if (!baseUrl.toLowerCase().includes(STAGING_REF)) {
  console.error(`Refusing: expected staging ref ${STAGING_REF}`);
  process.exit(3);
}

const sql = postgres(baseUrl, { max: 1, onnotice: () => {} });

async function main() {
  const connections = await sql`
    SELECT
      wc.id,
      wc.company_id,
      c.name AS company_name,
      wc.status,
      wc.phone_number_id,
      wc.business_account_id,
      wc.display_phone_number,
      wc.connected_at,
      wc.updated_at,
      wc.last_error
    FROM whatsapp_connections wc
    JOIN companies c ON c.id = wc.company_id
    ORDER BY wc.updated_at DESC
  `;

  const [msgAgg] = await sql`
    SELECT
      count(*)::int AS message_count,
      count(*) FILTER (WHERE external_message_id IS NOT NULL)::int AS with_external_id,
      count(*) FILTER (WHERE external_message_id IS NULL)::int AS without_external_id,
      count(*) FILTER (WHERE customer_id IS NOT NULL)::int AS with_customer,
      count(*) FILTER (WHERE customer_id IS NULL)::int AS without_customer,
      count(*) FILTER (WHERE direction = 'incoming')::int AS inbound_count,
      count(*) FILTER (WHERE direction = 'outgoing')::int AS outbound_count,
      min(created_at) AS oldest_created_at,
      max(created_at) AS newest_created_at,
      min(delivered_at) AS oldest_delivered_at,
      max(delivered_at) AS newest_delivered_at
    FROM whatsapp_messages
  `;

  const companyScopes = await sql`
    SELECT
      wm.company_id,
      c.name AS company_name,
      count(*)::int AS message_count,
      count(DISTINCT wm.customer_id)::int AS distinct_customers
    FROM whatsapp_messages wm
    JOIN companies c ON c.id = wm.company_id
    GROUP BY wm.company_id, c.name
    ORDER BY message_count DESC
  `;

  const duplicateExternalIds = await sql`
    SELECT company_id, external_message_id, count(*)::int AS n
    FROM whatsapp_messages
    WHERE external_message_id IS NOT NULL
    GROUP BY company_id, external_message_id
    HAVING count(*) > 1
    ORDER BY n DESC
    LIMIT 50
  `;

  const hubDupes = await sql`
    SELECT company_id, account_kind, external_message_id, count(*)::int AS n
    FROM comm_platform_inbox_index
    WHERE external_message_id IS NOT NULL
      AND account_kind = 'business_whatsapp'
    GROUP BY company_id, account_kind, external_message_id
    HAVING count(*) > 1
    ORDER BY n DESC
    LIMIT 50
  `;

  const hubAgg = await sql`
    SELECT
      count(*)::int AS inbox_rows,
      count(DISTINCT external_thread_id)::int AS distinct_threads,
      count(*) FILTER (WHERE link_target_type IS NOT NULL)::int AS with_link,
      count(*) FILTER (WHERE link_target_type IS NULL)::int AS without_link,
      count(*) FILTER (WHERE assigned_job_id IS NOT NULL)::int AS with_job,
      count(*) FILTER (WHERE unread)::int AS unread_rows,
      min(occurred_at) AS oldest_occurred_at,
      max(occurred_at) AS newest_occurred_at
    FROM comm_platform_inbox_index
    WHERE account_kind = 'business_whatsapp'
  `;

  // Conversations ≈ distinct hub threads, else distinct customer_id (+ unmatched)
  const [conversationEstimate] = await sql`
    SELECT
      COALESCE(
        (SELECT count(DISTINCT external_thread_id)::int
         FROM comm_platform_inbox_index
         WHERE account_kind = 'business_whatsapp'
           AND external_thread_id IS NOT NULL),
        0
      ) AS hub_thread_conversations,
      COALESCE(
        (SELECT count(DISTINCT customer_id)::int
         FROM whatsapp_messages
         WHERE customer_id IS NOT NULL),
        0
      ) AS customer_linked_conversations,
      COALESCE(
        (SELECT count(*)::int
         FROM whatsapp_messages
         WHERE customer_id IS NULL AND direction = 'incoming'),
        0
      ) AS unmatched_inbound_messages
  `;

  const orphanedMessages = await sql`
    SELECT wm.id, wm.company_id, wm.customer_id, wm.created_at
    FROM whatsapp_messages wm
    LEFT JOIN companies c ON c.id = wm.company_id
    WHERE c.id IS NULL
    LIMIT 20
  `;

  const malformed = await sql`
    SELECT id, company_id, direction, delivery_status, created_at
    FROM whatsapp_messages
    WHERE message_content IS NULL
       OR btrim(message_content) = ''
       OR direction IS NULL
       OR company_id IS NULL
    LIMIT 50
  `;

  const customerLinkSample = await sql`
    SELECT
      count(*) FILTER (
        WHERE wm.customer_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM customers cu
            WHERE cu.id = wm.customer_id AND cu.company_id = wm.company_id
          )
      )::int AS messages_valid_customer_link,
      count(*) FILTER (
        WHERE wm.customer_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM customers cu
            WHERE cu.id = wm.customer_id AND cu.company_id = wm.company_id
          )
      )::int AS messages_broken_customer_link
    FROM whatsapp_messages wm
  `;

  const jobLinks = await sql`
    SELECT count(*)::int AS hub_rows_with_job
    FROM comm_platform_inbox_index
    WHERE account_kind = 'business_whatsapp'
      AND assigned_job_id IS NOT NULL
  `;

  const uniqueIndexPresent = await sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'whatsapp_messages_company_external_uidx',
        'comm_platform_inbox_company_kind_external_uidx'
      )
    ORDER BY indexname
  `;

  const activeConnection = connections.find((c) => c.status === 'connected') ?? connections[0];

  const output = {
    label: 'LIVE-001E',
    title: 'WhatsApp history + inbound integrity audit (read-only)',
    generatedAt: new Date().toISOString(),
    stagingRef: STAGING_REF,
    readOnly: true,
    productionAccessed: false,
    historicalMessagesDeleted: 0,
    historicalMessagesModified: 0,
    connections: connections.map((c) => ({
      companyName: c.company_name,
      status: c.status,
      phoneNumberIdMasked: maskId(c.phone_number_id),
      businessAccountIdMasked: maskId(c.business_account_id),
      displayPhoneNumberMasked: maskPhone(c.display_phone_number),
      connectedAt: c.connected_at,
      updatedAt: c.updated_at,
      hasLastError: Boolean(c.last_error),
    })),
    activeConnectionIdentity: activeConnection
      ? {
          companyName: activeConnection.company_name,
          status: activeConnection.status,
          phoneNumberIdMasked: maskId(activeConnection.phone_number_id),
          displayPhoneNumberMasked: maskPhone(activeConnection.display_phone_number),
          note:
            'whatsapp_messages rows do not store business phone_number_id; historical vs current number cannot be proven from message rows alone. Compare connection display/phoneNumberId (masked) to Meta verified_name from Test Connection (e.g. Test Number).',
        }
      : null,
    messages: {
      messageCount: msgAgg?.message_count ?? 0,
      withExternalMessageId: msgAgg?.with_external_id ?? 0,
      withoutExternalMessageId: msgAgg?.without_external_id ?? 0,
      withCustomer: msgAgg?.with_customer ?? 0,
      withoutCustomer: msgAgg?.without_customer ?? 0,
      inboundCount: msgAgg?.inbound_count ?? 0,
      outboundCount: msgAgg?.outbound_count ?? 0,
      oldestCreatedAt: msgAgg?.oldest_created_at ?? null,
      newestCreatedAt: msgAgg?.newest_created_at ?? null,
      oldestDeliveredAt: msgAgg?.oldest_delivered_at ?? null,
      newestDeliveredAt: msgAgg?.newest_delivered_at ?? null,
      externalIdCoveragePct:
        (msgAgg?.message_count ?? 0) > 0
          ? Math.round(((msgAgg?.with_external_id ?? 0) / msgAgg.message_count) * 1000) / 10
          : null,
    },
    conversations: {
      hubThreadConversations: conversationEstimate?.hub_thread_conversations ?? 0,
      customerLinkedConversations: conversationEstimate?.customer_linked_conversations ?? 0,
      unmatchedInboundMessages: conversationEstimate?.unmatched_inbound_messages ?? 0,
      note: 'Hub threads preferred for conversation cards; messages fallback groups by customer_id.',
    },
    duplicates: {
      whatsappMessageExternalIdGroups: duplicateExternalIds.length,
      whatsappMessageDuplicateSamples: duplicateExternalIds.slice(0, 10).map((d) => ({
        companyIdMasked: maskId(d.company_id),
        externalMessageIdMasked: maskId(d.external_message_id),
        count: d.n,
      })),
      hubInboxExternalIdGroups: hubDupes.length,
      hubDuplicateSamples: hubDupes.slice(0, 10).map((d) => ({
        companyIdMasked: maskId(d.company_id),
        accountKind: d.account_kind,
        externalMessageIdMasked: maskId(d.external_message_id),
        count: d.n,
      })),
      historicalDuplicatesNotAutoCleaned: true,
    },
    hub: {
      inboxRows: hubAgg[0]?.inbox_rows ?? 0,
      distinctThreads: hubAgg[0]?.distinct_threads ?? 0,
      withLink: hubAgg[0]?.with_link ?? 0,
      withoutLink: hubAgg[0]?.without_link ?? 0,
      withJob: hubAgg[0]?.with_job ?? jobLinks[0]?.hub_rows_with_job ?? 0,
      unreadRows: hubAgg[0]?.unread_rows ?? 0,
      oldestOccurredAt: hubAgg[0]?.oldest_occurred_at ?? null,
      newestOccurredAt: hubAgg[0]?.newest_occurred_at ?? null,
    },
    linkage: {
      messagesValidCustomerLink: customerLinkSample[0]?.messages_valid_customer_link ?? 0,
      messagesBrokenCustomerLink: customerLinkSample[0]?.messages_broken_customer_link ?? 0,
      hubRowsWithJob: jobLinks[0]?.hub_rows_with_job ?? 0,
      inventCustomerMatches: false,
    },
    tenantScope: companyScopes.map((r) => ({
      companyName: r.company_name,
      messageCount: r.message_count,
      distinctCustomers: r.distinct_customers,
    })),
    orphanedMessages: orphanedMessages.length,
    malformedMessageRecords: malformed.length,
    idempotencyIndexesPresent: uniqueIndexPresent.map((r) => r.indexname),
    safety: {
      productionTouched: 0,
      historicalMessagesDeleted: 0,
      historicalMessagesModified: 0,
      writesExecuted: 0,
    },
  };

  const outDir = path.resolve(__dirname, '../../../diagnostic-output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'live-001e-whatsapp-history-audit.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ wrote: outPath, summary: {
    messages: output.messages.messageCount,
    hubThreads: output.conversations.hubThreadConversations,
    duplicateGroups: output.duplicates.whatsappMessageExternalIdGroups,
    indexes: output.idempotencyIndexesPresent,
  } }, null, 2));

  await sql.end({ timeout: 5 });
}

main().catch(async (err) => {
  console.error(err);
  try {
    await sql.end({ timeout: 1 });
  } catch {
    /* ignore */
  }
  process.exit(1);
});
