import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // v0.8.0 §19：主题只能软删，所以夹具留下的行必须由这里抬出去。
    globalSetup: './test/globalSetup.ts',
    alias: {
      '@loredoku/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
})
