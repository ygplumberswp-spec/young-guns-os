import type { RequestHandler } from 'express';

/** Minimal production security headers (no third-party helmet dependency). */
export function securityHeadersMiddleware(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // API is consumed by a separate web origin on Railway/Render. `same-site`
    // blocks credentialed cross-subdomain fetches when `*.up.railway.app` is on
    // the public suffix list.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.removeHeader('X-Powered-By');
    next();
  };
}
