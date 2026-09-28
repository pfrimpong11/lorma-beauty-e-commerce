/**
 * Scan-to-cart integration checks.
 *
 * Exercises the real decoder, the real scanner manager and the real cart
 * store together against a simulated DOM — no mocks of our own code. Only
 * the catalogue lookup is stubbed, standing in for IndexedDB/the API.
 *
 * Covers the scenarios in the integration spec: valid scan, repeat scan
 * increments, several products, unknown barcode, out of stock, leading
 * zeros, empty scan, repeated Enter handling, and that manual search and
 * existing cart behaviour are untouched.
 *
 * Run with: npm run check:scan-to-cart
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire as createRequire0 } from 'node:module';
import { JSDOM } from 'jsdom';

const require0 = createRequire0(import.meta.url);

// Built inside the project, not /tmp: the compiled modules require `idb`
// and `zustand`, and Node only walks up to node_modules from the file's
// own location. Under node_modules/.cache it is also already ignored.
const out = resolve('node_modules/.cache/lorma-scan-check');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const tsconfig = join(out, 'tsconfig.json');
  writeFileSync(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'commonjs',
        moduleResolution: 'node',
        outDir: join(out, 'build'),
        rootDir: resolve('src'),
        skipLibCheck: true,
        esModuleInterop: true,
        baseUrl: resolve('.'),
        paths: { '@/*': ['./src/*'] },
      },
      files: [
        resolve('src/lib/db.ts'),
        resolve('src/lib/scanner/manager.ts'),
        resolve('src/lib/scanner/keyboard.ts'),
        resolve('src/lib/scanner/config.ts'),
        resolve('src/store/cart.ts'),
      ],
    }),
  );
  execFileSync('npx', ['tsc', '-p', tsconfig], { stdio: 'inherit' });
  resolveAliases(join(out, 'build'));

  const dom = new JSDOM('<!doctype html><body><input id="search" /></body>', {
    pretendToBeVisual: true,
  });
  let clock = 0;
  const win = dom.window;
  win.performance.now = () => clock;
  global.window = win;
  global.document = win.document;
  global.performance = win.performance;
  global.KeyboardEvent = win.KeyboardEvent;

  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { scanner } = require(join(out, 'build/lib/scanner/manager.js'));
  const { useCart } = require(join(out, 'build/store/cart.js'));

  // IndexedDB is unavailable here, so the manager falls back to defaults —
  // which is exactly what a first run on a fresh till does.
  await scanner.start();

  const product = (over) => ({
    id: over.id, name: over.name, sku: over.sku, barcode: over.barcode,
    brand: null, categoryId: 'c1', category: 'Serums',
    sellingPrice: over.price ?? '100.00', unit: 'BOTTLE', imageUrl: null,
    stock: over.stock ?? 10, minStockLevel: 2, tracksExpiry: false,
    isActive: over.isActive ?? true, earliestExpiry: null,
    updatedAt: new Date().toISOString(),
  });

  // Stands in for the IndexedDB index / barcode endpoint.
  const CATALOGUE = {
    '8901234567890': product({ id: 'p-a', name: 'Product A', sku: 'A1', barcode: '8901234567890' }),
    '1234567890123': product({ id: 'p-b', name: 'Product B', sku: 'B1', barcode: '1234567890123' }),
    '4006381333931': product({ id: 'p-c', name: 'Product C', sku: 'C1', barcode: '4006381333931' }),
    // Leading zeros must survive as a string key.
    '0012345678905': product({ id: 'p-z', name: 'Zero Product', sku: 'Z1', barcode: '0012345678905' }),
    '5555555555555': product({ id: 'p-o', name: 'Sold Out', sku: 'O1', barcode: '5555555555555', stock: 0 }),
  };

  const notFound = [];
  const rejected = [];
  scanner.onScan((event) => {
    const found = CATALOGUE[event.code];
    if (!found) { notFound.push(event.code); return; }
    const result = useCart.getState().addProduct(found);
    if (!result.ok) rejected.push(result.reason);
  });

  const type = (text, gapMs = 4, terminator = 'Enter', target) => {
    const el = target ?? win.document.body;
    for (const ch of text) {
      clock += gapMs;
      el.dispatchEvent(new win.KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
    }
    if (terminator) {
      clock += gapMs;
      el.dispatchEvent(new win.KeyboardEvent('keydown', { key: terminator, bubbles: true, cancelable: true }));
    }
  };
  const lines = () => useCart.getState().lines.map((l) => `${l.name} x${l.quantity}`);
  const reset = () => { useCart.getState().clear(); notFound.length = 0; rejected.length = 0; };

  console.log('1-3  scan resolves and adds through the existing cart');
  reset();
  type('8901234567890');
  check('a scanned product is added at quantity 1', lines(), ['Product A x1']);
  check('the cart holds one line', useCart.getState().lines.length, 1);

  console.log('\n4-5  repeat scans increment, never duplicate the line');
  type('8901234567890');
  check('scanning the same product again makes it x2', lines(), ['Product A x2']);
  type('8901234567890');
  type('8901234567890');
  type('8901234567890');
  check('five scans of one product is x5', lines(), ['Product A x5']);
  check('still a single cart line', useCart.getState().lines.length, 1);

  console.log('\n6,17 several products, rapid succession');
  reset();
  type('8901234567890');
  type('1234567890123');
  type('4006381333931');
  type('8901234567890');
  check('mixed rapid scans land correctly',
    lines(), ['Product A x2', 'Product B x1', 'Product C x1']);
  check('item count is right', useCart.getState().itemCount(), 4);

  console.log('\n7  unknown barcode');
  reset();
  type('9999999999999');
  check('nothing is added', lines(), []);
  check('the unknown code is reported once', notFound, ['9999999999999']);
  type('8901234567890');
  check('the till stays ready for the next scan', lines(), ['Product A x1']);

  console.log('\n8  out of stock respects the existing cart rule');
  reset();
  type('5555555555555');
  check('an out-of-stock product is not added', lines(), []);
  check('the cart\'s own message is used', rejected, ['Only 0 of Sold Out in stock.']);

  console.log('\n9  leading zeros survive');
  reset();
  type('0012345678905');
  check('a barcode with leading zeros resolves', lines(), ['Zero Product x1']);
  check('it was looked up as a string, zeros intact', notFound, []);

  console.log('\n10  empty and too-short scans');
  reset();
  type('', 4, 'Enter');
  type('12', 4, 'Enter');
  check('nothing is added', lines(), []);
  check('nothing is reported as not found', notFound, []);

  console.log('\n11  repeated Enter / duplicate event handling');
  reset();
  type('1234567890123');
  clock += 4;
  // A second Enter on its own must not re-submit the previous read.
  win.document.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  win.document.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  check('stray Enters do not add the product again', lines(), ['Product B x1']);

  console.log('\n     UPC-A registered 12 digits, scanned as 13');
  reset();
  // The FR20 expands UPC-A to EAN-13 with a leading zero before sending.
  const { equivalentBarcodes } = require(join(out, 'build/lib/db.js'));
  check('12-digit code also matches its 13-digit form',
    equivalentBarcodes('305210287303'), ['305210287303', '0305210287303']);
  check('13-digit leading-zero code also matches the 12-digit form',
    equivalentBarcodes('0305210287303'), ['0305210287303', '305210287303']);
  check('an EAN-13 that is not a UPC-A is left alone',
    equivalentBarcodes('6001234500284'), ['6001234500284']);
  check('a non-numeric code is left alone',
    equivalentBarcodes('LMB-TEST-01'), ['LMB-TEST-01']);

  console.log('\n12  manual typing is never mistaken for a scan');
  reset();
  const search = win.document.getElementById('search');
  type('vitamin serum', 150, 'Enter', search);
  check('typing a search term adds nothing to the cart', lines(), []);
  check('and is not reported as an unknown barcode', notFound, []);

  console.log('\n13-14  existing cart behaviour is unchanged');
  reset();
  type('8901234567890');
  type('1234567890123');
  const cart = useCart.getState();
  cart.setQuantity('p-a', 3);
  check('quantity can still be set directly', lines(), ['Product A x3', 'Product B x1']);
  cart.removeLine('p-b');
  check('lines can still be removed', lines(), ['Product A x3']);
  check('totals still compute', useCart.getState().total(), 300);
  cart.hold();
  check('hold still works', useCart.getState().held.length, 1);
  check('holding clears the cart', lines(), []);
  useCart.getState().retrieve(useCart.getState().held[0].id);
  check('retrieve still works', lines(), ['Product A x3']);

  console.log('\n     simulate() drives the same path without hardware');
  reset();
  scanner.simulate('8901234567890');
  scanner.simulate('8901234567890');
  await sleep(10);
  check('simulated scans add and increment', lines(), ['Product A x2']);
  scanner.simulate('   ');
  check('a blank simulated scan is ignored', lines(), ['Product A x2']);

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll scan-to-cart checks passed.');
} finally {
  rmSync(out, { recursive: true, force: true });
}

/**
 * tsc resolves the `@/` alias for typechecking but leaves it in the
 * emitted require() calls, so Node cannot find the module. Rewrite each
 * one to a path relative to the build root.
 */
function resolveAliases(buildRoot) {
  const { readdirSync, statSync, readFileSync, writeFileSync } = require0('node:fs');
  const { join, relative, dirname } = require0('node:path');

  const walk = (dir, acc = []) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, acc);
      else if (full.endsWith('.js')) acc.push(full);
    }
    return acc;
  };

  for (const file of walk(buildRoot)) {
    const before = readFileSync(file, 'utf8');
    const after = before.replace(/require\("@\/([^"]+)"\)/g, (_m, rest) => {
      let rel = relative(dirname(file), join(buildRoot, rest)).replace(/\\/g, '/');
      if (!rel.startsWith('.')) rel = `./${rel}`;
      return `require("${rel}")`;
    });
    if (after !== before) writeFileSync(file, after);
  }
}
