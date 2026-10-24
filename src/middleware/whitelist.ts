import type { Context, Next } from 'hono';
import { isWhitelisted } from '../modules/whitelist';

export function getClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = c.req.header('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  // Bun raw request socket info if available
  const rawReq = c.req.raw as any;
  if (rawReq?.socket?.remoteAddress) {
    return rawReq.socket.remoteAddress;
  }
  // Default to localhost for local testing
  return '127.0.0.1';
}

export function getApiKey(c: Context): string | null {
  const customHeader = c.req.header('x-api-key');
  if (customHeader) return customHeader.trim();

  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

export async function whitelistMiddleware(c: Context, next: Next) {
  const ip = getClientIp(c);
  const apiKey = getApiKey(c);

  const allowed = await isWhitelisted(ip, apiKey);
  if (!allowed) {
    return c.json(
      {
        success: false,
        error: "Forbidden: IP address or API key not in whitelist",
        client_ip: ip,
        hint: "Provide valid X-API-Key or contact administrator to whitelist your IP."
      },
      403
    );
  }

  await next();
}
