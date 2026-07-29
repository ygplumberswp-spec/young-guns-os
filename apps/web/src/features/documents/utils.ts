import { hasAnyPermission } from '@titan/auth/browser';

export function canAccessDocuments(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['documents:read', 'documents:write']);
}

export function canManageDocuments(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['documents:write']);
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) {
    return '—';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
