import { hasAnyPermission } from '@titan/auth/browser';
import type { AgentExecutionStatus, AgentKey, AgentProfileStatus } from '@titan/shared';
import {
  AGENT_EXECUTION_STATUS_OPTIONS,
  AGENT_PROFILE_STATUS_OPTIONS,
  AGENT_REGISTRY,
} from '@titan/shared';

export function canAccessAgents(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['agents:read', 'agents:write']);
}

export function canManageAgents(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['agents:write']);
}

export function formatAgentProfileStatus(status: AgentProfileStatus): string {
  return AGENT_PROFILE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function formatAgentExecutionStatus(status: AgentExecutionStatus): string {
  return AGENT_EXECUTION_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function formatAgentKey(agentKey: AgentKey): string {
  return AGENT_REGISTRY.find((entry) => entry.agentKey === agentKey)?.name ?? agentKey;
}
