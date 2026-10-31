import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.tsx'],
    include: ['__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.next', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        '__tests__',
        '**/*.d.ts',
        '**/*.config.*',
        '.next',
      ],
    },
  },
  resolve: {
    // Most specific first: '@' would otherwise also capture '@/test/...'.
    alias: {
      '@/test': path.resolve(__dirname, './__tests__'),
      '@': path.resolve(__dirname, './src'),
    },
  },
})
