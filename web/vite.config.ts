import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig(({ mode, command }) => {
  // The proxy needs the API port only during development. Loading the server
  // environment for a build would select React's development runtime.
  const env = command === 'serve' ? loadEnv(mode, process.cwd(), 'PORT') : {};
  return {
    root: resolve('web'),
    resolve: {
      alias: {
        '@app': resolve('web/src'),
        '@shared': resolve('shared'),
      },
    },
    plugins: [react()],
    build: {
      outDir: resolve('dist/web'),
      emptyOutDir: true,
      // Keep UI infrastructure cacheable across workplace feature releases.
      rollupOptions: {
        output: {
          manualChunks: {
            rtl: ['@mui/stylis-plugin-rtl'],
            react: ['react', 'react-dom/client'],
            material: ['@mui/material/Button', '@mui/material/Dialog', '@mui/material/styles'],
          },
        },
      },
    },
    server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:' + (env.PORT || '3100') } },
  };
});
