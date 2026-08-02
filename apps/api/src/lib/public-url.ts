/** Normalize a public URL to a browser origin (scheme + host [+ port], no path). */
export function normalizePublicOrigin(url: string): string {
  return new URL(url.trim()).origin;
}

/** Railway docs / example placeholders that must never be used as APP_URL. */
export function isPlaceholderPublicUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    // Match docs placeholders (e.g. YOUR-COMFORTABLE-DETERMINATION-URL), not real
    // Railway service hosts that happen to contain "comfortable-determination".
    return (
      host.includes('your-') ||
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
