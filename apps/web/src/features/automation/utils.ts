import { hasAnyPermission } from '@titan/auth/browser';
import type {
  WorkflowActionType,
  WorkflowExecutionStatus,
  WorkflowRunStatus,
  WorkflowStatus,
  WorkflowTriggerType,
} from '@titan/shared';
import {
  WORKFLOW_ACTION_TYPE_OPTIONS,
  WORKFLOW_EXECUTION_STATUS_OPTIONS,
  WORKFLOW_RUN_STATUS_OPTIONS,
  WORKFLOW_STATUS_OPTIONS,
  WORKFLOW_TRIGGER_TYPE_OPTIONS,
} from '@titan/shared';

export function canAccessAutomation(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['automation:read', 'automation:write']);
}

export function canManageAutomation(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['automation:write']);
}

export function formatWorkflowStatus(status: WorkflowStatus): string {
  return WORKFLOW_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function formatTriggerType(type: WorkflowTriggerType): string {
  return WORKFLOW_TRIGGER_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function formatActionType(type: WorkflowActionType): string {
  return WORKFLOW_ACTION_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function formatExecutionStatus(status: WorkflowExecutionStatus): string {
  return (
    WORKFLOW_EXECUTION_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
  );
}

export function formatRunStatus(status: WorkflowRunStatus): string {
  return WORKFLOW_RUN_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}
