'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Named `leading`/`trailing` rather than prefix/suffix: `prefix` is a
   *  real HTML attribute typed as string and cannot be widened. */
  leading?: ReactNode;
  trailing?: ReactNode;
  /**
   * Classes for the wrapper rather than the input.
   *
   * `className` lands on the <input>, so setting a width there does
   * nothing — the wrapper is w-full and the field still fills its row.
   * That is what made side-by-side filters stack.
   */
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leading, trailing, className, wrapperClassName, id, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cn('w-full', wrapperClassName)}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
          {props.required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}

      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-10 w-full rounded-lg border bg-surface px-3 text-sm text-ink transition-colors',
            'placeholder:text-ink-subtle disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60',
            leading && 'pl-9',
            trailing && 'pr-9',
            error ? 'border-danger' : 'border-line hover:border-brand-300',
            className,
          )}
          {...props}
        />
        {trailing && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle">{trailing}</span>
        )}
      </div>

      {/* Errors are announced, not just coloured (§43) */}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-ink-subtle">
          {hint}
        </p>
      )}
    </div>
  );
});
