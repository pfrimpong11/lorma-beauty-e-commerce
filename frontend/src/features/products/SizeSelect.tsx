'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { availableSizes, ALL_SIZES } from './sizes';

/** Sentinel for the dropdown entry that reveals the text field. */
const OTHER = '__other__';

/**
 * Choosing a size, with room for one the list does not have.
 *
 * The preset list covers a skincare range's usual shapes, but a supplier
 * will eventually ship a 75ml or a 2L, and a closed list would mean such a
 * product simply cannot be entered. The escape hatch is deliberately not
 * the default: a free text box invites "Large", "large" and "LARGE" as
 * three different sizes, which is exactly what the list prevents.
 *
 * One component for all four places a size is picked, so they cannot drift
 * into offering different options for the same field.
 */
export function SizeSelect({
  label,
  value,
  onChange,
  taken = [],
  placeholder = 'Choose a size…',
  hint,
  error,
  required,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (size: string) => void;
  /** Labels already used in this group, which are not offered again. */
  taken?: Array<string | null | undefined>;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  // A value that is not one of the presets must have been typed, so the
  // control opens in the state that can show it — editing an existing
  // custom size should not look like nothing is selected.
  const [custom, setCustom] = useState(() => value !== '' && !ALL_SIZES.includes(value));
  const customRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (custom) customRef.current?.focus();
  }, [custom]);

  const groups = availableSizes(taken);

  return (
    <div>
      {custom ? (
        <Input
          ref={customRef}
          label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 75ml, 2L, Travel size"
          maxLength={40}
          hint={hint}
          error={error}
          required={required}
        />
      ) : (
        <Select
          label={label}
          value={value}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              // Clear first: the box should be empty to type into, not
              // holding whatever was selected a moment ago.
              onChange('');
              setCustom(true);
              return;
            }
            onChange(e.target.value);
          }}
          groups={groups}
          otherValue={OTHER}
          otherLabel="Other — type it in…"
          placeholder={placeholder}
          hint={hint}
          error={error}
          required={required}
          autoFocus={autoFocus}
        />
      )}

      {custom && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            setCustom(false);
          }}
          className="mt-1.5 text-xs text-ink-subtle underline-offset-2 hover:text-ink hover:underline"
        >
          Choose from the list instead
        </button>
      )}
    </div>
  );
}
