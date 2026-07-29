export function canAccessVoiceReception(permissions: string[]) {
  return (
    permissions.includes('voice_reception:read') ||
    permissions.includes('voice_reception:write') ||
    permissions.includes('voice_reception:manage') ||
    permissions.includes('voice:read') ||
    permissions.includes('communications:read') ||
    permissions.includes('admin')
  );
}

export function canManageVoiceReception(permissions: string[]) {
  return (
    permissions.includes('voice_reception:write') ||
    permissions.includes('voice_reception:manage') ||
    permissions.includes('voice:write') ||
    permissions.includes('admin')
  );
}

export function formatSeverity(severity: string) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function formatStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatDuration(seconds: number | null) {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
