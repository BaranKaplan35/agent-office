import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // The shared workspace is TypeScript source, so bundle it into the server build.
  noExternal: ['@agent-office/shared'],
  // The built server is the production server.
  env: { NODE_ENV: 'production' },
});
