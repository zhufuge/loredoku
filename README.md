# murdoku-maker

地图编辑器（Map Editor）—— 一个可视化工具，把带图案的「物品方块」拖拽放置到 `n × n` 的方格画布上，并对连续方格框选、命名、标记为区域，最终发布为可查看的「作品」。

- 技术栈：Node.js + TypeScript · Koa + PostgreSQL（Knex）· Vite + React 18 + TailwindCSS + shadcn/ui
- 仓库形态：npm workspaces monorepo（`shared` / `server` / `web`）
- 需求文档：见 [`docs/`](./docs)（`v0.1.0` ~ `v0.3.8` 逐版需求，最新为 v0.3.8）

---

## 目录结构

```
murdoku-maker/
├── packages/
│   ├── shared/                 # 跨端共享：TS 类型、常量、zod schema
│   │   └── src/
│   │       ├── constants.ts    # 网格/物品/区域/角色/图层等全局常量
│   │       ├── color.ts        # 主题色调色板与颜色工具
│   │       ├── schemas/        # item / character / map / mapDraft / participant 等 zod 校验
│   │       └── types/          # 领域模型与数据库行类型
│   ├── server/                 # Koa 后端
│   │   └── src/
│   │       ├── app.ts          # 应用装配（中间件、路由、静态资源）
│   │       ├── config/env.ts   # 环境变量读取
│   │       ├── router/         # 路由（health / projects / items / characters / versions）
│   │       ├── controller/     # 控制器
│   │       ├── service/        # 业务逻辑（含发布校验 versionService）
│   │       ├── repository/     # Knex 数据访问
│   │       ├── middleware/     # 错误处理、404、上传
│   │       ├── db/             # knex 连接与 migrations
│   │       └── utils/          # 日志、图片、响应封装、校验
│   └── web/                    # Vite + React 前端
│       └── src/
│           ├── pages/          # ProjectsPage / ItemsPage / CharactersPage / WorksPage / Editor / WorkView
│           ├── components/     # editor / item / character / project / map / ui
│           ├── stores/         # editorStore（编辑器状态 + 撤销栈）
│           ├── hooks/          # TanStack Query 数据 hooks
│           ├── api/            # Axios 接口封装
│           └── lib/            # 网格、命中检测、高亮、联动、线索解析等纯函数
├── docs/                       # 各版本需求文档
├── package.json                # workspace 脚本入口
└── tsconfig.base.json          # 共享 TS 配置（含 @murdoku/shared 路径别名）
```

---

## 环境要求

| 依赖 | 版本 |
|---|---|
| Node.js | ≥ 20 |
| PostgreSQL | 15+ |
| npm | 随 Node 提供（使用 workspaces） |

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，并按本地情况修改：

```bash
cp .env.example .env
```

关键项：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` / `HOST` | 后端监听端口与地址 | `3000` / `0.0.0.0` |
| `PUBLIC_BASE_URL` | 拼接文件访问 URL 的公开前缀 | `http://localhost:3000` |
| `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | PostgreSQL 连接 | `localhost:5432` / `postgres` / `murdoku` |
| `UPLOAD_ROOT` | 上传目录（默认 `packages/server/storage/uploads`） | `./storage/uploads` |
| `VITE_API_BASE_URL` | 前端 API 基址 | `http://localhost:3000/api` |

> 请先在 PostgreSQL 中创建数据库（默认名 `murdoku`）。

### 3. 初始化数据库

```bash
npm run db:migrate      # 执行全部迁移
npm run db:rollback     # 回滚最近一批迁移
```

### 4. 启动开发环境

```bash
npm run dev
```

会并行启动：

- 后端：`http://localhost:3000`（tsx watch 热重载）
- 前端：`http://localhost:5173`（Vite，已配置 `/api` 反向代理到 3000）

浏览器访问 **http://localhost:5173** 即可。

---

## 常用脚本

在仓库根目录执行：

| 命令 | 说明 |
|---|---|
| `npm run dev` | 同时启动 server + web |
| `npm run dev:server` / `npm run dev:web` | 单独启动后端 / 前端 |
| `npm run build` | 构建全部 workspace |
| `npm run typecheck` | 全量 TypeScript 类型检查 |
| `npm test` | 运行全部测试（Vitest） |
| `npm run db:migrate` / `db:rollback` | 数据库迁移 / 回滚 |

单个 workspace 可用 `--workspace`，例如 `npm run test --workspace @murdoku/server`。

> **提示**：server 端测试覆盖 projects / items / regions / versions 全流程，**依赖本地 PostgreSQL**，建议每次改动后都跑一遍：
> `cd packages/server && npx vitest run --no-cache`

---

## 功能概览

- **地图项目（`/projects`）**：创建 / 编辑 / 删除 / 复制地图，指定画布尺寸 `n × n`（2 ~ 24）。
- **物品管理（`/items`）**：维护图案方块（背景 / 物体两类），支持图片上传、尺寸、`canStand`（是否可站立）、缩略图与触发信息。
- **角色管理（`/characters`）**：维护参与者角色（头像、性别等）。
- **可视化编辑器（`/editor/:projectId`）**：拖拽放置物品、框选 / 笔刷绘制区域、区域命名与配色、橡皮擦、平移、撤销 / 重做（上限 50 步）；画布**自适应方格宽度 90 ~ 240px**（v0.3.5 OPT-A01，v0.3.6 OPT-B02 追加底部工具条留白，v0.3.7 OPT-C01 四边各加 24px 外边距），缩放 25% ~ 400%；线条与字体随方格尺寸**等比缩放**（v0.3.6 OPT-B03）。
- **地图基本信息（`/editor/:projectId` 顶栏「基本信息」）**：右侧抽屉统一编辑本图的显示常量 —— `n`、方格大小（缺省为自适应值，可覆盖 90 ~ 240）、地图最外边框 / 边框 border / 鼠标框 / 操作框 / 区域边界线 / 区域高亮线的线宽与颜色、区域名称的字号 / 描边 / 颜色 / 高亮配色、联动主题色调色板（默认红蓝，可增删改）。全部随草稿保存、随作品快照发布、可撤销（v0.3.8 FEAT-D01/D02/D03/D04）。
- **画布缩放与方格大小相互独立（v0.3.8 FEAT-D05）**：底栏的放大 / 缩小 / 百分比只改变查看比例，**不修改任何数值**；只有「基本信息」里的方格大小会改变实际渲染尺寸。
- **参与者区**：标题栏 40px（与物品栏头部对齐）、单元格 110×104px、每框左上角 1 起序号（v0.3.6 OPT-B06）。
- **参与者联动**：悬停 / 点击参与者框，高亮其关联的角色、物品、区域、格子（红 / 蓝效果，无时长概念，结束时淡出）。
- **作品（`/works`）**：发布快照生成作品，表格化平铺展示，支持查看效果（`/works/:workId/view`）、导出 JSON、基于作品创建草稿、删除。

### 方格要素（v0.3.5 OPT-A04 §3.2 + v0.3.6 OPT-B03/B04 + v0.3.7 OPT-C05）

单个方格自内向外分四层：**Content**（物品图）→ **Inner Line**（内描边）→ **Border**（网格线，相邻格共享一条）→ **Outline**（外描边，不参与布局）。

| 要素 | 基准值（cellSize = `BASE_CELL` = 120） | 缩放 |
|---|---|---|
| 内部分隔线 Border | 2px | × `scale` |
| 画布外边框（独立成层） | 6px = 区域边界线默认宽 | × `scale` |
| 内描边 Inner Line（鼠标框） | 2px | × `scale` |
| 操作框 Outer Line | 2px | × `scale` |
| 区域边界线 | 区域自身 `borderWidth`（4 ~ 12；缺省取自「基本信息」） | × `scale` |
| 区域高亮线 | 4px，紧贴区域边界线**内侧**向内扩展 | × `scale` |
| 区域名称 | 字号 17px（悬停 19px）/ 描边 4px | × `scale` |
| 标尺字符 | 17px（操作格 19px） | × `scale` × `zoom` |
| 物件层物品内边距 | 4px | × `scale`，clamp `[2, 12]` |

`scale = cellSize / BASE_CELL`；线条宽度统一 clamp `[0.5, 12]`、字体 clamp `[9, 28]`（全项目共用一组上下限）。缩放只在 `cellSize` 变化时重算，画布 zoom 由容器 `transform` 负责，不会二次缩放。

### 画布图层堆叠（v0.3.8 SPEC-D01）

完整规范见 [`docs/layer-priority.md`](./docs/layer-priority.md)，该文档是图层次序的**唯一权威**。

优先级（由高到低）与 z-index：

| 序号 | 图层 | z-index |
|---|---|---|
| 1 | 当前鼠标所在框（随指针，白 / 淡红） | 46 |
| 2 | 当前操作方格框（固定在选中格，淡蓝） | 45 |
| 3 | 区域名称 | 42 |
| 4 | 物体 | 40 |
| 5 | 地图最外边框（画在画布矩形之外） | 39 |
| 6 | 边框 border（内部分隔线） | 38 |
| 7 | 区域边界线 | 36 |
| 8 | 不可站立物体阴影（`rgba(0,0,0,0.18)`） | 35 |
| 9 | 区域高亮线 | 32 |
| 10 | 方块高亮 | 30 |
| 11 | 背景高亮 | 28 |
| 12 | 背景 | 20 |
| 13 | 空方格 | 10 |

表内 13 层与 `MAP_LAYER_ORDER` 一一对应；区域填充（z = 22）是 v0.2.5 遗留层，不在表内。
不可站立阴影位于区域边界线**之下**、区域高亮线**之上**（v0.3.8 起，取代 v0.3.5 的「覆盖物品图」约定）。

### 交互色板（v0.3.5 OPT-A06 §5.1）

`HIGHLIGHT_RED = #EF9A9A`、`HIGHLIGHT_BLUE = #90CAF9` 是默认调色板项，v0.3.8 起实际取值来自**每张地图自己的调色板**（`style.linkageColors`，key → hex），统一驱动方块高亮、背景高亮与区域高亮线，同时是鼠标提示框「被阻挡色」与操作提示框颜色的缺省值。参与者主题色 / 区域颜色 / 物品图 不受调色板影响。

### 标尺字符（v0.3.6 OPT-B05 §5 + v0.3.7 OPT-C02）

默认淡灰 `#9CA3AF` / **17px**；鼠标所在行列变深灰 `#374151`（字号不变，**不使用蓝色或下划线**）；操作提示框所在行列深灰 + **19px**（叠加时操作格优先）。标尺条与画布之间保留 `RULER_GAP = 6px` 间隙；字号均随 `scale × zoom` 缩放。

### 地图样式常量与缺省值（v0.3.8 FEAT-D02）

`MapDraft.style`（可缺省，缺省即内置默认）保存本图的显示常量，编辑器保存时始终写回完整样式：

| 分组 | 字段 | 缺省值 | 范围 |
|---|---|---|---|
| 画布 | `cellSize` | `null`（自适应） | 90 ~ 240 整数 |
| 线条 | `canvasFrame` 线宽 / 颜色 | 6px / `#000000` | 1 ~ 12 / `#RRGGBB` |
| 线条 | `border` 线宽 / 颜色 | 2px / `#000000` | 1 ~ 12 / `#RRGGBB` |
| 线条 | `mouseCursor` 线宽 / 颜色 / 阻挡色 / 阴影环 | 2px / `#FFFFFF` / `#EF9A9A` / `rgba(0,0,0,0.15)` | 1 ~ 12 / `#RRGGBB` |
| 线条 | `operationCursor` 线宽 / 颜色 / 外扩 | 2px / `#90CAF9` / 1px | 1 ~ 12 / 0 ~ 8 |
| 线条 | `regionBorder` 线宽 / 颜色 | 6px / `#000000` | 4 ~ 12（改宽同步所有区域） |
| 线条 | `regionHighlight` 线宽 / 颜色 | 4px / `#90CAF9` | 1 ~ 12 / `#RRGGBB` |
| 区域名称 | `fontSize` / `strokeWidth` / `color` / `strokeColor` | 17 / 4 / `#FFFFFF` / `#000000` | 9 ~ 48 / 0 ~ 12 / `#RRGGBB` |
| 区域名称 | `hoverFontSize` / `hoverColor` / `hoverStrokeColor` | 19 / `#FFFFFF` / `#90CAF9` | 9 ~ 48 / `#RRGGBB` |
| 联动主题色 | `linkageColors: {key,label,color}[]` | 红 / 蓝 | 2 ~ 12 项 |

线宽与字号都是**基准值**，仍按 `cellSize / BASE_CELL` 等比缩放。解析与 clamp 集中在 `packages/web/src/lib/mapStyle.ts` 的 `resolveMapStyle`。草稿 JSON 版本相应提升为 `MAP_JSON_VERSION = 2`（`version = 1` 的旧数据仍被接受，无需迁移脚本）。

### 编辑器焦点互斥（v0.3.7 OPT-C07）

参与者联动（悬停 / 点击）与方格选中（操作提示框 + 信息抽屉）互斥：点击画布任意方格会清除参与者激活并把焦点交给方格，点击参与者则清空方格选中。规则集中在 `packages/web/src/lib/editorFocus.ts` 的 `reduceEditorFocus`，`Esc` 清除全部焦点。

---

## 后端 API 概览

统一前缀 `/api`，响应含业务错误码（见 `ErrorCode`）。

| 资源 | 主要端点 |
|---|---|
| 健康检查 | `GET /api/health` |
| 项目 | `GET/POST /api/projects`、`GET/PATCH/DELETE /api/projects/:id`、`POST /api/projects/:id/duplicate` |
| 地图数据 | `GET/PUT /api/projects/:id/map`、`PATCH /api/projects/:id/grid-size`、`GET /api/projects/:id/map/export`、`POST /api/projects/:id/map/import` |
| 区域 | `GET/POST /api/projects/:id/regions`、`PATCH/DELETE /api/projects/:id/regions/:regionId` |
| 作品 / 版本 | `POST/GET /api/projects/:id/versions`、`GET /api/projects/:id/versions/:versionNo`、`POST .../versions/:versionNo/draft`、`DELETE .../versions/:versionNo`、`GET /api/versions`（跨地图作品列表） |
| 物品 | `GET/POST /api/items`、`GET/PATCH/DELETE /api/items/:id`、`POST /api/items/:id/enable|disable`、`GET /api/items/:id/usages`、`PUT /api/items/:id/triggers`、`POST/DELETE /api/items/:id/image` |
| 角色 | `GET/POST /api/characters`、`GET/PATCH/DELETE /api/characters/:id`、`POST /api/characters/:id/enable|disable`、`GET /api/characters/:id/usages`、`POST/DELETE /api/characters/:id/avatar` |

> 兼容：`/api/cards*` 会 308 永久重定向到 `/api/items*`（v0.1 遗留命名）。

### 发布校验规则（P1 ~ P5）

发布作品时由 `server/src/service/versionService.ts` 校验：

- **P1**：至少 1 名可用参与者；
- **P2**：无头像的参与者视为未启用，不计入；
- **P3**：区域之间不得交叉；
- **P4**：多格物品需落在画布内（v0.3.4 OPT-904 起 `can_stand === false` 的物品**允许**放在物体层）；
- **P5**：参与者联动的引用有效（角色目标必须存在于某个槽位）。

---

## 测试说明

- 使用 **Vitest**。组件行为尽量以**无依赖纯函数**覆盖（`lib/linkageActivation`、`lib/cellSelection`、`lib/highlight`、`editorStore` 等）。
- `EditorCanvas.noDrag.test.ts` 通过 `import.meta.glob(..., { query: '?raw' })` 读取源码，断言画布内「点击可选中、绝不注册拖动」。
- 本环境无 jsdom / testing-library，前端组件以纯函数与源码断言为主。

```bash
npm run typecheck          # 类型检查
npm test                   # 全量测试
cd packages/server && npx vitest run --no-cache   # 后端接口测试（需 PostgreSQL）
```

---

## 约定与注意事项

- **拖拽**：全局仅两类拖拽（队伍槽位 → 画布、物品抽屉 → 画布），统一用 **Pointer Events**（`setPointerCapture`）实现，不使用 HTML5 原生 `draggable`。
- **画布内行为**：画布内的物品 / 角色仅支持单击选中与删除，**不允许拖动移动**；所有 `<img>` 一律 `draggable={false}`。
- **命名一致性**：前端文案与路由统一使用「作品」（`/works`、`/works/:workId/view`）；后端沿用 `map_versions` / `version_no` / `/versions`，不做改动。
- **数据模型**：参与者不进入地图；`CharacterSlotEntry` 携带 `themeColor` + `clue` + 扁平 `linkages`。`characterSlotEntrySchema` 使用 `.strict()` 拒绝遗留的 `triggers` 字段。
- **迁移**：`db/migrations/` 目录下的每个文件都会被 Knex 当作迁移加载，辅助模块不要放在该目录（参与者迁移的纯变换函数位于 `server/src/service/draftLinkageMigration.ts`）。
- **主题色**：调色板共 15 色（见 `THEME_COLOR_PALETTE`），默认 `#FFFFFF`。

---

## 相关文档

| 文档 | 内容 |
|---|---|
| `docs/v0.1.0.md` | 产品 + 技术需求总纲 |
| `docs/v0.2.x.md` | 方格 / 区域 / 物品能力迭代 |
| `docs/v0.3.0.md` ~ `v0.3.3.md` | 参与者、联动、主题色、槽位尺寸等专项优化 |
| `docs/v0.3.4.md` | 图层优先级、鼠标交互、角色联动、作品管理表格化 |
| `docs/v0.3.5.md` | 画布自适应、参与者框加大、方格线条与提示框拆分、高亮调淡 |
| `docs/v0.3.6.md` | 高亮线加宽、底部留白、线条字体等比缩放、外边框加粗、标尺样式、参与者序号 |
| `docs/v0.3.7.md` | 区域高亮线斜线修复、外边距、标尺字号、外框分层、区域名称/线宽基准、物体内缩、点击方格清除联动 |
| `docs/v0.3.8.md` | 区域高亮线接线修复、地图基本信息（样式常量）、方格大小覆盖、联动调色板、缩放语义（当前版本） |
| `docs/layer-priority.md` | 《画布图层优先级规范》—— 13 层图层次序的唯一权威 |
