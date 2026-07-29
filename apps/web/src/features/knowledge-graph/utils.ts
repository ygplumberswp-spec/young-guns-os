export function canAccessKnowledgeGraph(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('knowledge:read') ||
    permissions.includes('knowledge:write') ||
    permissions.includes('intelligence:read')
  );
}

export function canManageKnowledgeGraph(permissions: string[]): boolean {
  return permissions.includes('*') || permissions.includes('knowledge:write');
}

export function formatEntityType(type: string): string {
  return type.replace(/_/g, ' ');
}
