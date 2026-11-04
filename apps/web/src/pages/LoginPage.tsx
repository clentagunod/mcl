import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { FormField } from '../components/FormField';
import { Logo } from '../components/Logo';
import { LoadingState } from '../components/StateMessage';
import { APP_NAME } from '../config/app';
import { useAuth } from '../context/AuthContext';
import { describeError } from '../lib/errors';
import { ThemeToggle } from '../components/ThemeToggle';
import { Icon } from '../components/Icon';

export default function LoginPage() {
  const { status, accessError, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'loading') return <LoadingState />;
  if (status === 'signedIn') return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
    <div className="login-wrap">
      <div className="login-theme"><ThemeToggle /></div>
      <form className="card login-card" onSubmit={handleSubmit} noValidate>
        <Logo />
        <h1>{APP_NAME}</h1>
        <p className="muted">Welcome back. Sign in to your lending workspace.</p>

        {message && (
          <p className="alert alert-error" role="alert">
            {message}
          </p>
        )}

        <FormField label="Email">
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </FormField>
        <FormField label="Password">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </FormField>

        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="login-security"><Icon name="shield" size={15} /> Administrator access only</p>
      </form>
    </div>
  );
}
