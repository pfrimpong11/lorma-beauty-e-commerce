/**
 * Held sales must survive sign-out and reload.
 *
 * The bug this guards: holding a sale kept it only in a Zustand store, so
 * signing out — or simply reloading, or restarting the PWA — threw it
 * away without a word. Holding is an explicit promise to the customer
 * that the basket will still be there, so it belongs on disk beside the
 * offline sales queue.
 *
 * Run with: npm run check:held-sales
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire as createRequire0 } from 'node:module';
import { JSDOM } from 'jsdom';

const require0 = createRequire0(import.meta.url);
import 'fake-indexeddb/auto';

const out = resolve('node_modules/.cache/lorma-held-check');
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

try {
  const tsconfig = join(out, 'tsconfig.json');
  writeFileSync(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: 'commonjs', moduleResolution: 'node',
        outDir: join(out, 'build'), rootDir: resolve('src'),
        skipLibCheck: true, esModuleInterop: true,
        baseUrl: resolve('.'), paths: { '@/*': ['./src/*'] },
      },
      files: [resolve('src/store/cart.ts'), resolve('src/lib/db.ts')],
    }),
  );
  execFileSync('npx', ['tsc', '-p', tsconfig], { stdio: 'inherit' });
  resolveAliases(join(out, 'build'));

  const dom = new JSDOM('<!doctype html><body></body>');
  global.window = dom.window;
  global.document = dom.window.document;
  // db.ts refuses to open on the server, so it needs a window; the
  // IndexedDB itself comes from fake-indexeddb/auto above.
  global.window.indexedDB = globalThis.indexedDB;
  global.structuredClone ??= (v) => JSON.parse(JSON.stringify(v));

  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { useCart } = require(join(out, 'build/store/cart.js'));
  const db = require(join(out, 'build/lib/db.js'));

  const product = (over) => ({
    id: over.id, name: over.name, sku: over.sku, barcode: null, barcodes: [],
    brand: null, categoryId: 'c1', category: 'Serums', sellingPrice: over.price ?? '100.00',
    unit: 'BOTTLE', imageUrl: null, stock: 20, minStockLevel: 2, tracksExpiry: false,
    isActive: true, earliestExpiry: null, updatedAt: new Date().toISOString(),
  });

  const A = product({ id: 'p-a', name: 'Vitamin C Serum', sku: 'A1' });
  const B = product({ id: 'p-b', name: 'SPF 50', sku: 'B1', price: '90.00' });

  const cart = () => useCart.getState();
  const held = () => cart().held.map((h) => `${h.customerName}:${h.lines.length}`);
  /** Wipes the in-memory store exactly as a reload or sign-out would. */
  const reload = async () => {
    useCart.setState({ lines: [], held: [], customerId: null, customerName: 'Walk-in Customer' });
    await cart().loadHeld();
  };

  console.log('holding a sale');
  cart().addProduct(A, 2);
  cart().addProduct(B, 1);
  cart().setCustomer('cust-1', 'Akosua Boateng');
  cart().hold();
  check('the cart is cleared once held', cart().lines.length, 0);
  check('the sale is on the held list', held(), ['Akosua Boateng:2']);
  await new Promise((r) => setTimeout(r, 30));

  console.log('\nsigning out, or reloading the PWA');
  await reload();
  check('the held sale is still there', held(), ['Akosua Boateng:2']);
  check('its lines survived intact', cart().held[0].lines.map((l) => `${l.name} x${l.quantity}`),
    ['Vitamin C Serum x2', 'SPF 50 x1']);
  check('so did the customer', cart().held[0].customerId, 'cust-1');

  console.log('\nseveral held at once');
  cart().addProduct(A, 1);
  cart().setCustomer(null, 'Walk-in Customer');
  cart().hold();
  await new Promise((r) => setTimeout(r, 30));
  await reload();
  check('both survive', held().length, 2);

  console.log('\nretrieving one');
  const first = cart().held[0];
  cart().retrieve(first.id);
  check('it becomes the active cart', cart().lines.length, 2);
  check('and leaves the held list', cart().held.length, 1);
  await new Promise((r) => setTimeout(r, 30));
  await reload();
  check('a retrieved sale does not come back on reload', held().length, 1);

  console.log('\ndiscarding one');
  cart().discardHeld(cart().held[0].id);
  await new Promise((r) => setTimeout(r, 30));
  await reload();
  check('a discarded sale stays gone', held(), []);

  console.log('\nsign-out never clears held sales');
  cart().addProduct(B, 3);
  cart().hold();
  await new Promise((r) => setTimeout(r, 30));
  await db.clearLocalData();
  await reload();
  check('still held after the catalogue cache is wiped', held().length, 1);

  const cartSource = (await import('node:fs')).readFileSync('src/store/cart.ts', 'utf8');
  console.log('\nsource guards');
  check('hold writes through to disk', cartSource.includes('saveHeldTransaction'), true);
  check('retrieve removes it from disk', cartSource.includes('removeHeldTransaction'), true);
  // Assert on the code, not the prose: the comment above clearLocalData
  // explains why held sales are spared, and would match a word search.
  const dbSource = (await import('node:fs')).readFileSync('src/lib/db.ts', 'utf8');
  const clearBody = dbSource.slice(dbSource.indexOf('export async function clearLocalData'));
  check('sign-out does not open the held store',
    /objectStore\('held'\)|'held',/.test(clearBody.slice(0, clearBody.indexOf('\n}'))), false);

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll held-sale checks passed.');
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
