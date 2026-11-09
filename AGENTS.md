# AGENTS.md

给在本仓库工作的 AI Agent / 新贡献者的操作手册。目标是让你**第一轮就按本仓的既有约定写代码**，不要重新发明做法。

---

## 1. 这是什么

`loredoku`（格物）—— 一款推理数独类游戏，包含游戏编辑工坊。工坊中包含地图、资源、角色和谜题的管理 monorepo。

- `packages/shared`：跨端共享的 TS 类型、常量、zod schema。**不依赖任何运行时**。
- `packages/server`：Koa + Knex + PostgreSQL。
- `packages/web`：Vite + React 18 + Zustand + TanStack Query + shadcn/ui。
- `docs/`：逐版需求文档（`v0.1.0` ~ `v0.5.9`），**每版文档最后一节是落点表 / 实现期裁定 / 验证证据 / 交付标准对照** —— 动手前先读对应版本的文档。
- `docs/map-management-and-editor.md`：地图管理页与地图编辑器的**功能说明**（当前状态，不是需求）。要确认某个控件 / 规则的现状看它，别从旧版需求文档里推断。
- `docs/data-json.md`：`maps.data` / `puzzles.data` 的 **JSON 结构参考**（字段、范围、默认值、版本史、导入导出行为）。手写或解析这份 JSON 前先看它。
- `docs/layer-priority.md`：画布图层命名与次序的**唯一权威**。

---

## 2. 常用命令

```bash
npm install
npm run dev                 # 后端 3000 + 前端 5173（-s / -w 改端口，PUBLIC_BASE_URL 自动同步）
npm run dev:server          # 只起后端
npm run dev:web             # 只起前端
npm run build               # 构建全部 workspace
npm run dev:player                               # 播放器 dev（5174/loredoku/，v0.9.0）
npm run build:player                             # 播放器产物 → packages/web/dist-player/
npm run preview:player                           # 预览播放器产物（4173/loredoku/，不要求包）
#   ↑ 三条默认读仓库根 .env 的 LOREDOKU_BUNDLE；临时换包加 `-- --bundle=<包.zip|目录>`
npm start                   # 先 build：后端 3000 直接托管 packages/web/dist（v0.5.6）
npm run typecheck           # 全量 tsc --noEmit
npm test                    # 各 workspace Vitest + 根目录 scripts/ 单测
npm run db:migrate          # 迁移
npm run db:rollback         # 回退最近一批（migrations/ 下手写新文件，无 make 命令）
```

新迁移文件名形如 `20260101000019_v052_item_fields.ts`（时间戳 + 版本 + 简述），放在 `packages/server/src/db/migrations/`。

server 测试**依赖本地 PostgreSQL**（库名 `loredoku`），跑前确保已 `db:migrate`。

`packages/server/storage/uploads/**` 是 gitignore 的运行时数据，**DB 行引用这些图片，不要删**。

---

## 3. 代码约定

### 3.1 用户可见文案

- 文案修改不写注释，也不需要进行测试。

### 3.2 UI

- 浮层 `z-index` 只用 shared 的 `UI_Z = { ruler: 10, infoDrawer: 20, drawer: 30, saveMask: 40 }`，**不要在组件里写 `z-*` 类**。
- 弹窗一律**禁止点遮罩关闭**。
- 配色只用语义 token（`bg-background` / `text-muted-foreground` / `border-border` …），**不要写 `bg-white` 之类的定色**，那在深色下会变成白疤。地图背景、资源/角色色块、区域色属于**作品内容**，不随主题变（画布范围的界定见 `docs/map-management-and-editor.md` §6）。
- 主题（浅色 / 深色 / 跟随系统）的唯一状态源是 `lib/theme.ts`，React 侧只通过 `useTheme()` 读；不要另建 store，也不要在组件里直接改 `document` 的 class。

### 3.3 数据库迁移

- `packages/server/src/db/migrations/` 下**每个文件都会被 Knex 当迁移加载**，辅助模块放 `service/`。
- `table.unique(cols, { indexName })` 建的是 UNIQUE **约束**，回滚必须 `table.dropUnique(cols, name)`；`DROP INDEX` 会以 `2BP01` 失败。
- 新迁移的 up/down 要实测 `db:rollback` → `db:migrate` 往返。

### 3.4 文件与格式

- 工作区文件统一 **LF**；代码 / 配置文件里只用 ASCII 直引号。
- 改了图层次序 / 命名 → 同步 `docs/layer-priority.md` 与 `MAP_LAYER_ORDER`。

### 3.5 文档/规范

- 禁止修改历史需求文档，只能修改当前版本的文档。
- 规范信息不要写到README.md中。
- 需求内容规范细节不要写到AGENTS.md中。

---

## 4. 测试规范

### 4.1 临时文件

- **必须及时删除测试临时产物**, 比如 vitest.config.ts.timestamp-....mjs 和产生的数据库数据。

### 4.2 测试用例

- 测试验证「行为/输出」，不验证「源码排版」。
- **界面外观不写断言**：文案字符串、Tailwind 类名、DOM 结构（第几个子元素、谁排在谁前面）、尺寸 / 透明度 / 颜色，都算外观。它们不是行为，而且界面还要改 —— 钉住只会每天早上叫一次。要确认观感就用无头浏览器截图 + 量像素，写进当前版本文档（`docs/v0.8.4.md` 是这条的来由）。
- 禁止读源码文件后用 `toContain` 断言某段代码文本存在，除非被测物的正确输出本身就是文本（代码生成器、模板、lint 规则）。

### 4.3 怎么跑

- `bash scripts/run-tests.sh packages/<pkg>`：一次收集跑完，再拿报告对着磁盘上的测试文件核一遍，被环境漏收的那几个（EPERM 偶发）单独补跑。别改回逐文件循环 —— 那会把 12 秒变成 2 分半。
- `server` 默认串行（共用同一个测试库，并行会偶发撞车）；其他包要强制串行加 `--serial`。

---

## 5. 提交前检查清单

```bash
npm run typecheck
bash scripts/run-tests.sh packages/web
bash scripts/run-tests.sh packages/shared
bash scripts/run-tests.sh packages/server     # 需 PostgreSQL
npm run build
```
