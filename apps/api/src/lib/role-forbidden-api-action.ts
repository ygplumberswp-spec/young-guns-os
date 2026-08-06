import {
  hasAnyPermission,
  hasUnrestrictedCompanyAccess,
  isPlatformOwnerRole,
  isTechnicianRole,
  type StaffIdentity,
} from '@titan/auth';

/**
 * Pilot-critical API actions mirrored from route `requireAnyPermission` wiring.
 * Used for automated forbidden-action matrix tests (Phase 2 / FRZ-001).
 */
export type PilotApiAction =
  | 'finance.quotes.create'
  | 'finance.quotes.list'
  | 'dispatch.schedule.write'
  | 'team.invites.create'
  | 'integrations.manage'
  | 'customers.create'
  | 'inventory.stock.write'
  | 'agents.manage'
  | 'boq.create'
  | 'documents.pack.approve';

export type ApiActionDefinition = {
  id: PilotApiAction;
  domain: string;
  requiredPermissions: readonly string[];
  /** Router-level technician guard (finance, boq, jobs office, document packs). */
  blockTechnicianOwnerModule?: boolean;
  /** Requires canonical Platform Owner, not Company Owner. */
  platformOwnerOnly?: boolean;
};

export const PILOT_API_ACTIONS: readonly ApiActionDefinition[] = [
  {
    id: 'finance.quotes.create',
    domain: 'finance',
    requiredPermissions: ['finance:write'],
    blockTechnicianOwnerModule: true,
  },
  {
    id: 'finance.quotes.list',
    domain: 'finance',
    requiredPermissions: ['finance:read', 'finance:write'],
    blockTechnicianOwnerModule: true,
  },
  {
    id: 'dispatch.schedule.write',
    domain: 'scheduling',
    requiredPermissions: ['dispatch:write'],
  },
  {
    id: 'team.invites.create',
    domain: 'team',
    requiredPermissions: ['users:manage'],
  },
  {
    id: 'integrations.manage',
    domain: 'integrations',
    requiredPermissions: ['integrations:manage'],
  },
  {
    id: 'customers.create',
    domain: 'crm',
    requiredPermissions: ['customers:write'],
  },
  {
    id: 'inventory.stock.write',
    domain: 'inventory',
    requiredPermissions: ['inventory:write'],
  },
  {
    id: 'agents.manage',
    domain: 'agents',
    requiredPermissions: ['agents:manage', 'agents:write', '*'],
  },
  {
    id: 'boq.create',
    domain: 'finance',
    requiredPermissions: ['finance:write'],
    blockTechnicianOwnerModule: true,
  },
  {
    id: 'documents.pack.approve',
    domain: 'documents',
    requiredPermissions: ['documents:write'],
    blockTechnicianOwnerModule: true,
  },
] as const;

export type ApiActionDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'missing_permission' | 'technician_owner_module' | 'platform_owner_required';
    };

export function getPilotApiAction(actionId: PilotApiAction): ApiActionDefinition {
  const action = PILOT_API_ACTIONS.find((entry) => entry.id === actionId);
  if (!action) {
    throw new Error(`Unknown pilot API action: ${actionId}`);
  }
  return action;
}

/**
 * Pure permission evaluator for pilot API actions.
 * Mirrors `requireAnyPermission` + technician owner-module guard contract.
 */
export function evaluatePilotApiAction(
  identity: StaffIdentity,
  actionId: PilotApiAction,
): ApiActionDecision {
  const action = getPilotApiAction(actionId);

  if (action.platformOwnerOnly && !isPlatformOwnerRole(identity)) {
    return { allowed: false, reason: 'platform_owner_required' };
  }

  if (
    action.blockTechnicianOwnerModule &&
    isTechnicianRole(identity) &&
    !hasUnrestrictedCompanyAccess(identity)
  ) {
    return { allowed: false, reason: 'technician_owner_module' };
  }

  if (!hasAnyPermission(identity.permissions, [...action.requiredPermissions])) {
    return { allowed: false, reason: 'missing_permission' };
  }

  return { allowed: true };
}

export function isPilotApiActionDenied(identity: StaffIdentity, actionId: PilotApiAction): boolean {
  return !evaluatePilotApiAction(identity, actionId).allowed;
}
