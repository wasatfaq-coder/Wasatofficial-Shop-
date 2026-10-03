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
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
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
