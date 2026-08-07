import type { Response } from 'express';

/** Append a Server-Timing metric without clobbering existing values. */
export function appendServerTiming(res: Response, name: string, durationMs: number): void {
  const metric = `${name};dur=${Math.max(0, Math.round(durationMs * 100) / 100)}`;
  const existing = res.getHeader('Server-Timing');
  if (!existing) {
    res.setHeader('Server-Timing', metric);
    return;
  }
  const previous = Array.isArray(existing) ? existing.join(', ') : String(existing);
  res.setHeader('Server-Timing', previous ? `${previous}, ${metric}` : metric);
}

export async function withServerTiming<T>(
  res: Response,
  name: string,
  work: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    appendServerTiming(res, name, performance.now() - started);
  }
}
