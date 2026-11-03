import { useEffect, useState, type FormEvent } from 'react';
import { FormField } from '../../components/FormField';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { LOAN_TERMS } from '../../config/app';
import { formatDate, formatDateTime } from '../../lib/dates';
import { describeError } from '../../lib/errors';
import { formatClientName } from '../../lib/loan';
import { formatPeso } from '../../lib/money';
import { dailyPayable } from '../../lib/printables';
import { hasGoodRenewalHistory, renewalEligibility, validateRenewalTerms } from '../../lib/renewal';
import { renewClient, subscribeRenewals } from '../../services/renewals';
import type { Client, RenewalRecord } from '../../types';
import { loanId } from '../../lib/loan-cycle';

function useRenewalHistory(client: Client | undefined) {
  const [records, setRecords] = useState<RenewalRecord[]>([]);
  const [loading, setLoading] = useState(!!client?.renewalCount);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const id = client?.id;
  const count = client?.renewalCount || 0;
  useEffect(() => {
    setRecords([]); setError(''); setLoading(!!count);
    if (!id || !count) return;
    return subscribeRenewals(id, (next) => { setRecords(next); setLoading(false); }, (caught) => { setError(describeError(caught)); setLoading(false); });
  }, [id, count, retry]);
  return { records, loading, error, retry: () => setRetry((n) => n + 1) };
}

export function RenewalTimeline({ records }: { records: readonly RenewalRecord[] }) {
  return <ol className="renewal-timeline">{records.map((record) => <li key={record.id}>
    <div className="renewal-heading"><strong>Renewal {record.sequence} · Transaction {record.newLoan.transactionNumber}</strong><span>{formatDateTime(record.createdAt)}</span></div>
    <p>Granted by <strong>{record.approvedByName}</strong> · {record.approvedBy}</p>
    <dl className="summary-grid">
      <div><dt>New principal</dt><dd>{formatPeso(record.newLoan.principal)}</dd></div>
      <div><dt>Fixed interest</dt><dd>{formatPeso(record.newLoan.interest)}</dd></div>
      <div><dt>Total payable</dt><dd>{formatPeso(record.newLoan.principal + record.newLoan.interest)}</dd></div>
      <div><dt>Daily payable</dt><dd>{formatPeso(dailyPayable(record.newLoan))}</dd></div>
      <div><dt>Approval / tracking starts</dt><dd>{formatDate(record.newLoan.approvalDate)}</dd></div>
      <div><dt>Loan term</dt><dd>{record.newLoan.loanTermDays} collection days</dd></div>
      <div><dt>New due date at approval</dt><dd>{formatDate(record.newDueDate)}</dd></div>
    </dl>
    <details><summary>Previous loan · Transaction {record.previousLoan.transactionNumber}</summary>
      <dl className="summary-grid">
        <div><dt>Principal</dt><dd>{formatPeso(record.previousLoan.principal)}</dd></div>
        <div><dt>Fixed interest</dt><dd>{formatPeso(record.previousLoan.interest)}</dd></div>
        <div><dt>Daily payable</dt><dd>{formatPeso(dailyPayable(record.previousLoan))}</dd></div>
        <div><dt>Term / approved</dt><dd>{record.previousLoan.loanTermDays} days · {formatDate(record.previousLoan.approvalDate)}</dd></div>
        <div><dt>Total paid</dt><dd>{formatPeso(record.totalPaid)}</dd></div>
        <div><dt>Fully settled</dt><dd>{formatDate(record.paidOn)}</dd></div>
        <div><dt>Due date</dt><dd>{formatDate(record.dueDate)}</dd></div>
        <div><dt>Closing balance</dt><dd>{formatPeso(0)}</dd></div>
      </dl>
    </details>
    {record.notes && <p className="renewal-notes"><strong>Admin notes:</strong> {record.notes}</p>}
  </li>)}</ol>;
}

export function RenewalHistoryModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { clients, payments } = useData();
  const client = clients.find((c) => c.id === clientId);
  const history = useRenewalHistory(client);
  if (!client) return null;
  return <Modal title={`Renewal history — ${formatClientName(client)}`} onClose={onClose} wide>
    <p className="muted">{client.clientNumber || client.id} · {client.renewalCount || 0} renewals · Current transaction {client.transactionNumber}</p>
    {history.loading && <p role="status">Loading renewal history…</p>}
    {history.error && <p className="alert alert-error" role="alert">{history.error} <button type="button" className="btn btn-small" onClick={history.retry}>Retry</button></p>}
    <RenewalTimeline records={history.records} />
    {history.records.map((record) => {
      const receipts = payments.filter((p) => p.clientId === client.id && (p.loanId || 'initial') === (record.previousLoan.activeLoanId || 'initial')).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
      return <details key={record.id} className="renewal-receipts"><summary>Payment ledger · Transaction {record.previousLoan.transactionNumber} ({receipts.length} receipts)</summary>
        <div className="table-wrap"><table><thead><tr><th>Date</th><th className="num">Amount</th><th>Collected by</th><th>Notes</th></tr></thead><tbody>{receipts.map((p) => <tr key={p.id}><td>{formatDate(p.paymentDate)}</td><td className="num">{formatPeso(p.amount)}</td><td>{p.collectorName}</td><td>{p.notes || 'Daily Payment'}</td></tr>)}</tbody></table></div>
      </details>;
    })}
    <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Close</button></div>
  </Modal>;
}

export function RenewalModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { clients, payments, holidays, today } = useData();
  const { profile } = useAuth();
  const client = clients.find((c) => c.id === clientId);
  const history = useRenewalHistory(client);
  const [values, setValues] = useState(() => ({ principal: String(client?.principal || ''), interest: String(client?.interest ?? 0), dailyAmount: String(client ? dailyPayable(client) : ''), loanTermDays: String(client?.loanTermDays || 45), approvalDate: today }));
  const [notes, setNotes] = useState('');
  const [approved, setApproved] = useState(false);
  const [openedLoanId] = useState(() => client ? loanId(client) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!client || profile?.role !== 'admin') return null;
  const eligibility = renewalEligibility(client, payments, new Set(holidays.map((h) => h.date)), today);
  const loanChanged = loanId(client) !== openedLoanId;
  const ready = !loanChanged && eligibility.eligible && !history.loading && !history.error && history.records.length === (client.renewalCount || 0) && hasGoodRenewalHistory(history.records);
  const bind = (key: keyof typeof values) => ({ value: values[key], onChange: (event: { target: { value: string } }) => { setValues((old) => ({ ...old, [key]: event.target.value })); setApproved(false); } });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!client || !ready || !approved || busy) return;
    setError('');
    try {
      const terms = validateRenewalTerms({ principal: Number(values.principal), interest: values.interest.trim() ? Number(values.interest) : NaN, dailyAmount: Number(values.dailyAmount), loanTermDays: Number(values.loanTermDays), approvalDate: values.approvalDate }, today, eligibility.paidOn!);
      setBusy(true);
      await renewClient(client, terms, notes);
      onClose();
    } catch (caught) { setError(describeError(caught)); setBusy(false); }
  }
  return <Modal title={`Renew loan — ${formatClientName(client)}`} onClose={() => { if (!busy) onClose(); }} wide>
    <p>Client {client.clientNumber || client.id} · Closing transaction {client.transactionNumber}</p>
    {loanChanged && <p className="alert alert-error" role="alert">This loan was renewed in another session. Close and reopen this form to review the current loan.</p>}
    <p className={ready ? 'alert alert-success' : 'alert alert-error'}>{eligibility.reason} {eligibility.paidOn && `Settled ${formatDate(eligibility.paidOn)} · Due ${formatDate(eligibility.dueDate)}.`}</p>
    {history.loading && <p role="status">Checking previous renewals…</p>}
    {history.error && <p className="alert alert-error" role="alert">{history.error} <button type="button" className="btn btn-small" onClick={history.retry}>Retry</button></p>}
    {!history.loading && !history.error && !ready && eligibility.eligible && <p className="alert alert-error">Previous renewal records must be complete and settled on time.</p>}
    <form onSubmit={submit}>
      <fieldset disabled={busy}><legend>New loan terms</legend><div className="form-grid">
        <FormField label="Renewal principal (PHP)"><input type="number" required min="0.01" max="999999999" step="0.01" {...bind('principal')} /></FormField>
        <FormField label="Fixed interest (PHP)"><input type="number" required min="0" max="999999999" step="0.01" {...bind('interest')} /></FormField>
        <FormField label="Type of loan"><select {...bind('loanTermDays')}>{LOAN_TERMS.map((days) => <option key={days} value={days}>{days} days</option>)}</select></FormField>
        <FormField label="New approval date" hint="Starts a new tracking schedule."><input type="date" required min={eligibility.paidOn || today} max={today} {...bind('approvalDate')} /></FormField>
        <FormField label="Daily payable (PHP)"><input type="number" required min="0.01" step="0.01" {...bind('dailyAmount')} /></FormField>
        <div className="field"><button type="button" className="btn" onClick={() => { setValues((old) => ({ ...old, dailyAmount: String(Math.ceil((Number(old.principal) + Number(old.interest)) * 100 / Number(old.loanTermDays)) / 100) })); setApproved(false); }}>Use suggested daily amount</button></div>
      </div>
      <p>Total new payable: <strong>{formatPeso((Number(values.principal) || 0) + (Number(values.interest) || 0))}</strong>. A new five digit transaction number will be assigned.</p>
      <FormField label="Admin notes (optional)"><textarea value={notes} maxLength={1500} onChange={(e) => setNotes(e.target.value)} /></FormField>
      <label className="renewal-approval"><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> I reviewed the history and approve this new loan and its terms.</label>
      </fieldset>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={!ready || !approved || busy}>{busy ? 'Granting renewal…' : 'Grant renewal'}</button></div>
    </form>
  </Modal>;
}
