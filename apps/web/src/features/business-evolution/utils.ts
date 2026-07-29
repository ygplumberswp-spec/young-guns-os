export function canAccessBusinessEvolution(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('business_evolution:read') ||
    permissions.includes('business_evolution:manage') ||
    permissions.includes('intelligence:read')
  );
}

export function canManageBusinessEvolution(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('business_evolution:manage') ||
    permissions.includes('business_evolution:write') ||
    permissions.includes('intelligence:write')
  );
}

export function formatLearningStage(stage: string): string {
  return stage.replace(/_/g, ' ');
}

export function formatWorkflowStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

export function formatSeverity(severity: string): string {
  return severity.replace(/_/g, ' ');
}
