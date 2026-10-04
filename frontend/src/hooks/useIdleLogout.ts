'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createIdleTimer, type IdleTimer } from '@/lib/idle-timer';
import { useAuth } from '@/store/auth';
import { useCart } from '@/store/cart';

/** Thirty minutes of no input at all. */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;
/** How long the warning stands before the session actually ends. */
export const IDLE_WARNING_MS = 60 * 1000;

/**
 * Activity worth counting.
 *
 * Deliberately not `mousemove`: a till sits under shop lights with a
 * scanner plugged in, and a nudged counter would keep a session alive all
 * night. These are things a person did on purpose.
 *
 * `keydown` covers the barcode scanner too, which types — so scanning
 * counts as being present, which it is.
 */
const ACTIVITY = ['mousedown', 'keydown', 'touchstart', 'wheel'] as const;

export interface IdleState {
  /** True once the warning is showing and the countdown has started. */
  warning: boolean;
  /** Whole seconds left before the session ends. */
  secondsLeft: number;
  /** Dismiss the warning and start the clock again. */
  staySignedIn: () => void;
}

/**
 * Sign out after a spell of inactivity.
 *
 * A till is left unattended on a shop counter, so a session that never
 * expires is a till anyone can walk up to and use. Thirty minutes is long
 * enough not to interrupt a quiet afternoon and short enough that a
 * forgotten terminal does not stay open until morning.
 *
 * A warning comes first, because being signed out with no explanation
 * mid-task reads as a fault. And an unfinished sale is held rather than
 * discarded — held sales survive sign-out, so the cashier comes back to
 * their basket instead of rebuilding it.
 */
export function useIdleLogout(enabled: boolean): IdleState {
  const logout = useAuth((s) => s.logout);
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.round(IDLE_WARNING_MS / 1000));

  // Held in refs so the listeners below never need re-attaching, and so a
  // re-render cannot restart the clock.
  const timer = useRef<IdleTimer | null>(null);
  const warningRef = useRef(false);
  warningRef.current = warning;

  const signOut = useCallback(async () => {
    timer.current?.stop();
    setWarning(false);

    /*
     * Nobody is here to answer a dialog, so an unfinished sale is held
     * rather than lost. Reading the store directly keeps this callback
     * stable — subscribing to the cart would re-attach every listener on
     * each scan.
     */
    const cart = useCart.getState();
    if (cart.lines.length > 0) cart.hold();

    await logout();
  }, [logout]);

  const start = useCallback(() => {
    setWarning(false);
    setSecondsLeft(Math.round(IDLE_WARNING_MS / 1000));
    timer.current?.start();
  }, []);

  useEffect(() => {
    if (!enabled) {
      timer.current?.stop();
      return;
    }

    timer.current = createIdleTimer({
      limitMs: IDLE_LIMIT_MS,
      warningMs: IDLE_WARNING_MS,
      onWarn: () => setWarning(true),
      onTick: setSecondsLeft,
      onExpire: () => void signOut(),
    });
    timer.current.start();

    const onActivity = () => {
      // While the warning is up, only the button dismisses it. Otherwise a
      // stray keypress from a scanner left on the counter would cancel a
      // sign-out that is the whole point of this.
      if (warningRef.current) return;
      timer.current?.start();
    };

    for (const event of ACTIVITY) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    const current = timer.current;
    return () => {
      for (const event of ACTIVITY) window.removeEventListener(event, onActivity);
      current.stop();
    };
  }, [enabled, signOut]);

  return {
    warning,
    secondsLeft: Math.max(0, secondsLeft),
    staySignedIn: start,
  };
}
