/**
 * Section-routing checks.
 *
 * The split between the till and the back office is enforced by pure
 * functions in src/components/shell/nav-items.ts. This compiles that real
 * module and asserts the invariants that matter:
 *
 *   - each role lands in its own section after sign-in
 *   - a sales rep can never be handed back-office navigation
 *   - the switcher appears only for someone who can open both
 *
 * Run with: npm run check:sections
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'lorma-sections-'));

try {
  execFileSync(
    'npx',
    ['tsc', 'src/components/shell/nav-items.ts', '--outDir', out,
     '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck'],
    { stdio: 'inherit' },
  );

  const { createRequire } = await import('node:module');
  const require = createRequire(pathToFileURL(join(out, 'x.cjs')));
  const nav = require(join(out, 'nav-items.js'));
  const { landingPath, canUseBackOffice, canUseTill, adminNavFor, tillNavFor } = nav;

  // Mirrors backend/src/common/permissions.ts
  const CASHIER = ['pos.access', 'product.view', 'category.view', 'inventory.view',
    'sale.create', 'sale.view', 'sale.hold', 'sale.discount', 'customer.view',
    'customer.manage', 'shift.open', 'shift.close_own', 'return.view'];
  const ADMIN = [...new Set([...CASHIER, 'dashboard.view', 'report.view', 'report.export',
    'report.view_financial', 'product.create', 'product.update', 'product.update_price',
    'product.deactivate', 'category.manage', 'inventory.stock_in', 'inventory.adjust',
    'inventory.write_off', 'batch.manage', 'sale.view_all', 'sale.void', 'return.create',
    'user.view', 'user.manage', 'role.manage', 'shift.close_any', 'shift.view_all',
    'audit.view', 'settings.manage', 'sync.resolve_conflict'])];
  // Not a seeded role — proves the split holds as roles are added (§6).
  const STOCK = ['product.view', 'product.update', 'category.manage', 'inventory.view',
    'inventory.stock_in', 'inventory.adjust', 'inventory.write_off', 'batch.manage',
    'report.view'];

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
  const labels = (items) => items.map((i) => i.label);

  console.log('landing after sign-in');
  check('sales rep lands on the till', landingPath(CASHIER), '/till');
  check('owner lands on the back office', landingPath(ADMIN), '/admin/dashboard');
  check('stock controller lands on its first section', landingPath(STOCK), '/admin/products');

  console.log('\nsection access');
  check('sales rep: till only', [canUseTill(CASHIER), canUseBackOffice(CASHIER)], [true, false]);
  check('owner: both sections', [canUseTill(ADMIN), canUseBackOffice(ADMIN)], [true, true]);
  check('stock controller: back office only', [canUseTill(STOCK), canUseBackOffice(STOCK)], [false, true]);

  console.log('\nnavigation rendered');
  check('sales rep gets no back-office nav', labels(adminNavFor(CASHIER)), []);
  check('device setup is not in the till', labels(tillNavFor(CASHIER)).includes('Devices'), false);
  check('device setup is in the back office', labels(adminNavFor(ADMIN)).includes('Devices'), true);
  check('sales rep gets every till section', labels(tillNavFor(CASHIER)),
    ['Sell', 'My Shift', 'Receipts', 'Sync']);
  check('stock controller gets no till nav', labels(tillNavFor(STOCK)), []);
  check('stock controller cannot see the sales register', labels(adminNavFor(STOCK)).includes('Sales'), false);
  check('stock controller cannot see staff', labels(adminNavFor(STOCK)).includes('Staff'), false);
  check('owner sees the sales register', labels(adminNavFor(ADMIN)).includes('Sales'), true);

  console.log('\nthe till is the till');
  const { existsSync, readFileSync } = await import('node:fs');
  const till = readFileSync('src/components/shell/TillShell.tsx', 'utf8');
  check('no back-office switcher in the till', till.includes('SectionSwitcher'), false);
  check('the till gates on onboarding', till.includes('mustChangePassword'), true);
  check('the back office gates on onboarding',
    readFileSync('src/components/shell/AdminShell.tsx', 'utf8').includes('mustChangePassword'), true);

  console.log('\nsigning out of the till');
  check('a labelled Logout exists', /<span>Logout<\/span>/.test(till), true);
  check('the label is never hidden behind a breakpoint',
    /<span>Logout<\/span>/.test(till) && !/hidden sm:inline">Logout/.test(till), true);
  check('only one sign-out control', (till.match(/logout\(\)/g) ?? []).length, 2); // handler + confirm
  check('the header nav can shrink instead of pushing controls off-screen',
    /<nav className="[^"]*min-w-0/.test(till), true);
  check('signing out mid-sale is confirmed', till.includes('items in the cart'), true);

  console.log('\nadding a product asks for its stock');
  const form = readFileSync('src/features/products/ProductForm.tsx', 'utf8');
  check('the count is labelled as stock on hand, not as an opening balance',
    /label="Quantity in stock"/.test(form), true);
  check('it says plainly that sales reduce it',
    /Every sale reduces this/.test(form), true);
  // It used to sit last in a scrollable modal, under the expiry checkbox,
  // where "Minimum stock level" was mistaken for it.
  check('it comes before the minimum level it is measured against',
    form.indexOf('label="Quantity in stock"') < form.indexOf('label="Minimum stock level"'), true);
  check('a batch-tracked count asks for its batch',
    /label="Batch number"/.test(form) && /label="Expiry date"/.test(form), true);
  check('those fields are required before submitting',
    /form\.tracksExpiry &&\s*\n?\s*Number\(form\.openingStock\) > 0 &&/.test(form), true);

  console.log('\ndeleting a product');
  const products = readFileSync('src/app/(admin)/admin/products/page.tsx', 'utf8');
  check('a Delete action sits with Edit and Price',
    />\s*Delete\s*</.test(products), true);
  check('it is gated on its own permission, not on edit',
    /can\('product\.deactivate'\)/.test(products), true);
  check('it is never a one-click action',
    /<ConfirmDialog/.test(products), true);
  check('the confirmation reads as destructive',
    /tone="danger"/.test(products), true);
  // The server picks delete or deactivate, so the UI must report what it
  // actually did rather than asserting one of the two.
  check('the outcome reported comes from the server',
    /toast\.success\(res\.message\)/.test(products), true);
  check('remaining stock is called out before confirming',
    /in stock/.test(products), true);
  /*
   * Delete was added to the table column only. Below sm the DataTable
   * renders mobileRow instead of the table, and that card had no actions at
   * all — so on a POS terminal the button did not exist. Both surfaces must
   * come from one renderer, and the column must be pinned so a sideways
   * scroll cannot hide it.
   */
  check('one renderer feeds both the table and the card',
    (products.match(/rowActions/g) ?? []).length >= 3, true);
  check('the card layout renders the actions too',
    /mobileRow=[\s\S]*?rowActions\(p\)/.test(products), true);
  check('the actions column is pinned to the right edge',
    /stickyRight: true/.test(products), true);
  check('the table supports pinning at all',
    readFileSync('src/components/ui/DataTable.tsx', 'utf8').includes('stickyRight'), true);
  check('the barcode consequence is stated before confirming',
    /barcodes are removed either way/.test(products), true);
  check('the approved-stock-count case is mentioned too',
    /approved stock count/.test(products), true);

  console.log('\nbrowser extensions do not raise hydration errors');
  const layout = readFileSync('src/app/layout.tsx', 'utf8');
  // Grammarly and password managers write attributes onto <body> before
  // React hydrates. The warning on <html> does not cascade, so <body> needs
  // its own or every install reports a console error on every page.
  check('<html> suppresses its own mismatch',
    /<html[^>]*suppressHydrationWarning/.test(layout), true);
  check('<body> suppresses its own too',
    /<body[^>]*suppressHydrationWarning/.test(layout), true);

  console.log('\nproduct sizes');
  const pos = readFileSync('src/features/pos/PosScreen.tsx', 'utf8');
  const cart = readFileSync('src/store/cart.ts', 'utf8');
  const cache = readFileSync('src/lib/db.ts', 'utf8');
  check('the till shows one tile per article, not per size',
    /kind: 'group'/.test(pos), true);
  check('a group opens a size chooser',
    /setChoosingSize/.test(pos), true);
  // Prices differ per size, so a chooser without them is picking blind.
  check('each size button carries its own price',
    /choosingSize\?\.sizes[\s\S]{0,1200}formatAmount\(size\.sellingPrice\)/.test(pos), true);
  check('a size narrowed to one stops being a choice',
    /sizes\.length === 1/.test(pos), true);
  check('the cart line names the size',
    /product\.variantName \? `\$\{product\.name\} — \$\{product\.variantName\}`/.test(cart), true);
  // Grouping happens over the cached catalogue, so it must survive a sync.
  check('the offline catalogue carries the grouping',
    /variantGroupId: string \| null;/.test(cache), true);
  check('the admin list distinguishes sizes that share a name',
    /variantName && \(/.test(products), true);
  const manager = readFileSync('src/features/products/VariantManager.tsx', 'utf8');
  check('the size can be set while adding the product',
    /<Select[\s\S]{0,120}label="Size"/.test(form), true);
  check('the size is chosen, never typed',
    /groups=\{SIZE_GROUPS\}/.test(form) && !/label="New size"[\s\S]{0,80}<Input/.test(manager), true);
  check('the manager chooses too, in all three places',
    (manager.match(/groups=\{/g) ?? []).length, 3);
  // One list for both forms, or the two drift into offering different sizes.
  check('both forms read the same list',
    /from '\.\/sizes'/.test(form) && /from '\.\/sizes'/.test(manager), true);
  check('a label already used is not offered again',
    /availableSizes/.test(manager), true);

  console.log('\ntaking payment');
  const pay = readFileSync('src/features/pos/PaymentModal.tsx', 'utf8');
  // An empty cash field used to pass, so a sale could complete with no record
  // of what was handed over — change owed unknowable, shift impossible to
  // reconcile.
  check('cash tendered is required', /const cashMissing =/.test(pay), true);
  check('an empty cash field blocks the sale',
    /canConfirm = !submitting && !cashMissing && !cashShort/.test(pay), true);
  check('short cash still blocks it too', /cashShort/.test(pay), true);
  check('the tendered amount is always recorded for cash',
    /method === 'CASH' \? \{ amountTendered/.test(pay), true);

  console.log('\ncapturing the customer');
  check('the number is asked for after payment is settled',
    /setPendingPayment\(payment\)/.test(pos), true);
  check('it is skippable, so a refusal cannot stop a sale',
    /finishSale\(false\)/.test(pos), true);
  check('closing the modal finishes the sale rather than losing it',
    /Closing is the same as skipping/.test(pos), true);
  check('a named customer is not asked again',
    /if \(cart\.customerId\) return completeSale\(payment\)/.test(pos), true);
  check('the number rides on the same request as the sale',
    /customerPhone \? \{ customerPhone \}/.test(pos), true);
  check('a bad number is caught before the sale posts',
    /validGhanaPhone/.test(pos), true);

  console.log('\npage size');
  const pageHook = readFileSync('src/hooks/useClientPagination.ts', 'utf8');
  const table = readFileSync('src/components/ui/DataTable.tsx', 'utf8');
  check('ten rows a page', /export const PAGE_SIZE = 10;/.test(pageHook), true);
  // A second, hardcoded copy of the size prints a range that disagrees with
  // the rows actually shown.
  check('the footer reads the same constant', /const size = pageSize \?\? PAGE_SIZE;/.test(table), true);
  check('no page hardcodes its own size',
    ['src/app/(admin)/admin/inventory/counts/page.tsx']
      .filter((f) => /pageSize=\{?20\b/.test(readFileSync(f, 'utf8'))), []);

  console.log('\nreport totals');
  const reports = readFileSync('src/app/(admin)/admin/reports/page.tsx', 'utf8');
  const totalsAt = reports.indexOf('data.totals &&');
  const tableAt = reports.indexOf('<DataTable');
  // They used to sit after the pager, so on a report long enough to
  // paginate the one number most people came for was off the bottom.
  check('the totals are above the table, not under the pager',
    totalsAt > -1 && tableAt > -1 && totalsAt < tableAt, true);
  check('they sit on the right of the panel header',
    /flex flex-col items-end/.test(reports), true);
  check('money totals are still formatted as money',
    /amount\|value\|revenue\|variance/.test(reports), true);
  check('the generated time stays with them',
    /Generated \{formatDateTime/.test(reports), true);

  console.log('\nmovement stock column');
  const moves = readFileSync('src/app/(admin)/admin/inventory/movements/page.tsx', 'utf8');
  // "55 -> 54" broke wherever the column ran out of room, often between the
  // arrow and the figure it pointed at, giving rows of two different heights.
  check('the before and after stack instead of running across',
    /inline-flex flex-col items-end/.test(moves), true);
  check('nothing is left inline to wrap',
    /\{m\.previousQty\} → /.test(moves), false);
  check('the figures stay aligned as a column',
    /leading-tight tabular/.test(moves), true);
  check('the pair is read as a sentence, not two loose numbers',
    /from \{m\.previousQty\} to \{m\.newQty\}/.test(moves), true);

  console.log('\nthe build needs no third party');
  // next/font/google fetches during `next build`, so a VPS that cannot reach
  // Google fails the deploy outright — which is what happened.
  check('no font is fetched at build time',
    /^import .*from 'next\/font\/google'/m.test(layout), false);
  check('Poppins is served from this repository',
    /from 'next\/font\/local'/.test(layout), true);
  check('every weight the design uses is present',
    ['300', '400', '500', '600', '700']
      .filter((w) => !existsSync(`src/app/fonts/poppins-latin-${w}-normal.woff2`)), []);
  check('the CSS variable is unchanged, so nothing else had to move',
    /variable: '--font-poppins'/.test(layout), true);

  console.log('\nediting an existing product');
  const stockEditor = readFileSync('src/features/products/StockEditor.tsx', 'utf8');
  const suggest = readFileSync('src/features/products/NameSuggestions.tsx', 'utf8');
  check('stock can be corrected after the product exists',
    /<StockEditor/.test(products) || /<StockEditor/.test(form), true);
  // A stock figure that moves with nothing explaining it makes every later
  // count impossible to trust.
  check('a correction needs a reason', /reason\.trim\(\)\.length < 3/.test(stockEditor), true);
  check('it writes a movement rather than overwriting silently',
    /\/inventory\/adjust/.test(stockEditor), true);
  check('raising a batch-tracked product is blocked in the form too',
    /raisingBatched/.test(stockEditor), true);
  check('it is gated on the adjust permission',
    /can\('inventory\.adjust'\)/.test(stockEditor), true);

  console.log('\nadding a product that already half-exists');
  check('typing a name offers what is already in the catalogue',
    /<NameSuggestions/.test(form), true);
  check('picking one copies its details', /costPrice: p\.costPrice/.test(form), true);
  // Copying the SKU or id would make the new product collide with the old.
  check('it copies details, never identity',
    /sku: p\.sku/.test(form) || /id: p\.id/.test(form), false);
  check('the SKU is regenerated for the copied category',
    /setSkuEdited\(false\)/.test(form), true);
  check('suggestions are offered while adding, not while editing',
    /\{!editing && \(\s*<NameSuggestions/.test(form), true);
  // A slow response must not overwrite a newer one.
  check('out-of-order responses are discarded', /ticket !== latest\.current/.test(suggest), true);

  console.log('\nsection switcher');
  check('hidden for sales rep', canUseTill(CASHIER) && canUseBackOffice(CASHIER), false);
  check('hidden for stock controller', canUseTill(STOCK) && canUseBackOffice(STOCK), false);
  check('offered from the back office only', canUseTill(ADMIN) && canUseBackOffice(ADMIN), true);

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll section checks passed.');
} finally {
  rmSync(out, { recursive: true, force: true });
}
