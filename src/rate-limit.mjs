import { HttpError } from './core.mjs';

// Small single-process guard for the demo. Public deployments should ALSO enforce
// proxy/edge limits, especially when running multiple application replicas.
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map();

function increment(key, limit, now) {
  let item = attempts.get(key);
  if (!item || item.expires <= now) item = { count: 0, expires: now + WINDOW_MS };
  if (item.count >= limit) {
    throw new HttpError(429, 'LOGIN_RATE_LIMIT', 'تلاش‌های ورود بیش از حد مجاز است. لطفاً بعداً دوباره تلاش کنید.');
  }
  item.count += 1;
  attempts.set(key, item);
}

export function limitLogin(req, email) {
  const now = Date.now();
  // Never use X-Forwarded-For without an explicitly trusted reverse proxy.
  const ip = req.socket.remoteAddress || 'unknown';
  const identifier = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 160) : 'invalid';
  if (attempts.size > 2000) {
    for (const [key, item] of attempts) if (item.expires <= now) attempts.delete(key);
    while (attempts.size > 2500) attempts.delete(attempts.keys().next().value);
  }
  increment(`ip:${ip}`, 100, now);
  increment(`account:${ip}:${identifier}`, 8, now);
}
