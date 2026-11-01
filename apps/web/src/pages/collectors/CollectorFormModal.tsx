import { useState, type FormEvent } from 'react';
import { FormField } from '../../components/FormField';
import { Modal } from '../../components/Modal';
import { COLLECTOR_MIN_PASSWORD_LENGTH } from '../../config/app';
import { describeError } from '../../lib/errors';
import { validateCollectorForm, type CollectorFormValues, type FieldErrors } from '../../lib/validation';
import { createCollector, updateCollector } from '../../services/collectors';
import type { UserProfile } from '../../types';

interface CollectorFormModalProps {
  /** Pass a collector to edit; leave out to create a new account. */
  collector?: UserProfile;
  onClose: () => void;
}

export function CollectorFormModal({ collector, onClose }: CollectorFormModalProps) {
  const isEditing = collector !== undefined;
  const [values, setValues] = useState<CollectorFormValues>({
    fullName: collector?.fullName ?? '',
    email: collector?.email ?? '',
    phone: collector?.phone ?? '',
    password: '',
  });
  const [errors, setErrors] = useState<FieldErrors<CollectorFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function bind(field: keyof CollectorFormValues) {
    return {
      value: values[field],
      onChange: (event: { target: { value: string } }) =>
        setValues((previous) => ({ ...previous, [field]: event.target.value })),
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const result = validateCollectorForm(values, { requireCredentials: !isEditing });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      if (collector) {
        await updateCollector(collector.uid, { fullName: result.value.fullName, phone: result.value.phone });
      } else {
        await createCollector(result.value);
      }
      onClose();
    } catch (caught) {
      setFormError(describeError(caught));
      setBusy(false);
    }
  }

  return (
    <Modal title={isEditing ? 'Edit collector' : 'Add collector'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <fieldset disabled={busy}>
          <FormField label="Full name" error={errors.fullName}>
            <input type="text" autoComplete="off" {...bind('fullName')} />
          </FormField>
          <FormField label="Cellphone number (optional)" error={errors.phone}>
            <input type="tel" inputMode="tel" autoComplete="off" placeholder="09171234567" {...bind('phone')} />
          </FormField>

          {isEditing ? (
            <p className="muted small">
              Login email: <strong>{collector.email}</strong>. The email cannot be changed here. To change the password, use
              “Reset password” in the list.
            </p>
          ) : (
            <>
              <FormField
                label="Login email"
                error={errors.email}
                hint="The collector signs in on the Android app with this email."
              >
                <input type="email" autoComplete="off" {...bind('email')} />
              </FormField>
              <FormField
                label="Password"
                error={errors.password}
                hint={`At least ${COLLECTOR_MIN_PASSWORD_LENGTH} characters. Share it with the collector privately.`}
              >
                <input type="password" autoComplete="new-password" {...bind('password')} />
              </FormField>
            </>
          )}
        </fieldset>

        {formError && (
          <p className="alert alert-error" role="alert">
            {formError}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isEditing ? 'Save changes' : 'Create account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
