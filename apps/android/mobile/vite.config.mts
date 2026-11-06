import { fileURLToPath } from 'node:url';
const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
export default {
  base: './',
  // Apply the mobile dialog to shared admin pages as well as collector screens.
  plugins: [{
    name: 'mobile-dialog',
    enforce: 'pre' as const,
    resolveId(id: string) {
      if (/(^|\/)Modal(?:\.tsx)?$/.test(id)) return path('./src/Modal.tsx');
      if (/(^|\/)StateMessage(?:\.tsx)?$/.test(id)) return path('./src/StateMessage.tsx');
      if (/(^|\/)ConfirmDialog(?:\.tsx)?$/.test(id)) return path('./src/ConfirmDialog.tsx');
    },
  }],
  envDir: path('../../web'),
  publicDir: path('../../web/public'),
  resolve: { alias: {
    '@web': path('../../web/src'),
    'vitest': path('../../web/node_modules/vitest/dist/index.js'),
    'react': path('../../web/node_modules/react'),
    'react-dom': path('../../web/node_modules/react-dom'),
    'react-router-dom': path('../../web/node_modules/react-router-dom'),
    'firebase': path('../../web/node_modules/firebase'),
  }, dedupe: ['react', 'react-dom'] },
  oxc: { jsx: { runtime: 'automatic' } },
  build: { outDir: path('../app/src/main/assets/mobile'), emptyOutDir: true, target: 'es2020' },
};
