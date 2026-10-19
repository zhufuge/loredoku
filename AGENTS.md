# AGENTS.md

给在本仓库工作的 AI Agent / 新贡献者的操作手册。目标是让你**第一轮就按本仓的既有约定写代码**，不要重新发明做法。

---

## 1. 这是什么

`loredoku`（格物）—— 一款推理数独类游戏，包含游戏编辑工坊。工坊中包含地图、物品、角色和谜题的管理 monorepo。

- `packages/shared`：跨端共享的 TS 类型、常量、zod schema。**不依赖任何运行时**。
- `packages/server`：Koa + Knex + PostgreSQL。
- `packages/web`：Vite + React 18 + Zustand + TanStack Query + shadcn/ui。
- `docs/`：逐版需求文档（`v0.1.0` ~ `v0.5.9`），**每版文档最后一节是落点表 / 实现期裁定 / 验证证据 / 交付标准对照** —— 动手前先读对应版本的文档。
- `docs/map-management-and-editor.md`：地图管理页与地图编辑器的**功能说明**（当前状态，不是需求）。要确认某个控件 / 规则的现状看它，别从旧版需求文档里推断。
- `docs/layer-priority.md`：画布图层命名与次序的**唯一权威**。

---

## 2. 常用命令

```bash
npm install
npm run dev                 # 后端 3000 + 前端 5173（-s / -w 改端口，PUBLIC_BASE_URL 自动同步）
npm run dev:server          # 只起后端
npm run dev:web             # 只起前端
npm run build               # 构建全部 workspace
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
- 配色只用语义 token（`bg-background` / `text-muted-foreground` / `border-border` …），**不要写 `bg-white` 之类的定色**，那在深色下会变成白疤。地图背景、物品/角色色块、区域色属于**作品内容**，不随主题变（画布范围的界定见 `docs/map-management-and-editor.md` §6）。
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

## 4. 测试

### 4.1 临时文件

- **必须及时删除测试临时产物**, 比如 vitest.config.ts.timestamp-....mjs 和产生的数据库数据。
- `scripts/run-tests.sh` 每个文件都把输出写进固定的 `/tmp/vt.log`，**不要并行跑两个包** ——
  计数会串成另一个文件的，汇总里的 `?` 就是撞了。串行跑。

---

## 5. 提交前检查清单

```bash
npm run typecheck
bash scripts/run-tests.sh packages/web
bash scripts/run-tests.sh packages/shared
bash scripts/run-tests.sh packages/server     # 需 PostgreSQL
npm run build
```
