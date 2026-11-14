import { Logo } from './Logo';
import { PublicPage } from './PublicPage';

interface SetupNoticeProps {
  missingKeys: string[];
}

/** Shown instead of the app when the Firebase settings in ".env" are missing. */
export function SetupNotice(_props: SetupNoticeProps) {
  return (
    <PublicPage>
      <div className="card login-card">
        <Logo />
        <h1>Application setup is incomplete</h1>
        <p>Please contact your system administrator to finish setting up the application.</p>
      </div>
    </PublicPage>
  );
}
