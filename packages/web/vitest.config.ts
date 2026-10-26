import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/testing/actEnvironment.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@loredoku/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
})
