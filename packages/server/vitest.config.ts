import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // v0.8.0 §19：夹具主题有子行，走接口删不掉，所以收尾得由这里抬出去。
    globalSetup: './test/globalSetup.ts',
    alias: {
      '@loredoku/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
})
