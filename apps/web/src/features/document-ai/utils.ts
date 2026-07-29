export function canAccessDocumentAi(permissions: string[]) {
  return (
    permissions.includes('document_ai:read') ||
    permissions.includes('document_ai:write') ||
    permissions.includes('document_ai:manage') ||
    permissions.includes('documents:read') ||
    permissions.includes('admin')
  );
}

export function canManageDocumentAi(permissions: string[]) {
  return (
    permissions.includes('document_ai:write') ||
    permissions.includes('document_ai:manage') ||
    permissions.includes('documents:write') ||
    permissions.includes('admin')
  );
}

export function formatSeverity(severity: string) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function formatStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatClassificationKey(key: string) {
  return formatStatus(key);
}

export function formatConfidence(score: number | null) {
  if (score == null) return '—';
  return `${Math.round(score * 100)}%`;
}

export function formatFileSize(bytes: number | null) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
