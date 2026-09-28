/**
 * Same-origin proxy guards.
 *
 * The trap this exists for: Next's `rewrites()` is evaluated during
 * `next build` and baked into the routes manifest, so a rewrite can never
 * read a runtime environment variable. Proxying that way appears to work
 * locally and silently 404s in the container. The proxy must stay a route
 * handler.
 *
 * Run with: npm run check:proxy
 */
import { readFileSync, existsSync } from 'node:fs';

let failed = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(`          got  ${JSON.stringify(actual)}`);
    console.log(`          want ${JSON.stringify(expected)}`);
  }
};
const read = (p) => readFileSync(p, 'utf8');

console.log('proxy runs per request, not at build time');
check('the API proxy is a route handler', existsSync('src/app/api/[...path]/route.ts'), true);
check('the health proxy is a route handler', existsSync('src/app/health/[[...segments]]/route.ts'), true);
check('next.config declares no rewrites', /async rewrites\s*\(/.test(read('next.config.mjs')), false);
check('the target is read at request time',
  read('src/lib/proxy.ts').includes('process.env.API_PROXY_TARGET'), true);

console.log('\nsession survives the extra hop');
const proxy = read('src/lib/proxy.ts');
check('Set-Cookie is forwarded as separate headers', proxy.includes('getSetCookie()'), true);
check('hop-by-hop headers are stripped', proxy.includes("'transfer-encoding'"), true);
check('the real client IP is forwarded', proxy.includes('x-forwarded-for'), true);
check('redirects are left to the browser', proxy.includes("redirect: 'manual'"), true);
check('an unreachable API reads as a server error, not a crash', proxy.includes('502'), true);

console.log('\nthe browser is told the right base URL');
const runtime = read('src/lib/runtime-config.ts');
check('relative URLs when proxying', runtime.includes("proxied ? '' :"), true);
check('absolute URL otherwise', runtime.includes('process.env.API_URL'), true);

console.log('\nno hardcoded API host in components');
const offenders = ['src/lib/api.ts', 'src/hooks/useOnline.ts']
  .filter((f) => /https?:\/\/localhost:4000/.test(read(f)));
check('nothing points at localhost:4000', offenders, []);

/*
 * The gap every check above missed: proxy.ts, runtime-config.ts and the
 * route handler were all correct, and the app still answered every API call
 * with 503 "The API proxy is not configured on this server." — because
 * docker-compose.yml never set API_PROXY_TARGET. Correct code that is never
 * given its environment is still a broken deployment, so the wiring is
 * checked too.
 */
console.log('\nthe deployment actually turns the proxy on');
const composePath = '../docker-compose.yml';
check('docker-compose.yml is where expected', existsSync(composePath), true);
if (existsSync(composePath)) {
  const compose = readFileSync(composePath, 'utf8');
  check('the frontend is given API_PROXY_TARGET',
    /^\s*API_PROXY_TARGET:/m.test(compose), true);
  check('it defaults to the backend service, not localhost',
    /API_PROXY_TARGET:\s*\$\{API_PROXY_TARGET-http:\/\/backend:4000\}/.test(compose), true);
  // ${VAR-default} rather than ${VAR:-default}: an explicitly empty value
  // must be able to turn the proxy off, which :- would silently override.
  check('an explicit empty value can still disable it',
    /API_PROXY_TARGET:\s*\$\{API_PROXY_TARGET-/.test(compose), true);
}

/*
 * A server answering every probe with 503 was reported to the cashier as
 * "offline", which is what sent two investigations after a network fault
 * that did not exist. The probe must keep the two apart.
 */
console.log('\na broken server does not read as a dead network');
const conn = read('src/hooks/useOnline.ts');
check('the probe reports why, not just whether', conn.includes("'server-error'"), true);
check('a reachable-but-failing server is distinguished',
  /reason: response\.ok \? 'ok' : 'server-error'/.test(conn), true);
check('a thrown fetch is distinguished from a bad status',
  conn.includes("'unreachable'"), true);
// Offline must still mean offline: a 503 has to queue the sale locally.
check('an error status still counts as offline for queuing',
  /online: response\.ok/.test(conn), true);
check('the plain boolean caller keeps working',
  /export function useOnline\(/.test(conn), true);
const indicator = read('src/components/shell/SyncIndicator.tsx');
check('the cashier is told it is the server, not the wifi',
  indicator.includes("'server-error'") && indicator.includes('Server error'), true);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll proxy checks passed.');
