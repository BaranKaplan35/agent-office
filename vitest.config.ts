import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{server,client,shared}/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
