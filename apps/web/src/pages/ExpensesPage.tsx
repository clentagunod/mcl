import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, LoadingState } from '../components/StateMessage';
import { useData } from '../context/DataContext';
import { useExpenses } from '../context/ExpensesContext';
import { useSettings } from '../context/SettingsContext';
import { validateExpense } from '../lib/accounting';
import { formatDate, formatDateTime } from '../lib/dates';
import { describeError } from '../lib/errors';
import { loanId } from '../lib/loan-cycle';
import { formatPeso, sumAmounts } from '../lib/money';
import { publicClientId, summaryClientName } from '../lib/printables';
import { subscribeExpenseHistory, reserveExpenseId, reserveExpenseCategoryId, saveExpense, saveExpenseCategory, voidExpense } from '../services/expenses';
import type { Expense, ExpenseCategory, ExpenseInput } from '../types/expenses';
import './workspace-tools.css';
import './expenses.css';

function ExpenseEditor({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const { clients, today } = useData();
  const { categories, fresh, error: feedError } = useExpenses();
  const [id] = useState(() => expense?.id ?? reserveExpenseId());
  const [draft, setDraft] = useState<ExpenseInput>(() => expense ? { ...expense } : {
    categoryId: '', categoryName: '', amount: 0, expenseDate: today, description: '', reference: '', clientId: '', loanId: '',
  });
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function field<K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) { setDraft(previous => ({ ...previous, [key]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const input = { ...draft, amount: amount.trim() ? Number(amount) : 0 };
    const validation = validateExpense(input, today);
    if (validation) { setError(validation); return; }
    if (!fresh || feedError) { setError('Wait for confirmed live expense data before saving.'); return; }
    setBusy(true);
    try {
      // Pass only writable fields; never copy view-model audit fields into a write.
      await saveExpense(id, { categoryId: input.categoryId, categoryName: input.categoryName, amount: input.amount,
        expenseDate: input.expenseDate, description: input.description, reference: input.reference, clientId: input.clientId, loanId: input.loanId }, expense?.revision ?? 0);
      onClose();
    } catch (caught) { setError(describeError(caught)); } finally { setBusy(false); }
  }
  return <Modal title={expense ? 'Edit expense' : 'Record paid expense'} onClose={onClose} dismissible={!busy} wide>
    <p className="muted small">Record money already paid, in Philippine pesos. Corrections retain a revision history.</p>
    <form onSubmit={submit}><fieldset className="expense-fields" disabled={busy}>
      <div className="form-grid">
        <FormField label="Expense type"><select required value={draft.categoryId} onChange={event => {
          const category = categories.find(item => item.id === event.target.value);
          setDraft(previous => ({ ...previous, categoryId: category?.id ?? '', categoryName: category?.name ?? '' }));
        }}><option value="">Choose a type</option>{categories.filter(category => category.active || category.id === draft.categoryId).map(category => <option key={category.id} value={category.id} disabled={!category.active}>{category.name}{!category.active ? ' (archived — choose an active type)' : ''}</option>)}</select></FormField>
        <FormField label="Amount (PHP)"><input required type="number" min="0.01" max="999999999" step="0.01" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></FormField>
        <FormField label="Date paid"><input required type="date" max={today} value={draft.expenseDate} onChange={event => field('expenseDate', event.target.value)} /></FormField>
        <FormField label="Receipt / reference (optional)"><input maxLength={120} value={draft.reference} onChange={event => field('reference', event.target.value)} /></FormField>
      </div>
      <FormField label="Assign expense" hint="Shared business costs appear in full portfolio totals only. Loan costs follow the selected loan cycle.">
        <select value={draft.clientId ? `${draft.clientId}:${draft.loanId}` : ''} onChange={event => {
          const client = clients.find(item => `${item.id}:${loanId(item)}` === event.target.value);
          setDraft(previous => ({ ...previous, clientId: client?.id ?? '', loanId: client ? loanId(client) : '' }));
        }}><option value="">Shared business expense</option>
          {draft.clientId && !clients.some(client => client.id === draft.clientId && loanId(client) === draft.loanId) && <option value={`${draft.clientId}:${draft.loanId}`} disabled>Previous or unavailable loan — reassign to edit</option>}
          {[...clients].sort((a, b) => summaryClientName(a).localeCompare(summaryClientName(b))).map(client => <option key={client.id} value={`${client.id}:${loanId(client)}`}>{summaryClientName(client)} · {publicClientId(client)} · Transaction {client.transactionNumber || 'Pending'}</option>)}
        </select>
      </FormField>
      <FormField label="Description"><textarea required maxLength={500} rows={3} value={draft.description} onChange={event => field('description', event.target.value)} /></FormField>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!fresh || !!feedError}>{busy ? 'Saving…' : expense ? 'Save correction' : 'Record expense'}</button></div>
    </fieldset></form>
  </Modal>;
}

function CategoryEditor({ category, onClose }: { category: ExpenseCategory | null; onClose: () => void }) {
  const [id] = useState(() => category?.id ?? reserveExpenseCategoryId());
  const [name, setName] = useState(category?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { fresh } = useExpenses();
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await saveExpenseCategory(name, category?.active ?? true, category ?? undefined, id); onClose(); }
    catch (caught) { setError(describeError(caught)); } finally { setBusy(false); }
  }
  return <Modal title={category ? 'Rename expense type' : 'Add expense type'} onClose={onClose} dismissible={!busy}>
    <form onSubmit={submit}><FormField label="Type name" hint="Examples: salaries, transportation, rent, supplies, bank fees."><input required maxLength={80} value={name} onChange={event => setName(event.target.value)} disabled={busy} /></FormField>
      <p className="field-hint">Existing expenses keep the type name recorded at the time of entry.</p>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !fresh}>{busy ? 'Saving…' : 'Save type'}</button></div>
    </form>
  </Modal>;
}

function ExpenseHistory({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const [history, setHistory] = useState<Expense[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => subscribeExpenseHistory(expense.id,
    rows => { setHistory(rows.sort((a, b) => b.revision - a.revision)); setLoading(false); },
    caught => { setError(describeError(caught)); setLoading(false); }), [expense.id]);
  return <Modal title="Expense revision history" onClose={onClose} wide>
    {loading && <LoadingState />}{error && <p className="alert alert-error" role="alert">{error}</p>}
    {history.map(version => <article className="expense-revision" key={version.revision}><strong>Revision {version.revision} · {version.status} · {formatPeso(version.amount)}</strong>
      <p>{formatDate(version.expenseDate)} · {version.categoryName} · {version.clientId ? `Client ${version.clientId}, loan ${version.loanId}` : 'Shared business expense'}</p>
      <p>{version.description}{version.reference ? ` · Reference: ${version.reference}` : ''}</p>
      {version.voidReason && <p>Void reason: {version.voidReason}</p>}
      <p className="muted small">{formatDateTime(version.updatedAt)} · Administrator {version.updatedBy}</p></article>)}
  </Modal>;
}

function VoidExpense({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { fresh } = useExpenses();
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await voidExpense(expense, reason); onClose(); } catch (caught) { setError(describeError(caught)); } finally { setBusy(false); }
  }
  return <Modal title="Void expense" onClose={onClose} dismissible={!busy}>
    <p>{formatPeso(expense.amount)} · {expense.description}</p><p>The record stays in history and is excluded from financial totals. Voiding cannot be undone; record a new expense if needed.</p>
    <form onSubmit={submit}><FormField label="Void reason"><textarea required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></FormField>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-danger" disabled={busy || !fresh}>{busy ? 'Voiding…' : 'Void expense'}</button></div>
    </form>
  </Modal>;
}

export default function ExpensesPage() {
  const { settings, loading: settingsLoading, error: settingsError } = useSettings();
  const { expenses, categories, loading, error, fresh } = useExpenses();
  const { clients, today } = useData();
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState('posted');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ expense: Expense | null } | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<{ category: ExpenseCategory | null } | null>(null);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const [history, setHistory] = useState<Expense | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const invalidDates = !!(from && to && from > to);
  const names = useMemo(() => new Map(clients.map(client => [client.id, `${summaryClientName(client)} · ${publicClientId(client)}`])), [clients]);
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.name.localeCompare(b.name)), [categories]);
  const matched = useMemo(() => expenses.filter(expense => !invalidDates
    && (!from || expense.expenseDate >= from) && (!to || expense.expenseDate <= to)
    && (status === 'all' || expense.status === status) && (!categoryId || expense.categoryId === categoryId)
    && `${expense.description} ${expense.reference} ${expense.categoryName} ${names.get(expense.clientId) ?? expense.clientId}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id)), [expenses, from, to, status, categoryId, search, names, invalidDates]);
  const pageCount = Math.max(1, Math.ceil(matched.length / 25));
  const currentPage = Math.min(page, pageCount);
  const disabled = busy || !fresh || !!error || !!settingsError;
  async function toggleCategory(category: ExpenseCategory) {
    setBusy(true); setActionError('');
    try { await saveExpenseCategory(category.name, !category.active, category); }
    catch (caught) { setActionError(describeError(caught)); } finally { setBusy(false); }
  }
  if (settingsLoading) return <LoadingState />;
  if (settingsError) return <p className="alert alert-error" role="alert">Expense settings could not be loaded. {settingsError}</p>;
  if (!settings.accounting.expensesEnabled) return <Navigate to="/settings#settings-accounting" replace />;
  return <>
    <PageHeader title="Expenses" description="Record paid business costs and keep a clear history of corrections." actions={<button className="btn btn-primary" disabled={disabled || !categories.some(category => category.active)} onClick={() => setEditor({ expense: null })}>Record expense</button>} />
    {loading && <LoadingState />}
    {(error || actionError) && <p className="alert alert-error" role="alert">{error || actionError}</p>}
    {!loading && !fresh && !error && <p className="alert alert-warning" role="status">Awaiting server confirmation. Expense changes are paused.</p>}
    <div className="tools-summary-grid">
      <div className="tools-summary-item"><div><span className="muted small">Posted expenses · current filters</span><strong>{formatPeso(sumAmounts(matched.filter(expense => expense.status === 'posted').map(expense => expense.amount)))}</strong></div></div>
      <div className="tools-summary-item"><div><span className="muted small">Matching entries</span><strong>{matched.length}</strong></div></div>
      <div className="tools-summary-item tools-summary-detail"><div><span className="muted small">Consolidation</span><p>Loan costs follow current cycles. Shared costs appear in full portfolio totals.</p><Link to="/liquidation">Review consolidation</Link></div></div>
    </div>
    <details className="card expense-types" open={!categories.length}><summary>Expense types · {categories.filter(category => category.active).length} active</summary>
      <p className="muted small">Create the types your business needs. Archive unused types to prevent new entries; existing expenses remain in reports.</p>
      <button className="btn btn-small" disabled={disabled} onClick={() => setCategoryEditor({ category: null })}>Add expense type</button>
      <ul className="expense-category-list">{sortedCategories.map(category => <li key={category.id}><span>{category.name} <small className="muted">{category.active ? 'Active' : 'Archived'}</small></span><div className="expense-row-actions"><button className="btn btn-small" disabled={disabled} onClick={() => setCategoryEditor({ category })}>Rename</button><button className="btn btn-small" disabled={disabled} onClick={() => void toggleCategory(category)}>{category.active ? 'Archive' : 'Reactivate'}</button></div></li>)}</ul>
    </details>
    <section className="card expense-ledger" aria-label="Expense ledger"><h2>Paid expenses</h2>
      <div className="expense-filters">
        <FormField label="Search expenses"><input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Description, reference or client" /></FormField>
        <FormField label="From paid date"><input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></FormField>
        <FormField label="To paid date"><input type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></FormField>
        <FormField label="Expense status"><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="posted">Posted</option><option value="void">Voided</option><option value="all">All statuses</option></select></FormField>
        <FormField label="Filter expense type"><select value={categoryId} onChange={event => { setCategoryId(event.target.value); setPage(1); }}><option value="">All types</option>{sortedCategories.map(category => <option key={category.id} value={category.id}>{category.name}{category.active ? '' : ' (archived)'}</option>)}</select></FormField>
      </div>
      <button className="btn btn-small" onClick={() => { setFrom(''); setTo(''); setPage(1); }}>All paid dates</button>
      {invalidDates && <p className="alert alert-error" role="alert">The end date must be on or after the start date.</p>}
      {matched.length ? <div className="table-wrap"><table><thead><tr><th>Date paid</th><th>Type / description</th><th>Assignment</th><th className="num">Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{matched.slice((currentPage - 1) * 25, currentPage * 25).map(expense => <tr key={expense.id}><td>{formatDate(expense.expenseDate)}</td><td><strong>{expense.categoryName}</strong><p>{expense.description}</p>{expense.reference && <small className="muted">Ref: {expense.reference}</small>}</td>
          <td>{expense.clientId ? <>{names.get(expense.clientId) ?? expense.clientId}<small className="expense-loan-label">Loan {expense.loanId}{clients.some(client => client.id === expense.clientId && loanId(client) === expense.loanId) ? '' : ' · previous/unavailable'}</small></> : 'Shared business'}</td>
          <td className="num">{formatPeso(expense.amount)}</td><td>{expense.status === 'posted' ? 'Posted' : 'Voided'}{expense.voidReason && <p className="muted small">{expense.voidReason}</p>}</td>
          <td><div className="expense-row-actions"><button className="btn btn-small" onClick={() => setHistory(expense)}>History</button>{expense.status === 'posted' && <><button className="btn btn-small" disabled={disabled} onClick={() => setEditor({ expense })}>Edit</button><button className="btn btn-small" disabled={disabled} onClick={() => setVoiding(expense)}>Void</button></>}</div></td></tr>)}</tbody></table></div> : !loading && <EmptyState>No expenses match these filters. Add an expense type, then record a paid expense.</EmptyState>}
      <nav className="client-pagination" aria-label="Expense pagination"><span>{matched.length} matching entries · Page {currentPage} of {pageCount}</span><div className="expense-row-actions"><button className="btn btn-small" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="btn btn-small" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div></nav>
    </section>
    {editor && <ExpenseEditor expense={editor.expense} onClose={() => setEditor(null)} />}
    {categoryEditor && <CategoryEditor category={categoryEditor.category} onClose={() => setCategoryEditor(null)} />}
    {voiding && <VoidExpense expense={voiding} onClose={() => setVoiding(null)} />}
    {history && <ExpenseHistory expense={history} onClose={() => setHistory(null)} />}
  </>;
}
