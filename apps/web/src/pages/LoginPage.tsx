import { useId, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { FormField } from '../components/FormField';
import { PublicPage } from '../components/PublicPage';
import { LoadingState } from '../components/StateMessage';
import { useAuth } from '../context/AuthContext';
import { describeError } from '../lib/errors';
import { Icon } from '../components/Icon';

export default function LoginPage() {
  const { status, accessError, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const passwordId = useId();

  if (status === 'loading') return <PublicPage className="login-page"><LoadingState /></PublicPage>;
  if (status === 'signedIn') return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  const message = error ?? accessError;

  return (
    <PublicPage className="login-page">
      <div className="login-panel">
        <section className="login-intro" aria-labelledby="login-intro-title">
          <span className="login-intro-label"><span /> Your everyday lending workspace</span>
          <div className="login-intro-copy">
            <h2 id="login-intro-title">Every client.<br />Every collection.<br /><span>One clear view.</span></h2>
            <p>A simpler way to manage your lending day, from the first payment to the final report.</p>
          </div>
          <div className="login-ledger" aria-hidden="true">
            <div className="login-ledger-heading"><Icon name="wallet" size={20} /><span>A more organized day</span><Icon name="check" size={16} /></div>
            <div className="login-ledger-row"><span><Icon name="clients" size={18} /> Client records</span><span className="login-ledger-line" /></div>
            <div className="login-ledger-row"><span><Icon name="wallet" size={18} /> Daily collections</span><span className="login-ledger-line" /></div>
            <div className="login-ledger-row"><span><Icon name="documents" size={18} /> Reports & documents</span><span className="login-ledger-line" /></div>
          </div>
          <p className="login-intro-footnote"><Icon name="shield" size={16} /> Built around your daily operations</p>
        </section>
        <div className="login-form-panel">
          <form className="login-form" onSubmit={handleSubmit} aria-labelledby="login-title" aria-busy={busy}>
            <span className="public-eyebrow">Welcome to MCL</span>
            <h1 id="login-title">Welcome back.</h1>
            <p className="muted login-description">Sign in to your lending workspace.</p>

            {message && (
              <p className="alert alert-error" role="alert">
                {message}
              </p>
            )}

            <FormField label="Email">
              <input
                type="email"
                name="email"
                autoComplete="username"
                placeholder="you@example.com"
                autoCapitalize="none"
                spellCheck={false}
                disabled={busy}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </FormField>
            <div className="field">
              <label htmlFor={passwordId}>Password</label>
              <div className="login-password">
                <input
                  id={passwordId}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  disabled={busy}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  aria-controls={passwordId}
                  disabled={busy}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={19} />
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="login-security"><Icon name="shield" size={15} /> Authorized workspace access only</p>
            <p className="login-help">Need access? Contact your administrator.</p>
          </form>
        </div>
      </div>
    </PublicPage>
  );
}
