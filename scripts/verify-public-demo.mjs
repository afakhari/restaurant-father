// External acceptance check; no passwords, cookies or connection strings are logged.
import assert from 'node:assert/strict';

const origin = process.env.PUBLIC_DEMO_URL;
const password = process.env.DEMO_PASSWORD;
if (!origin || !password) throw new Error('PUBLIC_DEMO_URL and DEMO_PASSWORD are required');
const url = new URL(origin);
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
    !['', '/'].includes(url.pathname)) {
  throw new Error('PUBLIC_DEMO_URL must be a plain HTTPS origin');
}
const base = url.origin;
const roles = [
  ['waiter@narenj.demo', 'waiter', 'narenj'],
  ['kitchen@narenj.demo', 'kitchen', 'narenj'],
  ['cashier@narenj.demo', 'cashier', 'narenj'],
  ['manager@narenj.demo', 'manager', 'narenj'],
  ['manager@darband.demo', 'manager', 'darband'],
];
async function request(path, options = {}) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(100000) });
  if (!response.ok) throw Error(path + ' returned HTTP ' + response.status);
  return response;
}
const health = await (await request('/api/health')).json();
assert.equal(health.ok, true);
for (const [email, role, slug] of roles) {
  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ email, password }),
  });
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie?.startsWith('shiftyar_session='), email + ': session cookie missing');
  assert.match(login.headers.get('set-cookie'), /; Secure(?:;|$)/i, email + ': insecure cookie');
  const me = await (await request('/api/me', { headers: { Cookie: cookie } })).json();
  const shift = await (await request('/api/shift', { headers: { Cookie: cookie } })).json();
  assert.equal(me.me.role, role);
  assert.equal(shift.restaurant.slug, slug, email + ': incorrect tenant data');
  assert.ok(Array.isArray(shift.tables) && shift.tables.length > 0);
  await request('/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' },
    body: '{}',
  });
  console.log('PASS: ' + role + ' at ' + slug);
}
console.log('PASS: live HTTPS health, five role logins, scoped shift data, secure cookies and logout');
