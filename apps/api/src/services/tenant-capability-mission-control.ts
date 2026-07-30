import type { MissionControlModuleSnapshot } from '@titan/shared';

type CapabilityRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  healthState: { status?: string } | null;
};

export function listMissionControlSnapshots(rows: CapabilityRow[]): MissionControlModuleSnapshot[] {
  const snapshots: MissionControlModuleSnapshot[] = [];

  for (const row of rows) {
    if (row.status === 'archived' || row.status === 'draft' || row.status === 'active') {
      continue;
    }

    const healthStatus = row.healthState?.status;
    const needsAttention =
      row.status === 'attention_required' ||
      row.status === 'failed_deployment' ||
      row.status === 'awaiting_approval' ||
      row.status === 'disabled' ||
      row.status === 'testing' ||
      healthStatus === 'attention_required' ||
      healthStatus === 'critical' ||
      healthStatus === 'offline' ||
      healthStatus === 'failed';

    if (!needsAttention) {
      continue;
    }

    snapshots.push({
      module: `tenant_capability:${row.slug}`,
      status: mapCapabilityMissionControlStatus(row.status, healthStatus),
      summary: `${row.name} requires attention (${row.status.replace(/_/g, ' ')})`,
      metrics: {
        kind: 'tenant_capability',
        capabilityId: row.id,
        capabilityName: row.name,
        capabilityStatus: row.status,
        healthStatus: healthStatus ?? row.status,
        manageHref: `/aura/capabilities/${row.id}`,
      },
    });
  }

  return snapshots;
}

function mapCapabilityMissionControlStatus(status: string, healthStatus?: string): string {
  if (status === 'failed_deployment' || healthStatus === 'failed' || healthStatus === 'critical') {
    return 'critical';
  }
  if (
    status === 'attention_required' ||
    status === 'disabled' ||
    healthStatus === 'attention_required' ||
    healthStatus === 'offline'
  ) {
    return 'attention_required';
  }
  if (status === 'awaiting_approval') {
    return 'attention_required';
  }
  if (status === 'testing') {
    return 'syncing';
  }
  return 'attention_required';
}
