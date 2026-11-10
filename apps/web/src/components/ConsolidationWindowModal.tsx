import { useMemo, useState, type FormEvent } from 'react';
import { FormField } from './FormField';
import { Modal } from './Modal';
import {
  applyConsolidationWindow, consolidationPresetWindow, consolidationTotals, consolidationWindowErrors,
  type ConsolidationPreset, type ConsolidationRow, type ConsolidationWindow,
} from '../lib/consolidation';
import { formatDate, type ISODate } from '../lib/dates';
import { formatPeso } from '../lib/money';
import { businessExpenseTotal } from '../lib/accounting';
import type { Expense } from '../types/expenses';
import { useSettings } from '../context/SettingsContext';
import { visibleConsolidationMetrics } from '../config/consolidation-metrics';

const PRESETS: { value: ConsolidationPreset; label: string }[] = [
  { value: 'all', label: 'All dates' }, { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' }, { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' }, { value: 'month', label: 'This month' },
  { value: 'previousMonth', label: 'Last month' }, { value: 'custom', label: 'Custom dates' },
];

interface Props {
  window: ConsolidationWindow | null;
  rows: readonly ConsolidationRow[];
  expenses: readonly Expense[];
  includeShared: boolean;
  accountingUnavailable: boolean;
  today: ISODate;
  onApply: (window: ConsolidationWindow | null) => void;
  onClose: () => void;
}

export function ConsolidationWindowModal({ window, rows, expenses, includeShared, accountingUnavailable, today, onApply, onClose }: Props) {
  const { settings } = useSettings();
  const metrics = visibleConsolidationMetrics(settings.consolidationMetrics);
  const [preset, setPreset] = useState<ConsolidationPreset>(window ? 'custom' : 'all');
  const [draft, setDraft] = useState<ConsolidationWindow>(window ?? consolidationPresetWindow('month', today));
  const errors = preset === 'all' ? {} : consolidationWindowErrors(draft);
  const valid = Object.keys(errors).length === 0;
  const selection = preset === 'all' ? null : draft;
  const preview = useMemo(() => valid ? applyConsolidationWindow(rows, selection) : [], [rows, valid, selection]);
  const totals = consolidationTotals(preview, businessExpenseTotal(expenses, selection, includeShared));
  const receiptCount = preview.reduce((count, row) => count + row.days.reduce((sum, day) => sum + day.receipts, 0), 0);
  const payingClients = preview.filter((row) => row.days.length > 0).length;

  function selectPreset(value: ConsolidationPreset) {
    setPreset(value);
    if (value !== 'all' && value !== 'custom') setDraft(consolidationPresetWindow(value, today));
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    if (valid) onApply(selection);
  }

  return <Modal title="Configure consolidation window" onClose={onClose} wide>
    <form onSubmit={apply} noValidate>
      <p className="muted small">Choose which collection dates to include. Changes take effect when you apply the window.</p>
      <div className="ledger-window-presets" role="group" aria-label="Date window presets">
        {PRESETS.map(({ value, label }) => <button key={value} type="button" className={`btn btn-small${preset === value ? ' btn-primary' : ''}`} aria-pressed={preset === value} onClick={() => selectPreset(value)}>{label}</button>)}
      </div>
      <div className="form-grid ledger-window-dates">
        <FormField label="From" error={errors.from} hint="First collection date, included in the calculation.">
          <input type="date" value={preset === 'all' ? '' : draft.from} disabled={preset === 'all'} required onChange={(event) => { setPreset('custom'); setDraft({ ...draft, from: event.target.value }); }} />
        </FormField>
        <FormField label="To" error={errors.to} hint="Last collection date, included in the calculation.">
          <input type="date" value={preset === 'all' ? '' : draft.to} disabled={preset === 'all'} required onChange={(event) => { setPreset('custom'); setDraft({ ...draft, to: event.target.value }); }} />
        </FormField>
      </div>
      <div className="ledger-window-preview" aria-label="Calculation preview" aria-live="polite">
        <h3>Calculation preview</h3>
        {valid ? <>
          <p>{selection ? `${formatDate(selection.from)} – ${formatDate(selection.to)} · both dates included` : 'All collection dates'} · {rows.length} matched current loans</p>
          <dl>{metrics.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{accountingUnavailable && ['expenseAmount', 'netIncome', 'cashSurplus'].includes(key) ? 'Unavailable' : formatPeso(totals[key])}</dd></div>)}</dl>
          <p>{includeShared ? 'Shared business costs are included in grand totals.' : 'Shared business costs are excluded while client or loan-term filters are active.'}</p>
          <p>{receiptCount} {receiptCount === 1 ? 'receipt' : 'receipts'} from {payingClients} {payingClients === 1 ? 'client' : 'clients'}. Clients without receipts stay in the ledger.</p>
        </> : <p>Select a valid From–To window to preview the calculation.</p>}
      </div>
      <p className="muted small">The window uses the date collected, including Sundays and holidays when receipts exist. It applies to current loan cycles only. Original paying-day numbers stay in place.</p>
      <p className="ledger-window-explanation"><strong>Balance = payable amount − included payments.</strong> A date window excludes payments outside those dates; choose All dates for the full current-loan balance. <strong>Contracted Interest = payable amount − principal.</strong> Interest collected is allocated using all earlier receipts, then limited to this window. Net income deducts paid expenses in this window. Cash surplus deducts principal released and cash expenses within the same window.</p>
      <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={!valid}>Apply window</button></div>
    </form>
  </Modal>;
}
