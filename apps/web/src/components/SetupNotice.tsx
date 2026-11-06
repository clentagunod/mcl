import { Logo } from './Logo';
import { PublicPage } from './PublicPage';

interface SetupNoticeProps {
  missingKeys: string[];
}

/** Shown instead of the app when the Firebase settings in ".env" are missing. */
export function SetupNotice({ missingKeys }: SetupNoticeProps) {
  return (
    <PublicPage>
      <div className="card login-card">
        <Logo />
        <h1>Firebase is not set up yet</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env</code>, fill in your Firebase web app settings, then restart
          the dev server.
        </p>
        <p className="muted">Missing values:</p>
        <ul>
          {missingKeys.map((key) => (
            <li key={key}>
              <code>{key}</code>
            </li>
          ))}
        </ul>
      </div>
    </PublicPage>
  );
}
