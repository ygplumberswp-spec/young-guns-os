import { useEffect, useState, type ReactNode } from 'react';
import { request } from '../../lib/api-client';

type CompanyMediaImageProps = {
  accessToken: string;
  fileId: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
};

export function CompanyMediaImage({
  accessToken,
  fileId,
  alt,
  className,
  fallback = null,
}: CompanyMediaImageProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      const response = await fetch(`/api/v1/company/media/${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        return;
      }

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      if (!cancelled) {
        setSrc(objectUrl);
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, fileId]);

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
