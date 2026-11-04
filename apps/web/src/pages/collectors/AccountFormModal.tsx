import { useState, type FormEvent } from 'react';
import { FormField } from '../../components/FormField';
import { Modal } from '../../components/Modal';
import { Icon } from '../../components/Icon';
import { ACCOUNT_MIN_PASSWORD_LENGTH } from '../../config/app';
import { describeError } from '../../lib/errors';
import { validateAccountForm, type AccountFormValues, type FieldErrors } from '../../lib/validation';
import { createAccount, updateAccount } from '../../services/accounts';
import type { ManagedUserProfile, ManagedUserRole } from '../../types';

type AccountFormModalProps = {
  onClose: () => void;
} & ({ account: ManagedUserProfile; role?: never } | { account?: never; role: ManagedUserRole });

export function AccountFormModal({ account, role, onClose }: AccountFormModalProps) {
  const isEditing = account !== undefined;
  const accountRole = account !== undefined ? account.role : role;
  const roleLabel = accountRole === 'admin' ? 'admin' : 'collector';
  const [values, setValues] = useState<AccountFormValues>({
    role: accountRole,
    fullName: account?.fullName ?? '',
    email: account?.email ?? '',
    phone: account?.phone ?? '',
    password: '',
  });
  const [errors, setErrors] = useState<FieldErrors<AccountFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function bind(field: Exclude<keyof AccountFormValues, 'role'>) {
    return {
      value: values[field],
      onChange: (event: { target: { value: string } }) =>
        setValues((previous) => ({ ...previous, [field]: event.target.value })),
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);

    const result = validateAccountForm(values, { requireCredentials: !isEditing });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      if (account) {
        await updateAccount(account.uid, { fullName: result.value.fullName, phone: result.value.phone });
      } else {
        await createAccount(result.value);
      }
      onClose();
    } catch (caught) {
      setFormError(describeError(caught));
      setBusy(false);
    }
  }

  return (
    <Modal title={`${isEditing ? 'Edit' : 'Add'} ${roleLabel}`} onClose={onClose} dismissible={!busy}>
      <form className="account-form" onSubmit={handleSubmit} noValidate>
        <fieldset disabled={busy}>
          <div className="account-access-panel"><Icon name={accountRole === 'admin' ? 'shield' : 'users'} /><div><strong>{accountRole === 'admin' ? 'Workspace administrator' : 'Collection team member'}</strong><p className="muted small">
            {accountRole === 'admin'
              ? 'Admins have full access to this website, including managing collector and admin accounts.'
              : 'Collectors sign in on the Android app. They cannot sign in to this website.'}
          </p></div></div>
          <div className="form-grid">
          <FormField label="Full name" error={errors.fullName}>
            <input type="text" autoComplete="off" {...bind('fullName')} />
          </FormField>
          <FormField label="Cellphone number (optional)" error={errors.phone}>
            <input type="tel" inputMode="tel" autoComplete="off" placeholder="09171234567" {...bind('phone')} />
          </FormField>
          </div>

          {isEditing ? (
            <p className="muted small">
              Login email: <strong>{account.email}</strong>. The email cannot be changed here. To change the password, use
              “Reset password” in the list.
            </p>
          ) : (
            <div className="account-form-group"><h3>Sign-in credentials</h3>
              <FormField
                label="Login email"
                error={errors.email}
                hint={`The ${roleLabel} signs in ${accountRole === 'admin' ? 'to this website' : 'on the Android app'} with this email.`}
              >
                <input type="email" autoComplete="off" {...bind('email')} />
              </FormField>
              <FormField
                label="Password"
                error={errors.password}
                hint={`At least ${ACCOUNT_MIN_PASSWORD_LENGTH} characters. Share it with the ${roleLabel} privately.`}
              >
                <input type="password" autoComplete="new-password" {...bind('password')} />
              </FormField>
            </div>
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
