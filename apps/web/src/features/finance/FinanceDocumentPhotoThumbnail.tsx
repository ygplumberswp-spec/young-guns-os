import { useEffect, useState, type ReactNode } from 'react';
import { jobEvidenceContentUrl } from '../../lib/jobs-api';

const blobCache = new Map<string, string>();

async function loadPhotoBlob(accessToken: string, jobId: string, documentationId: string): Promise<string | null> {
  const key = `${accessToken}:${jobId}:${documentationId}`;
  const cached = blobCache.get(key);
  if (cached) return cached;

  const response = await fetch(jobEvidenceContentUrl(jobId, documentationId), {
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
  photo: { jobId: string; documentationId: string; mimeType: string; fileName: string };
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
    void loadPhotoBlob(accessToken, photo.jobId, photo.documentationId).then((url) => {
      if (!cancelled && url) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, isImage, photo.documentationId, photo.jobId]);

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
