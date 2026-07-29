export function canAccessCommunicationsHub(permissions: string[]) {
  return (
    permissions.includes('communications:read') ||
    permissions.includes('communications:manage') ||
    permissions.includes('communications_intelligence:read') ||
    permissions.includes('voice:read') ||
    permissions.includes('platform:read') ||
    permissions.includes('*')
  );
}

export function canManageCommunicationsHub(permissions: string[]) {
  return (
    permissions.includes('communications:manage') ||
    permissions.includes('communications:write') ||
    permissions.includes('platform:manage') ||
    permissions.includes('*')
  );
}

export function formatProviderChannel(channel: string) {
  return channel.replace(/_/g, ' ');
}

export function formatProviderStatus(status: string) {
  return status.replace(/_/g, ' ');
}
