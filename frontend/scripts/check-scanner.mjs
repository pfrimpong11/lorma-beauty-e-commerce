/**
 * Keyboard-wedge decoder checks.
 *
 * The FR20's default mode makes it indistinguishable from a keyboard, so
 * the decoder separates scans from typing purely on timing. That makes it
 * the riskiest code in the integration and the most worth pinning down:
 * too eager and it eats the cashier's typing, too lax and scans are
 * missed mid-queue.
 *
 * `performance.now` is stubbed so bursts can be delivered at exact,
 * repeatable speeds rather than whatever the machine happens to manage.
 *
 * Run with: npm run check:scanner
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const out = mkdtempSync(join(tmpdir(), 'lorma-scanner-'));
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
  execFileSync(
    'npx',
    ['tsc', 'src/lib/scanner/keyboard.ts', '--outDir', out,
     '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck'],
    { stdio: 'inherit' },
  );

  const dom = new JSDOM('<!doctype html><body><input id="search" /><input id="bc" data-barcode-input /></body>', {
    pretendToBeVisual: true,
  });

  // A clock we drive, so "fast" and "slow" mean exactly what we say.
  let clock = 0;
  const win = dom.window;
  win.performance.now = () => clock;

  global.window = win;
  global.document = win.document;
  global.performance = win.performance;
  global.KeyboardEvent = win.KeyboardEvent;
  // Node's own timers are left in place: jsdom's window.setTimeout
  // delegates to the global one, so reassigning it recurses forever.

  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { KeyboardWedge, stripAffixes } = require(join(out, 'keyboard.js'));

  const CONFIG = {
    transport: 'auto',
    minLength: 4,
    maxKeyIntervalMs: 40,
    duplicateWindowMs: 500,
    prefix: '',
    suffix: '',
    terminators: ['Enter', 'Tab'],
    idleCompleteMs: 90,
    sound: false,
  };

  /** Type `text` at `gapMs` per character, then optionally a terminator. */
  const type = (text, gapMs, terminator, target) => {
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

  const withWedge = async (fn, config = CONFIG) => {
    const scans = [];
    const wedge = new KeyboardWedge(config, (e) => scans.push(e));
    wedge.start();
    await fn(scans);
    wedge.stop();
    return scans;
  };

  console.log('reading a scan');
  let scans = await withWedge(() => type('6001234500017', 4, 'Enter'));
  check('fast burst ending in Enter is a scan', scans.map((s) => s.code), ['6001234500017']);
  check('reports the burst duration', scans[0].durationMs > 0, true);
  check('tagged as the keyboard transport', scans[0].transport, 'keyboard');

  scans = await withWedge(() => type('6001234500024', 3, 'Tab'));
  check('Tab also terminates a scan', scans.map((s) => s.code), ['6001234500024']);

  console.log('\nnot a scan');
  scans = await withWedge(() => type('vitamin c', 150, 'Enter'));
  check('human typing followed by Enter is ignored', scans, []);

  scans = await withWedge(() => type('99', 3, 'Enter'));
  check('a read shorter than the minimum is ignored', scans, []);

  scans = await withWedge(() => {
    win.document.body.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    type('6001234500017', 4, 'Enter');
  });
  check('a shortcut before a scan does not corrupt it', scans.map((s) => s.code), ['6001234500017']);

  console.log('\nscanner configured with no suffix');
  scans = await withWedge(async (collected) => {
    type('6001234500031', 4);           // no terminator at all
    check('nothing emitted before the idle window', collected.length, 0);
    await sleep(160);                    // real time, for the idle timer
  });
  check('completes on the idle timer', scans.map((s) => s.code), ['6001234500031']);

  console.log('\nprefix and suffix');
  const affixed = { ...CONFIG, prefix: '$', suffix: '#' };
  scans = await withWedge(() => type('$6001234500048#', 4, 'Enter'), affixed);
  check('strips a configured prefix and suffix', scans.map((s) => s.code), ['6001234500048']);
  check('keeps the raw read for diagnostics', scans[0].raw, '$6001234500048#');

  check('stripAffixes removes a trailing CR', stripAffixes('6001234500017\r', CONFIG), '6001234500017');
  check('stripAffixes removes CRLF', stripAffixes('6001234500017\r\n', CONFIG), '6001234500017');
  check('stripAffixes leaves a clean code alone', stripAffixes('6001234500017', CONFIG), '6001234500017');

  console.log('\nfocus behaviour');
  const search = win.document.getElementById('search');
  scans = await withWedge(() => type('6001234500055', 4, 'Enter', search));
  check('a scan is captured even while a text field has focus',
    scans.map((s) => s.code), ['6001234500055']);

  const barcodeField = win.document.getElementById('bc');
  scans = await withWedge(() => type('6001234500062', 4, 'Enter', barcodeField));
  check('the dedicated barcode field handles its own input',
    scans, []);

  scans = await withWedge(() => type('serum', 150, null, search));
  check('typing in a search box is never consumed', scans, []);

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll scanner checks passed.');
} finally {
  rmSync(out, { recursive: true, force: true });
}
