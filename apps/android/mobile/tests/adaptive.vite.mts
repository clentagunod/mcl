import config from '../vite.config.mts';
import {fileURLToPath} from 'node:url';
export default {...config,build:{...config.build,outDir:fileURLToPath(new URL('../../.tmp/adaptive-regression',import.meta.url)),rolldownOptions:{input:fileURLToPath(new URL('../adaptive-test.html',import.meta.url))}}};
