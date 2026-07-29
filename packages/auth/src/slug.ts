export function slugifyCompanyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function withUniqueSuffix(baseSlug: string, suffix: string): string {
  const trimmed = baseSlug || 'company';
  return `${trimmed}-${suffix}`.slice(0, 63);
}
