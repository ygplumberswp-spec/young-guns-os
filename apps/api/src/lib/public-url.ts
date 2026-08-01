/** Normalize a public URL to a browser origin (scheme + host [+ port], no path). */
export function normalizePublicOrigin(url: string): string {
  return new URL(url.trim()).origin;
}

/** Railway docs / example placeholders that must never be used as APP_URL. */
export function isPlaceholderPublicUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return (
      host.includes('your-') ||
      host.includes('your_') ||
      // Railway docs slug YOUR-COMFORTABLE-DETERMINATION-URL — not live *-staging hosts.
      host.includes('comfortable-determination-url') ||
      host.endsWith('.invalid') ||
      host === 'example.com' ||
      host.endsWith('.example.com') ||
      host.endsWith('.example')
    );
  } catch {
    return true;
  }
}

export function parseCorsOriginAllowlist(
  appUrl: string,
  corsOriginsEnv?: string | undefined,
): Set<string> {
  const allowed = new Set<string>([normalizePublicOrigin(appUrl)]);
  for (const part of String(corsOriginsEnv ?? '').split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      allowed.add(normalizePublicOrigin(trimmed));
    } catch {
      // skip invalid entries
    }
  }
  return allowed;
}
