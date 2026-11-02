import config from '../vite.config.mts';
import { fileURLToPath } from 'node:url';
export default { ...config, build: { ...config.build,
 outDir: fileURLToPath(new URL('../../.tmp/index-regression', import.meta.url)),
 rolldownOptions: { input: fileURLToPath(new URL('../index-test.html', import.meta.url)) },
} };
