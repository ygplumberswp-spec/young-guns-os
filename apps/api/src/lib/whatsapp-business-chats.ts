/**
 * Group Business WhatsApp hub index rows into one chat per phone/thread.
 * Latest message wins for preview/unread.
 */
export function groupBusinessWhatsappIndexRows<
  T extends {
    id: string;
    externalThreadId: string | null;
    occurredAt: Date;
    metadata: Record<string, unknown> | null;
  },
>(rows: T[]): T[] {
  const byThread = new Map<string, T>();
  for (const row of rows) {
    const metaPhone =
      typeof row.metadata?.contactPhone === 'string' ? row.metadata.contactPhone : null;
    const threadKey = row.externalThreadId || metaPhone || row.id;
    const existing = byThread.get(threadKey);
    if (!existing || row.occurredAt > existing.occurredAt) {
      byThread.set(threadKey, row);
    }
  }
  return [...byThread.values()].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );
}

/**
 * Group raw whatsapp_messages into chats by customer (unmatched stay one-per-message).
 */
export function groupBusinessWhatsappMessagesByCustomer<
  T extends { id: string; customerId: string | null; createdAt: Date },
>(messages: T[]): Array<{ key: string; latest: T }> {
  const byKey = new Map<string, T>();
  for (const message of messages) {
    const key = message.customerId ? `customer:${message.customerId}` : `msg:${message.id}`;
    if (!byKey.has(key)) {
      byKey.set(key, message);
    }
  }
  return [...byKey.entries()].map(([key, latest]) => ({ key, latest }));
}
