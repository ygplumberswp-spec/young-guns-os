export function canAccessNotifications(permissions: string[]): boolean {
  return (
    permissions.includes('notifications:read') ||
    permissions.includes('notifications:write') ||
    permissions.includes('notifications:manage') ||
    permissions.includes('integrations:read') ||
    permissions.includes('*')
  );
}

export function canManageNotifications(permissions: string[]): boolean {
  return (
    permissions.includes('notifications:write') ||
    permissions.includes('notifications:manage') ||
    permissions.includes('integrations:manage') ||
    permissions.includes('*')
  );
}

export function canAdministerNotifications(permissions: string[]): boolean {
  return (
    permissions.includes('notifications:manage') ||
    permissions.includes('integrations:manage') ||
    permissions.includes('*')
  );
}

export function formatAlertLevel(level: string): string {
  return level.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDeliveryStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatChannel(channel: string): string {
  return channel.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatModuleSource(source: string): string {
  return source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatSeverity(severity: string): string {
  return severity.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
