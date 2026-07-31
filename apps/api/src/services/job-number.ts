import { eq, sql } from 'drizzle-orm';
import { formatJobNumber } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { jobNumberCounters } from '@titan/db';

type Tx = Parameters<Parameters<DatabaseClient['transaction']>[0]>[0];

export async function allocateJobNumber(tx: Tx, companyId: string): Promise<string> {
  await tx
    .insert(jobNumberCounters)
    .values({ companyId, lastValue: 0 })
    .onConflictDoNothing({ target: jobNumberCounters.companyId });

  const [counter] = await tx
    .update(jobNumberCounters)
    .set({
      lastValue: sql`${jobNumberCounters.lastValue} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(jobNumberCounters.companyId, companyId))
    .returning();

  if (!counter) {
    throw new Error('Unable to allocate job number');
  }

  return formatJobNumber(counter.lastValue);
}
