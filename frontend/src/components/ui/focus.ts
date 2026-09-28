/**
 * Where focus should land when a dialog opens.
 *
 * Extracted from Modal so the rule is testable — see
 * scripts/check-modal-focus.mjs.
 *
 * The rule is a PRIORITY order, deliberately not a single selector list.
 * `querySelector('[data-autofocus], input, button')` returns the first
 * element in DOCUMENT order that matches any branch, so the close button
 * in a dialog's header always beat the field the caller had marked with
 * data-autofocus.
 */
export function pickFocusTarget(panel: HTMLElement): HTMLElement | null {
  return (
    panel.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ??
    panel.querySelector<HTMLElement>(
      'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])',
    ) ??
    panel.querySelector<HTMLElement>('button:not([disabled])')
  );
}

/**
 * Elements the Tab trap may cycle through.
 *
 * Hidden elements are excluded so tabbing does not appear to stall on a
 * control the user cannot see; whatever currently holds focus is always
 * kept, even if it reports as hidden mid-animation.
 */
export function focusableWithin(panel: HTMLElement, active: Element | null): HTMLElement[] {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null || el === active);
}
