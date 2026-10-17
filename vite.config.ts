import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'prevent-vite-disconnect-reload',
        transform(code, id) {
          if (id.includes('client.mjs') || id.includes('@vite/client')) {
            return code.replaceAll('location.reload();', '/* reload suppressed */');
          }
        },
      },
    ],
    // The error log (src/utils/errorReporter.ts) shows which build failed: the commit in Actions, «local» otherwise
    define: {
      'import.meta.env.VITE_RELEASE': JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) || 'local'),
    },
    // Dev server only: packages that are imported only from lazy chunks (admin, profile) are pre-bundled at the start.
    // Otherwise Vite finds them on the first open, re-optimises «new dependencies optimized» and reloads: a module that
    // was already loaded keeps the old React copy («Cannot read properties of null (reading 'useRef')»), and chunk
    // addresses with the old ?v= hash fail with «Failed to fetch dynamically imported module».
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'motion/react', 'framer-motion', '@base-ui/react', 'recharts', 'lucide-react'],
    },
    resolve: {
      // one copy of React for all packages (Base UI, recharts, motion)
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
        // motion/react evaluates `const motion = fm.motion` at module top-level, keeping the full 39 KB bundle;
        // aliasing to framer-motion lets Rollup tree-shake `motion` when `LazyMotion` + `m.*` is used (performance-plan.md, stage 5)
        'motion/react': 'framer-motion',
        // Firestore pipelines' regular expressions are not used: −43 КБ gzip of the main chunk (finding 36)
        re2js: path.resolve(import.meta.dirname, 'src/vendor/re2js-stub.ts'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
