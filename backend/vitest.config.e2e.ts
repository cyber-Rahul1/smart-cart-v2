import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    fileParallelism: false,
    env: {
      JWT_SECRET: 'test-secret',
      RAZORPAY_KEY_ID: 'test-key',
      RAZORPAY_KEY_SECRET: 'test-secret',
      RAZORPAY_WEBHOOK_SECRET: 'test-webhook-secret',
      USE_MOCK_TWILIO: 'true',
    },
  },
});
