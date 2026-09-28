/**
 * Service worker caching guards.
 *
 * The trap this exists for: cache-first was applied to every static asset on
 * the assumption that Next content-hashes them. It does in a production
 * build, where the hash is in the filename. It does not in a dev build,
 * where the hash rides in ?v=<buildId> — fixed for the life of the dev
 * server while the file behind it changes on every edit. The result was a
 * till running code from hours earlier: a payment rule that had been fixed
 * appeared not to be, and a modal that had been added never showed.
 *
 * Run with: npm run check:sw
 */
import { readFileSync } from 'node:fs';

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

const sw = readFileSync('public/sw.js', 'utf8');

console.log('\nstale code cannot outlive a reload');
check('the strategy is chosen per URL, not assumed', /const mutable = url\.search !== ''/.test(sw), true);
check('a URL carrying a query is fetched fresh', /if \(mutable\)/.test(sw), true);
check('a cached immutable asset is revalidated behind the load',
  /event\.waitUntil\(fromNetwork\)/.test(sw), true);
check('the old cache-first comment is gone',
  /cache first — they are content-hashed/.test(sw), false);

console.log('\ncaches are versioned and cleaned');
check('a version is declared', /const VERSION = '/.test(sw), true);
check('it has moved past the poisoned v1', /const VERSION = 'v1'/.test(sw), false);
check('old caches are deleted on activate', /caches\.delete\(key\)/.test(sw), true);

console.log('\nthe API is never cached');
// A cached sale or stock figure is worse than none: it would be wrong.
check('API traffic passes straight through', /if \(isApiRequest\(url\)\) return;/.test(sw), true);
check('health probes are treated as API', /startsWith\('\/health'\)/.test(sw), true);
check('only GET is intercepted', /request\.method !== 'GET'/.test(sw), true);

console.log('\nnavigations pick up a deploy');
check('navigations are network first', /Navigations: network first/.test(sw), true);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll service worker checks passed.');
