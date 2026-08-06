import { useEffect, useState, type ReactNode } from 'react';
import type { DocumentPhoto } from '@titan/shared';
import { financeDirectPhotoContentUrl } from '../../lib/document-engine-api-client';
import { jobEvidenceContentUrl } from '../../lib/jobs-api';

const blobCache = new Map<string, string>();

async function loadPhotoBlob(accessToken: string, photo: DocumentPhoto): Promise<string | null> {
  const key = photo.source === 'finance_direct' && photo.storageKey
    ? `${accessToken}:direct:${photo.storageKey}`
    : `${accessToken}:${photo.jobId}:${photo.documentationId}`;
  const cached = blobCache.get(key);
  if (cached) return cached;

  const url = photo.source === 'finance_direct' && photo.storageKey
    ? financeDirectPhotoContentUrl(photo.storageKey)
    : jobEvidenceContentUrl(photo.jobId, photo.documentationId);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  blobCache.set(key, objectUrl);
  return objectUrl;
}

type FinanceDocumentPhotoThumbnailProps = {
  accessToken: string;
  photo: DocumentPhoto;
  alt: string;
  className?: string;
  fallback?: ReactNode;
};

export function FinanceDocumentPhotoThumbnail({
  accessToken,
  photo,
  alt,
  className,
  fallback = null,
}: FinanceDocumentPhotoThumbnailProps) {
  const isImage = photo.mimeType.toLowerCase().startsWith('image/');
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    void loadPhotoBlob(accessToken, photo).then((url) => {
      if (!cancelled && url) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, isImage, photo]);

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
