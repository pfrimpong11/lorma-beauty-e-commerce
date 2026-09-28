/**
 * Responsive guards.
 *
 * Source-level checks, not rendering tests — they catch the specific
 * regressions that are easy to reintroduce and invisible until someone
 * uses the app on the affected hardware:
 *
 *   - `100vh` in a component. On mobile browsers the URL bar is included
 *     in vh, so a 100vh layout is taller than the screen and the checkout
 *     button sits below the fold.
 *   - Mouse-sized controls on the POS. The till runs on touch terminals;
 *     a 30px stepper is not reliably hittable with a finger.
 *   - The 15" terminal (768px tall) losing the product grid to padding.
 *
 * Run with: npm run check:responsive
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const components = walk('src');
const read = (path) => readFileSync(path, 'utf8');

console.log('viewport height');
const vhOffenders = components
  .filter((f) => /\b100vh\b/.test(read(f)))
  .map((f) => f.replace(/^src\//, ''));
check('no component uses 100vh (use h-app / dvh)', vhOffenders, []);

const pos = read('src/features/pos/PosScreen.tsx');
check('the POS fills the dynamic viewport', pos.includes('h-app'), true);
check('the modal is capped in dvh', read('src/components/ui/Modal.tsx').includes('max-h-[92dvh]'), true);

console.log('\ntouch targets on the till');
check('quantity steppers are finger-sized', (pos.match(/tap px-2\.5 py-1\.5/g) ?? []).length, 2);
check('category filters are finger-sized', (pos.match(/tap shrink-0 rounded-full/g) ?? []).length, 2);
check('the mobile cart bar is finger-sized', pos.includes('tap fixed inset-x-0 bottom-0'), true);

console.log('\n15" POS terminal (768px tall)');
check('the checkout button compacts on a short screen', pos.includes('short:h-14'), true);
check('the cart footer compacts on a short screen', pos.includes('short:p-3'), true);
check('variants are declared', read('tailwind.config.ts').includes('(max-height: 820px)'), true);

console.log('\nsmall screens');
check('the cart is a sheet below lg', pos.includes("cartOpen ? 'translate-y-0' : 'translate-y-full'"), true);
check('and a static column from lg up', pos.includes('lg:static lg:z-auto'), true);
check('the grid leaves room for the summary bar', pos.includes('pb-24 sm:p-4 lg:pb-4'), true);

console.log('\nflex children can shrink (otherwise panes overflow)');
check('the catalogue can shrink', pos.includes('min-h-0 min-w-0 flex-1'), true);
check('the scroll areas can shrink', (pos.match(/min-h-0 flex-1 overflow-y-auto/g) ?? []).length, 2);

console.log('\npagination');
// Two rules rather than one: a table screen must page, and so must any
// screen that fetches paged data — otherwise a card grid like Receipts
// slips through the table-only check.
const tableScreens = components.filter((f) => /\/admin\/|\/till\//.test(f) && /<DataTable/.test(read(f)));
check('every table screen paginates',
  tableScreens.filter((f) => !/Pagination/.test(read(f))).map((f) => f.replace(/^src\//, '')), []);

const pagedScreens = components.filter((f) => /usePagedQuery</.test(read(f)));
check('every screen fetching paged data shows the pager',
  pagedScreens.filter((f) => !/<Pagination/.test(read(f))).map((f) => f.replace(/^src\//, '')), []);
check('one page size for the whole app', read('src/hooks/useClientPagination.ts').includes('PAGE_SIZE = 10'), true);
check('API lists default to it', read('src/hooks/usePagedQuery.ts').includes('pageSize = PAGE_SIZE'), true);
const hardcoded = components
  .filter((f) => /usePagedQuery</.test(read(f)) && /\n\s+(25|50|15),\n/.test(read(f)))
  .map((f) => f.replace(/^src\//, ''));
check('no screen overrides it', hardcoded, []);
const pager = read('src/components/ui/DataTable.tsx');
check('previous and next controls exist',
  pager.includes("aria-label=\"Previous page\"") && pager.includes("aria-label=\"Next page\""), true);
check('controls are finger-sized', /aria-label="Previous page"[\s\S]{0,200}className="tap/.test(pager), true);
check('the pager stacks on a phone', pager.includes('flex-col gap-2.5') && pager.includes('sm:flex-row'), true);

console.log('\ndate range filter');
const dr = read('src/components/ui/DateRangeFilter.tsx');
check('From and To stack as one control', dr.includes('<div className="space-y-2">'), true);
check('the panel keeps its own width', dr.includes('w-full') && dr.includes('sm:w-64'), true);
// Match a CALL, not the word — the comment explaining why we avoid
// toISOString would otherwise trip this.
check('dates are built from local time, not UTC',
  dr.includes('function toInput') && !/\.toISOString\(\)/.test(dr), true);
check('the range cannot be inverted', dr.includes('max={value.to') && dr.includes('min={value.from'), true);
check('reports use it', read('src/app/(admin)/admin/reports/page.tsx').includes('<DateRangeFilter'), true);

console.log('\nreceipt printing');
const css = read('src/app/globals.css');

// Each of these guards one fault seen on a real thermal print.
check('the printed copy lives outside the dialog',
  existsSync('src/features/pos/ReceiptPrintHost.tsx'), true);
check('the receipt is static in print, so no ancestor can offset it',
  /\.receipt-print\s*\{[^}]*position:\s*static/s.test(css), true);
check('everything else is hidden by display, not visibility',
  css.includes('body > *:not(.receipt-print-host)') && css.includes('display: none !important'), true);
check('visibility-based hiding is gone (it left a blank third at the top)',
  /body:has\(\.receipt-print\)/.test(css), false);
check('laid out at the printable width, not the paper width',
  /\.receipt-print\s*\{[^}]*width:\s*72mm/s.test(css), true);
check('page length follows the content',
  /@page\s*\{[^}]*size:\s*80mm auto/s.test(css), true);
check('page margin is zero (the receipt centres itself)',
  /@page\s*\{[^}]*margin:\s*0/s.test(css), true);
check('receipts print in one colour (thermal paper is 1-bit)',
  css.includes('color: #000 !important'), true);

const printer = read('src/lib/printer/print.ts');
check('paper size is written from the saved settings at print time',
  printer.includes('@page { size: ${config.paperWidth} auto; margin: 0; }'), true);
check('width comes from the printable-width table',
  printer.includes('PRINTABLE_WIDTH[config.paperWidth]'), true);

// Discovered, not hardcoded: a hardcoded list silently breaks when a
// page moves, and the crash hides every check that comes after it.
// The host itself renders <Receipt>; it is the thing being checked for.
const surfaces = components
  .filter((f) => !f.endsWith('ReceiptPrintHost.tsx'))
  .filter((f) => /<Receipt\s+data=/.test(read(f)));
check('at least one receipt surface exists', surfaces.length > 0, true);
check('every receipt surface renders the print host',
  surfaces.filter((f) => !read(f).includes('<ReceiptPrintHost')).map((f) => f.replace(/^src\//, '')),
  []);

const callSites = components.filter((f) => /window\.print\(\)/.test(read(f)));
check('no component calls window.print() directly',
  callSites.map((f) => f.replace(/^src\//, '')), []);
check('the POS prints through the printer module',
  pos.includes('void printReceipt()'), true);
check('auto-print never breaks a completed sale',
  pos.includes("printReceipt().catch("), true);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll responsive checks passed.');
