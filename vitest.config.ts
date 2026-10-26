import { defineConfig } from 'vitest/config'

// 根目录这步只跑 scripts/ 下的用例（dev.mjs 的参数解析）。
// 不加 include 限制的话，`vitest run scripts` 会顺带命中 packages/web/scripts/ 下的
// 用例，而它们在仓库根作为 cwd 时退出码断言必然失败 —— 那些用例归 web 包自己跑。
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.mjs'],
    environment: 'node',
  },
})
