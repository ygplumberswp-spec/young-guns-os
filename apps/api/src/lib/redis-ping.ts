import net from 'node:net';

/**
 * Lightweight Redis readiness probe (TCP connect only).
 * Does not authenticate or run commands — safe for hosting foundation checks.
 */
export async function pingRedisTcp(
  redisUrl: string,
  timeoutMs = 2_000,
): Promise<{ ok: boolean; reason?: string }> {
  let hostname = '127.0.0.1';
  let port = 6379;
  try {
    const parsed = new URL(redisUrl);
    hostname = parsed.hostname || hostname;
    port = parsed.port ? Number(parsed.port) : port;
  } catch {
    return { ok: false, reason: 'invalid_redis_url' };
  }

  return await new Promise((resolve) => {
    const socket = net.connect({ host: hostname, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, reason: 'timeout' });
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve({ ok: true });
    });
    socket.once('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ ok: false, reason: 'connect_failed' });
    });
  });
}
