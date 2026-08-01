import type { DatabaseClient } from '@titan/db';
import { integrationConnections } from '@titan/db';
import { and, eq } from 'drizzle-orm';

export type TravelTimeRequest = {
  companyId: string;
  fromJobId?: string | null;
  toJobId?: string | null;
  defaultMinutes: number;
};

export type TravelTimeResult = {
  minutes: number;
  source: 'default' | 'cartrack';
  cartrackConnected: boolean;
};

/**
 * CAL-001 — travel time interface. Returns configurable default until Cartrack routing is connected.
 * Never claims live Cartrack ETA unless a connected integration exists.
 */
export class TravelTimeService {
  constructor(private readonly db: DatabaseClient) {}

  async isCartrackConnected(companyId: string): Promise<boolean> {
    const row = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.companyId, companyId),
        eq(integrationConnections.provider, 'cartrack'),
        eq(integrationConnections.status, 'connected'),
      ),
      columns: { id: true },
    });
    return Boolean(row);
  }

  async estimateTravelMinutes(input: TravelTimeRequest): Promise<TravelTimeResult> {
    const cartrackConnected = await this.isCartrackConnected(input.companyId);

    if (cartrackConnected) {
      // Stub: connected but routing API not wired in CAL-001 — still use default with honest source label.
      return {
        minutes: input.defaultMinutes,
        source: 'default',
        cartrackConnected: true,
      };
    }

    return {
      minutes: input.defaultMinutes,
      source: 'default',
      cartrackConnected: false,
    };
  }
}
