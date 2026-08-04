import { useEffect, useState, type ReactNode } from 'react';
import { financeAttachmentContentUrl } from './finance-attachments-api';

const blobCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(accessToken: string, attachmentId: string): string {
  return `${accessToken}:${attachmentId}`;
}

async function loadAttachmentBlob(accessToken: string, attachmentId: string): Promise<string | null> {
  const key = cacheKey(accessToken, attachmentId);
  const cached = blobCache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const response = await fetch(financeAttachmentContentUrl(attachmentId), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    blobCache.set(key, objectUrl);
    return objectUrl;
  })()
    .catch(() => null)
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

type FinanceAttachmentThumbnailProps = {
  accessToken: string;
  attachmentId: string;
  mimeType: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
};

export function FinanceAttachmentThumbnail({
  accessToken,
  attachmentId,
  mimeType,
  alt,
  className,
  fallback = null,
}: FinanceAttachmentThumbnailProps) {
  const isImage = mimeType.toLowerCase().startsWith('image/');
  const [src, setSrc] = useState<string | null>(() => blobCache.get(cacheKey(accessToken, attachmentId)) ?? null);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;

    async function load() {
      const objectUrl = await loadAttachmentBlob(accessToken, attachmentId);
      if (!cancelled && objectUrl) setSrc(objectUrl);
    }

    if (!src) void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, attachmentId, isImage, src]);

  if (!isImage) {
    return (
      <div className={`finance-attachment-thumb finance-attachment-thumb--file ${className ?? ''}`.trim()}>
        <span>PDF</span>
      </div>
    );
  }

  if (!src) {
    return fallback ? <>{fallback}</> : <div className={`finance-attachment-thumb finance-attachment-thumb--loading ${className ?? ''}`.trim()} />;
  }

  return <img src={src} alt={alt} className={className} loading="lazy" decoding="async" />;
}
