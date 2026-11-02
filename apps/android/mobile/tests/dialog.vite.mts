import config from '../vite.config.mts';
import { fileURLToPath } from 'node:url';
export default { ...config, build: { ...config.build,
  outDir: fileURLToPath(new URL('../../.tmp/dialog-regression', import.meta.url)),
  rolldownOptions: { input: fileURLToPath(new URL('../dialog-test.html', import.meta.url)) },
} };
