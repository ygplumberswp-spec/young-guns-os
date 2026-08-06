import { FINANCE_PHOTO_ACCEPT, validateFinancePhotoFile } from '@titan/shared';

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function normaliseUploadMimeType(file: File): string {
  const type = file.type.trim().toLowerCase();
  if (type) return type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.heic')) return 'image/heic';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.pdf')) return 'application/pdf';
  return type;
}

export function validateClientPhotoFile(file: File): string | null {
  const mimeType = normaliseUploadMimeType(file);
  const validation = validateFinancePhotoFile({ mimeType, sizeBytes: file.size });
  return validation.ok ? null : validation.message;
}

export { FINANCE_PHOTO_ACCEPT };
