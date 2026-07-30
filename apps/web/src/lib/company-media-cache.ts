const blobUrlCache = new Map<string, string>();
const inflightBlobRequests = new Map<string, Promise<string | null>>();

function cacheKey(accessToken: string, fileId: string): string {
  return `${accessToken}:${fileId}`;
}

export function getCachedCompanyMediaBlob(accessToken: string, fileId: string): string | null {
  return blobUrlCache.get(cacheKey(accessToken, fileId)) ?? null;
}

export function setCachedCompanyMediaBlob(
  accessToken: string,
  fileId: string,
  objectUrl: string,
): void {
  blobUrlCache.set(cacheKey(accessToken, fileId), objectUrl);
}

export function getInflightCompanyMediaBlobRequest(
  accessToken: string,
  fileId: string,
): Promise<string | null> | null {
  return inflightBlobRequests.get(cacheKey(accessToken, fileId)) ?? null;
}

export function setInflightCompanyMediaBlobRequest(
  accessToken: string,
  fileId: string,
  promise: Promise<string | null>,
): void {
  inflightBlobRequests.set(cacheKey(accessToken, fileId), promise);
}

export function clearInflightCompanyMediaBlobRequest(accessToken: string, fileId: string): void {
  inflightBlobRequests.delete(cacheKey(accessToken, fileId));
}

export function invalidateCompanyMediaBlob(accessToken: string, fileId: string): void {
  const key = cacheKey(accessToken, fileId);
  const existing = blobUrlCache.get(key);

  if (existing) {
    URL.revokeObjectURL(existing);
    blobUrlCache.delete(key);
  }

  inflightBlobRequests.delete(key);
}
