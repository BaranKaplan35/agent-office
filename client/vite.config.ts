import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Read the repo-root .env (all keys, not only VITE_*) just to find the API port.
  // Nothing from it is exposed to the browser bundle.
  const env = { ...loadEnv(mode, ROOT_DIR, ''), ...process.env };
  const apiPort = env.SERVER_PORT || '3001';

  return {
    plugins: [react()],
    envDir: ROOT_DIR,
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true },
      },
    },
  };
});
