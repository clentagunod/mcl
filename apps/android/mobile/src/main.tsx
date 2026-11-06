import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '@web/components/ErrorBoundary';
import { missingEnvKeys } from '@web/config/env';
import '@web/index.css';
import './mobile.css';
async function start() {
  const root = createRoot(document.getElementById('root')!);
  if (missingEnvKeys.length) {
    root.render(<main className="card"><h1>Firebase setup required</h1><p>Configure the web Firebase environment and rebuild the mobile bundle.</p></main>);
    return;
  }
  const { default: App } = await import('./App');
  root.render(<ErrorBoundary><App /></ErrorBoundary>);
}
void start();
