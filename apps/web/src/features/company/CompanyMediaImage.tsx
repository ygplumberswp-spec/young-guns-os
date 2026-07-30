import { useEffect, useState, type ReactNode } from 'react';
import {
  clearInflightCompanyMediaBlobRequest,
  getCachedCompanyMediaBlob,
  getInflightCompanyMediaBlobRequest,
  setCachedCompanyMediaBlob,
  setInflightCompanyMediaBlobRequest,
} from '../../lib/company-media-cache';
import { request } from '../../lib/api-client';

type CompanyMediaImageProps = {
  accessToken: string;
  fileId: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
};

async function loadCompanyMediaBlob(accessToken: string, fileId: string): Promise<string | null> {
  const cached = getCachedCompanyMediaBlob(accessToken, fileId);
  if (cached) {
    return cached;
  }

  const inflight = getInflightCompanyMediaBlobRequest(accessToken, fileId);
  if (inflight) {
    return inflight;
  }

  const promise = (async () => {
    const response = await fetch(`/api/v1/company/media/${fileId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    setCachedCompanyMediaBlob(accessToken, fileId, objectUrl);
    return objectUrl;
  })()
    .catch(() => null)
    .finally(() => {
      clearInflightCompanyMediaBlobRequest(accessToken, fileId);
    });

  setInflightCompanyMediaBlobRequest(accessToken, fileId, promise);
  return promise;
}

export function CompanyMediaImage({
  accessToken,
  fileId,
  alt,
  className,
  fallback = null,
}: CompanyMediaImageProps) {
  const [src, setSrc] = useState<string | null>(() =>
    getCachedCompanyMediaBlob(accessToken, fileId),
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const objectUrl = await loadCompanyMediaBlob(accessToken, fileId);
      if (!cancelled && objectUrl) {
        setSrc(objectUrl);
      }
    }

    if (!src) {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [accessToken, fileId, src]);

  if (!src) {
    return fallback ? <>{fallback}</> : null;
  }

  return <img src={src} alt={alt} className={className} />;
}

export async function fetchCompanyMediaBlob(
  accessToken: string,
  fileId: string,
): Promise<string | null> {
  try {
    await request(`/company/media/${fileId}`, { accessToken });
    return null;
  } catch {
    return null;
  }
}
