import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/experiences/patient/voice-agent/tests/setup.ts'],
    include: ['src/experiences/patient/**/*.test.ts', 'src/experiences/patient/**/*.test.tsx'],
    exclude: ['node_modules', 'dist', 'Y-T-AUTO-master'],
  },
});
