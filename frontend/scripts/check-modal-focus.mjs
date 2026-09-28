/**
 * Regression checks for dialog focus.
 *
 * The bug this guards against: typing in "Actual cash counted" moved focus
 * to the header close button after every keystroke, so the cashier had to
 * click back into the field for each digit.
 *
 * Two independent causes, both covered here as far as a DOM test can:
 *   1. `querySelector('[data-autofocus], input, button')` returns the first
 *      match in DOCUMENT order, so the header's X always won.
 *   2. The focus effect depended on `onClose`, whose identity changes every
 *      render, so it re-ran on every keystroke. (React-level; verified by
 *      the dependency array being `[open]` — asserted by source check below.)
 *
 * Run with: npm run check:modal-focus
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const out = mkdtempSync(join(tmpdir(), 'lorma-focus-'));
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
  execFileSync(
    'npx',
    ['tsc', 'src/components/ui/focus.ts', '--outDir', out,
     '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck'],
    { stdio: 'inherit' },
  );

  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { pickFocusTarget, focusableWithin } = require(join(out, 'focus.js'));

  // The exact shape Modal renders for "Close shift": a close button in the
  // header, then the marked field, then the footer buttons.
  const dom = new JSDOM(`
    <div id="panel" role="dialog">
      <div class="header">
        <h2>Close shift</h2>
        <button id="close" aria-label="Close">x</button>
      </div>
      <div class="body">
        <div class="readout">Expected cash GHS 455.00</div>
        <input id="counted" type="number" data-autofocus />
        <input id="reason" type="text" />
      </div>
      <div class="footer">
        <button id="cancel">Cancel</button>
        <button id="submit">Close shift</button>
      </div>
    </div>
  `);
  const panel = dom.window.document.getElementById('panel');

  console.log('close-shift dialog');

  // The original selector, kept verbatim to prove the diagnosis.
  const legacy = panel.querySelector('[data-autofocus], input, button');
  check('the old single-selector query picked the header close button', legacy.id, 'close');

  check('priority query picks the marked field, not the close button',
    pickFocusTarget(panel).id, 'counted');

  console.log('\npayment dialog (cash tendered — the POS hot path)');
  const pay = new JSDOM(`
    <div id="panel">
      <button id="close">x</button>
      <button id="cash">Cash</button>
      <button id="momo">Mobile Money</button>
      <input id="tendered" type="number" data-autofocus />
      <button id="confirm">Complete sale</button>
    </div>
  `).window.document.getElementById('panel');
  check('picks the tendered field over three earlier buttons',
    pickFocusTarget(pay).id, 'tendered');

  console.log('\nfallbacks');
  const noMark = new JSDOM(`
    <div id="panel"><button id="close">x</button><input id="first"/><input id="second"/></div>
  `).window.document.getElementById('panel');
  check('with nothing marked, falls back to the first field', pickFocusTarget(noMark).id, 'first');

  const buttonsOnly = new JSDOM(`
    <div id="panel"><button id="close">x</button><button id="ok">OK</button></div>
  `).window.document.getElementById('panel');
  check('with no fields, falls back to the first button', pickFocusTarget(buttonsOnly).id, 'close');

  const disabled = new JSDOM(`
    <div id="panel"><input id="off" data-autofocus disabled /><input id="on" /></div>
  `).window.document.getElementById('panel');
  check('skips a disabled marked field', pickFocusTarget(disabled).id, 'on');

  const empty = new JSDOM(`<div id="panel"><p>nothing focusable</p></div>`)
    .window.document.getElementById('panel');
  check('returns null when there is nothing to focus', pickFocusTarget(empty), null);

  console.log('\ntab trap');
  // jsdom reports offsetParent as null for everything, so the active
  // element must still be retained — that is the branch under test.
  const trap = focusableWithin(panel, panel.querySelector('#counted'));
  check('keeps the focused element even when layout reports it hidden',
    trap.map((el) => el.id), ['counted']);

  console.log('\nsource guard');
  const modal = readFileSync('src/components/ui/Modal.tsx', 'utf8');
  check('focus effect depends on `open` alone',
    /const target = pickFocusTarget\(panel\);[\s\S]{0,400}?\}, \[open\]\);/.test(modal), true);
  check('onClose is read through a ref, not a dependency',
    modal.includes('onCloseRef.current()') && !modal.includes('}, [open, onClose]);'), true);

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll modal focus checks passed.');
} finally {
  rmSync(out, { recursive: true, force: true });
}
