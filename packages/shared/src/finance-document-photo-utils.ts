/** Client/server helpers for finance editor photo uploads via job evidence storage. */

export const FINANCE_PHOTO_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function isFinancePhotoMimeType(value: string): boolean {
  return (FINANCE_PHOTO_ALLOWED_MIME_TYPES as readonly string[]).includes(value.toLowerCase());
}

export function validateFinancePhotoFile(input: {
  mimeType: string;
  sizeBytes: number;
}): { ok: true } | { ok: false; message: string } {
  const mime = input.mimeType.trim().toLowerCase();
  if (!isFinancePhotoMimeType(mime)) {
    return { ok: false, message: 'Files must be JPG, PNG, WebP, HEIC or PDF' };
  }
  if (input.sizeBytes <= 0) {
    return { ok: false, message: 'File is empty' };
  }
  const max = mime === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (input.sizeBytes > max) {
    return {
      ok: false,
      message: `File exceeds the ${Math.round(max / (1024 * 1024))} MB limit`,
    };
  }
  return { ok: true };
}

/** Lightweight magic-byte checks for common finance upload types. */
export function validateFinancePhotoMagicBytes(mimeType: string, buffer: Buffer): boolean {
  const mime = mimeType.toLowerCase();
  if (mime === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mime === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  if (mime === 'application/pdf') {
    return buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-';
  }
  if (mime === 'image/heic') {
    return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
  }
  return false;
}

export const FINANCE_PHOTO_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,application/pdf,.heic,.pdf';
