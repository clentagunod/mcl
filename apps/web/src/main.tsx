import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SetupNotice } from './components/SetupNotice';
import { missingEnvKeys } from './config/env';
import './index.css';
import { initializeTheme } from './lib/theme';

initializeTheme();

async function bootstrap() {
  const container = document.getElementById('root');
  if (!container) throw new Error('Root element #root was not found.');
  const root = createRoot(container);

  // Maintenance takes precedence over Firebase setup and authentication.
  if (import.meta.env.VITE_MAINTENANCE_MODE === 'true' || window.location.pathname.replace(/\/+$/, '') === '/maintenance') {
    const { default: MaintenancePage } = await import('./pages/MaintenancePage');
    root.render(<StrictMode><MaintenancePage /></StrictMode>);
    return;
  }

  // Firebase is only loaded when it is configured, so a missing ".env" shows a
  // helpful message instead of a crash.
  if (missingEnvKeys.length > 0) {
    root.render(
      <StrictMode>
        <SetupNotice missingKeys={missingEnvKeys} />
      </StrictMode>,
    );
    return;
  }

  const { default: App } = await import('./App');
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
