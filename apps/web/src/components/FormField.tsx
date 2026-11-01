import { cloneElement, useId, type ReactElement } from 'react';

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  /** A single input/select element. The label and error text are wired to it automatically. */
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}

export function FormField({ label, error, hint, children }: FormFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': message ? messageId : undefined,
      })}
      {message && (
        <p id={messageId} className={error ? 'field-error' : 'field-hint'}>
          {message}
        </p>
      )}
    </div>
  );
}
