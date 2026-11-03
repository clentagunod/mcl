import { useState, type FormEvent } from 'react';
import { FormField } from '../../components/FormField';
import { Modal } from '../../components/Modal';
import { LOAN_TERMS } from '../../config/app';
import { useData } from '../../context/DataContext';
import { describeError } from '../../lib/errors';
import { formatPeso, parseMoneyOrZero } from '../../lib/money';
import {
  validateClientForm,
  type ClientFormValues,
  type FieldErrors,
} from '../../lib/validation';
import { addClient, updateClient } from '../../services/clients';
import type { Client } from '../../types';
import { dailyPayable } from '../../lib/printables';
import { useSettings } from '../../context/SettingsContext';

interface ClientFormModalProps {
  /** Pass a client to edit it; leave out to add a new one. */
  client?: Client;
  onClose: () => void;
}

export function ClientFormModal({ client, onClose }: ClientFormModalProps) {
  const [openedClient] = useState(client);
  const { today } = useData();
  const { loading: settingsLoading, error: settingsError } = useSettings();
  const [values, setValues] = useState<ClientFormValues>(() => ({
    lastName: client?.lastName ?? '',
    firstName: client?.firstName ?? '',
    middleName: client?.middleName ?? '',
    address: client?.address ?? '',
    cellphone: client?.cellphone ?? '',
    principal: client ? String(client.principal) : '',
    interest: client ? String(client.interest) : '',
    loanTermDays: client ? String(client.loanTermDays) : String(LOAN_TERMS[0]),
    approvalDate: client?.approvalDate ?? today,
    dailyAmount: client ? String(dailyPayable(client)) : '',
  }));
  const [errors, setErrors] = useState<FieldErrors<ClientFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function bind(field: keyof ClientFormValues) {
    return {
      value: values[field],
      onChange: (event: { target: { value: string } }) =>
        setValues((previous) => ({ ...previous, [field]: event.target.value })),
    };
  }

  // Live preview of what the client will owe: principal + the fixed interest amount.
  const totalPayable = parseMoneyOrZero(values.principal) + parseMoneyOrZero(values.interest);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const result = validateClientForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      if (openedClient) await updateClient(openedClient.id, result.value, openedClient);
      else await addClient(result.value);
      onClose();
    } catch (caught) {
      setFormError(describeError(caught));
      setBusy(false);
    }
  }

  return (
    <Modal title={client ? 'Edit client' : 'Add client'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} noValidate>
        {client && <p className="muted small">Client ID: {client.clientNumber || client.id} · Transaction: {client.transactionNumber || 'Pending allocation'}</p>}
        {!client && settingsError && <p className="alert alert-error" role="alert">Client number allocation requires Firebase settings access. {settingsError}</p>}
        <fieldset disabled={busy}>
          <legend>Loaner information</legend>
          <div className="form-grid">
            <FormField label="Last name" error={errors.lastName}>
              <input type="text" autoComplete="off" {...bind('lastName')} />
            </FormField>
            <FormField label="First name" error={errors.firstName}>
              <input type="text" autoComplete="off" {...bind('firstName')} />
            </FormField>
            <FormField label="Middle name (optional)" error={errors.middleName}>
              <input type="text" autoComplete="off" {...bind('middleName')} />
            </FormField>
            <FormField label="Cellphone number" error={errors.cellphone}>
              <input type="tel" inputMode="tel" autoComplete="off" placeholder="09171234567" {...bind('cellphone')} />
            </FormField>
          </div>
          <FormField label="Permanent address" error={errors.address}>
            <input type="text" autoComplete="off" {...bind('address')} />
          </FormField>
        </fieldset>

        <fieldset disabled={busy}>
          <legend>Loan details</legend>
          <div className="form-grid">
            <FormField label="Principal amount (₱)" error={errors.principal}>
              <input type="number" inputMode="decimal" min="0" step="0.01" {...bind('principal')} />
            </FormField>
            <FormField
              label="Fixed interest (₱)"
              error={errors.interest}
              hint="A fixed peso amount you decide, not a percentage."
            >
              <input type="number" inputMode="decimal" min="0" step="0.01" {...bind('interest')} />
            </FormField>
            <FormField label="Type of loan" error={errors.loanTermDays}>
              <select {...bind('loanTermDays')}>
                {LOAN_TERMS.map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Date of approval" error={errors.approvalDate} hint="Day counting starts from this date.">
              <input type="date" {...bind('approvalDate')} />
            </FormField>
            <FormField label="Daily payable amount (₱)" error={errors.dailyAmount} hint="Saved on the client and used by the print templates.">
              <input type="number" inputMode="decimal" min="0.01" step="0.01" {...bind('dailyAmount')} />
            </FormField>
            <div className="field"><span className="field-hint">Suggested from total ÷ term, rounded up to the nearest centavo.</span><button type="button" className="btn btn-small" onClick={() => setValues((previous) => ({ ...previous, dailyAmount: String(Math.ceil(totalPayable / Number(previous.loanTermDays) * 100) / 100) }))}>Use suggested daily amount</button></div>
          </div>
          <p className="summary-line">
            Total to pay (principal + interest): <strong>{formatPeso(totalPayable)}</strong>
          </p>
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
          <button type="submit" className="btn btn-primary" disabled={busy || (!client && (settingsLoading || !!settingsError))}>
            {busy ? 'Saving…' : client ? 'Save changes' : 'Add client'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
