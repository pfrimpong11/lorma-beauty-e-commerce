/**
 * Idle sign-out.
 *
 * Run with: npm run check:idle
 *
 * The clock is driven by hand rather than by waiting, because the two ways
 * this feature fails are both invisible in a quick manual test: firing
 * early interrupts a shop mid-sale, and never firing leaves a till open all
 * night. Both need a fake clock to catch.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

const out = mkdtempSync(join(tmpdir(), 'idle-'));

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/idle-timer.ts', '--outDir', out, '--module', 'es2022',
     '--target', 'es2022', '--moduleResolution', 'bundler'],
    { stdio: 'pipe' },
  );
  const { createIdleTimer } = await import(pathToFileURL(join(out, 'idle-timer.js')).href);

  /** A clock the test advances itself. */
  const makeClock = () => {
    let now = 0;
    let seq = 1;
    const timeouts = new Map();
    const intervals = new Map();
    return {
      api: {
        setTimeout: (fn, ms) => { const id = seq++; timeouts.set(id, { fn, at: now + ms }); return id; },
        clearTimeout: (id) => timeouts.delete(id),
        setInterval: (fn, ms) => { const id = seq++; intervals.set(id, { fn, every: ms, next: now + ms }); return id; },
        clearInterval: (id) => intervals.delete(id),
      },
      advance(ms) {
        const target = now + ms;
        // Step to each due callback in order, so a timer set by a callback
        // is honoured rather than skipped.
        for (;;) {
          let dueAt = Infinity;
          let run = null;
          for (const [id, t] of timeouts) if (t.at <= target && t.at < dueAt) { dueAt = t.at; run = () => { timeouts.delete(id); t.fn(); }; }
          for (const [, i] of intervals) if (i.next <= target && i.next < dueAt) { dueAt = i.next; run = () => { i.next += i.every; i.fn(); }; }
          if (!run) break;
          now = dueAt;
          run();
        }
        now = target;
      },
    };
  };

  const LIMIT = 30 * 60 * 1000;
  const WARN = 60 * 1000;

  const scenario = () => {
    const clock = makeClock();
    const events = [];
    const timer = createIdleTimer({
      limitMs: LIMIT,
      warningMs: WARN,
      onWarn: () => events.push('warn'),
      onTick: (s) => events.push(`tick:${s}`),
      onExpire: () => events.push('expire'),
      ...clock.api,
    });
    return { clock, events, timer };
  };

  console.log('\nthirty minutes means thirty minutes');
  {
    const { clock, events, timer } = scenario();
    timer.start();
    clock.advance(LIMIT - WARN - 1000);
    check('quiet until the warning is due', events, []);
    clock.advance(1000);
    check('warns with a minute to go', events.includes('warn'), true);
    check('and has not signed out yet', events.includes('expire'), false);
    clock.advance(WARN);
    check('signs out exactly at the limit', events.includes('expire'), true);
  }

  console.log('\nactivity resets the clock');
  {
    const { clock, events, timer } = scenario();
    timer.start();
    for (let i = 0; i < 10; i++) {
      clock.advance(LIMIT - WARN - 1000);
      timer.start();            // a keypress, a scan, a tap
    }
    check('five hours of use never warns', events, []);
    clock.advance(LIMIT);
    check('but going quiet still signs out', events.includes('expire'), true);
  }

  console.log('\nthe countdown is honest');
  {
    const { clock, events, timer } = scenario();
    timer.start();
    clock.advance(LIMIT - WARN);
    clock.advance(3000);
    const ticks = events.filter((e) => e.startsWith('tick:')).map((e) => Number(e.slice(5)));
    check('counts down from sixty', ticks[0], 60);
    check('one second at a time', ticks.slice(0, 4), [60, 59, 58, 57]);
    check('never shows a negative', ticks.every((t) => t >= 0), true);
  }

  console.log('\nstaying signed in actually works');
  {
    const { clock, events, timer } = scenario();
    timer.start();
    clock.advance(LIMIT - WARN);
    check('warning is up', timer.isWarning(), true);
    timer.start();                       // "Stay signed in"
    check('the warning is cleared', timer.isWarning(), false);
    clock.advance(LIMIT - WARN - 1000);
    check('and a full period is granted again', events.includes('expire'), false);
  }

  console.log('\nstopping means stopping');
  {
    const { clock, events, timer } = scenario();
    timer.start();
    timer.stop();
    clock.advance(LIMIT * 3);
    check('a stopped timer never fires', events, []);
  }

  console.log('\nwired into the app');
  const hook = readFileSync('src/hooks/useIdleLogout.ts', 'utf8');
  check('thirty minutes', /IDLE_LIMIT_MS = 30 \* 60 \* 1000/.test(hook), true);
  // An unfinished sale must survive: nobody is there to answer a dialog.
  check('an unfinished sale is held, not lost', /cart\.lines\.length > 0\) cart\.hold\(\)/.test(hook), true);
  // Inspect the event list, not the prose around it: the comment above it
  // names mousemove precisely to say it is excluded.
  const activity = (hook.match(/const ACTIVITY = \[([^\]]*)\]/) ?? [, ''])[1];
  check('idle means no input, not no movement', /mousemove/.test(activity), false);
  check('a scan counts as presence', /keydown/.test(activity), true);
  check('a touch screen counts too', /touchstart/.test(activity), true);
  check('a scanner left on the counter cannot cancel the warning',
    /if \(warningRef\.current\) return;/.test(hook), true);
  for (const shell of ['TillShell', 'AdminShell']) {
    const src = readFileSync(`src/components/shell/${shell}.tsx`, 'utf8');
    check(`${shell} mounts it only once signed in`,
      /<IdleWarning enabled=\{status === 'authenticated'\} \/>/.test(src), true);
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll idle sign-out checks passed.');
} finally {
  rmSync(out, { recursive: true, force: true });
}
