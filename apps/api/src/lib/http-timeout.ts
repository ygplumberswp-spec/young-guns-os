/** Default timeout for outbound provider HTTP calls. */
export const PROVIDER_REQUEST_TIMEOUT_MS = 20_000;

export function providerTimeoutSignal(
  timeoutMs: number = PROVIDER_REQUEST_TIMEOUT_MS,
): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  setTimeout(
    () => controller.abort(new DOMException('Provider request timed out', 'TimeoutError')),
    timeoutMs,
  );
  return controller.signal;
}

export function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' ||
      error.name === 'AbortError' ||
      /timed out/i.test(error.message))
  );
}
