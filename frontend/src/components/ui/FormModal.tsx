'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { ApiError } from '@/lib/api';

/**
 * A dialog wrapping a form.
 *
 * Exists so every admin form handles failure the same way: the API's
 * field-level `details` land next to the fields that caused them, and
 * anything else becomes one plain sentence at the top. Without this each
 * screen reinvents error handling and most of them get it slightly wrong.
 */
export function FormModal({
  open,
  onClose,
  title,
  description,
  submitLabel = 'Save',
  submitTone = 'primary',
  onSubmit,
  children,
  size = 'md',
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  submitLabel?: string;
  submitTone?: 'primary' | 'danger';
  /** Throw to keep the dialog open; resolve to close it. */
  onSubmit: () => Promise<void>;
  children: (fieldError: (field: string) => string | undefined) => ReactNode;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (open) {
      setMessage(null);
      setDetails({});
    }
  }, [open]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (submitting || disabled) return;

    setSubmitting(true);
    setMessage(null);
    setDetails({});

    try {
      await onSubmit();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message);
        setDetails(error.details ?? {});
      } else {
        setMessage('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (field: string) => details[field]?.[0];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={submitTone}
            onClick={() => void submit()}
            loading={submitting}
            disabled={disabled}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {message && (
          <div
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm font-medium text-danger"
          >
            {message}
          </div>
        )}
        {children(fieldError)}
        {/* Lets Enter submit without a visible duplicate button. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
