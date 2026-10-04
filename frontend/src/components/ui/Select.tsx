'use client';

import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: Array<{ value: string; label: string }>;
  /**
   * Options under headings, for a list long enough that one flat run of
   * them is slower to read than a few short ones. Used instead of
   * `options`, not alongside it.
   */
  groups?: Array<{ label: string; options: string[] }>;
  placeholder?: string;
  /**
   * A final entry that stands for "none of these". Kept separate from the
   * options so it always sorts last and can never be mistaken for a real
   * choice by code that reads the groups.
   */
  otherValue?: string;
  otherLabel?: string;
  /** Explanatory line below the control, as Input has. */
  hint?: string;
  /** Classes for the wrapper; `className` lands on the select itself. */
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    error,
    options,
    groups,
    otherValue,
    otherLabel,
    placeholder,
    hint,
    wrapperClassName,
    className,
    id,
    ...props
  },
  ref,
) {
  const generated = useId();
  const selectId = id ?? generated;

  return (
    <div className={cn('w-full', wrapperClassName)}>
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
          {props.required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        className={cn(
          'h-10 w-full appearance-none rounded-lg border bg-surface px-3 pr-9 text-sm text-ink',
          'bg-[length:16px] bg-[right_0.65rem_center] bg-no-repeat transition-colors',
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238A8187' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
          error ? 'border-danger' : 'border-line hover:border-brand-300',
          className,
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {groups
          ? groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </optgroup>
            ))
          : (options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
        {otherValue && <option value={otherValue}>{otherLabel ?? 'Other…'}</option>}
      </select>
      {error ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
});
