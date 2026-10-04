/**
 * The clock behind the idle sign-out.
 *
 * Kept free of React so it can be tested with a fake clock: an auto
 * sign-out that fires early interrupts a shop, and one that never fires is
 * decoration. Neither is something to find out in production.
 */
export interface IdleTimerOptions {
  /** Total idle time before the session ends, warning included. */
  limitMs: number;
  /** How much of that is spent showing the warning. */
  warningMs: number;
  /** Called once, when the warning should appear. */
  onWarn: () => void;
  /** Called each second while the warning shows, with whole seconds left. */
  onTick: (secondsLeft: number) => void;
  /** Called when the time runs out. */
  onExpire: () => void;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

export interface IdleTimer {
  /** Start, or restart, the idle period. */
  start: () => void;
  stop: () => void;
  /** True once the warning has appeared and before it expires. */
  isWarning: () => boolean;
}

export function createIdleTimer(options: IdleTimerOptions): IdleTimer {
  const setT = options.setTimeout ?? globalThis.setTimeout;
  const clearT = options.clearTimeout ?? globalThis.clearTimeout;
  const setI = options.setInterval ?? globalThis.setInterval;
  const clearI = options.clearInterval ?? globalThis.clearInterval;

  let idleHandle: ReturnType<typeof setT> | null = null;
  let tickHandle: ReturnType<typeof setI> | null = null;
  let warning = false;

  const stop = () => {
    if (idleHandle !== null) clearT(idleHandle);
    if (tickHandle !== null) clearI(tickHandle);
    idleHandle = null;
    tickHandle = null;
    warning = false;
  };

  const start = () => {
    stop();

    // The warning occupies the tail of the limit rather than extending it:
    // "thirty minutes" should mean the session ends at thirty minutes, not
    // at thirty-one.
    idleHandle = setT(() => {
      warning = true;
      let remaining = Math.round(options.warningMs / 1000);
      options.onWarn();
      options.onTick(remaining);

      tickHandle = setI(() => {
        remaining -= 1;
        options.onTick(Math.max(0, remaining));
        if (remaining <= 0) {
          stop();
          options.onExpire();
        }
      }, 1000);
    }, Math.max(0, options.limitMs - options.warningMs));
  };

  return { start, stop, isWarning: () => warning };
}
