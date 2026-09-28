/**
 * Ghanaian mobile numbers, in the shapes people actually type them.
 *
 * A cashier keying a number under time pressure writes 024 123 4567,
 * 0241234567, +233241234567 or 233241234567, and all four mean the same
 * person. They are stored one way so the customer list does not fill with
 * duplicates of the same human being.
 */
const GH_PREFIXES = ['20', '23', '24', '25', '26', '27', '28', '29', '50', '53', '54', '55', '56', '57', '59'];

export interface NormalisedPhone {
  /** 233XXXXXXXXX — what the provider is given and what is stored. */
  e164: string;
  /** 0XXXXXXXXX — what a Ghanaian reads. */
  local: string;
}

export function normaliseGhanaPhone(input: string): NormalisedPhone | null {
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return null;

  let national: string | null = null;

  if (digits.length === 10 && digits.startsWith('0')) {
    national = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith('233')) {
    national = digits.slice(3);
  } else if (digits.length === 9) {
    // Typed without the leading zero.
    national = digits;
  }

  if (!national || national.length !== 9) return null;
  if (!GH_PREFIXES.includes(national.slice(0, 2))) return null;

  return { e164: `233${national}`, local: `0${national}` };
}
