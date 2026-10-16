# loredoku · 格物

地图编辑器（Map Editor）—— 一个可视化工具，把带图案的「物品方块」拖拽放置到 `n × n` 的方格画布上，并对连续方格框选、命名、标记为区域，最终发布为可查看的「作品」。

- 项目名称：`loredoku`（中文名：格物）；包名 `@loredoku/shared` / `@loredoku/server` / `@loredoku/web`
- 技术栈：Node.js + TypeScript · Koa + PostgreSQL（Knex）· Vite + React 18 + TailwindCSS + shadcn/ui
- 仓库形态：npm workspaces monorepo（`shared` / `server` / `web`）
- 需求文档：见 [`docs/`](./docs)（`v0.1.0` ~ `v0.4.0` 逐版需求，最新为 v0.4.0）

---

## 目录结构

```
loredoku/
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
│       └── web/                    # Vite + React 前端
│       └── src/
│           ├── pages/          # ProjectsPage / ItemsPage / CharactersPage / WorksPage / GamesPage / GamePage / Editor / WorkView
│           ├── components/     # editor / item / character / project / game / map / ui
│           ├── stores/         # editorStore（编辑器状态 + 撤销栈）
│           ├── hooks/          # TanStack Query 数据 hooks
│           ├── api/            # Axios 接口封装
│           └── lib/            # 网格、命中检测、高亮、联动、线索解析、游戏放置、激活状态机等纯函数
├── docs/                       # 各版本需求文档
├── package.json                # workspace 脚本入口
└── tsconfig.base.json          # 共享 TS 配置（含 @loredoku/shared 路径别名）
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
| `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | PostgreSQL 连接 | `localhost:5432` / `postgres` / `loredoku` |
| `UPLOAD_ROOT` | 上传目录（默认 `packages/server/storage/uploads`） | `./storage/uploads` |
| `VITE_API_BASE_URL` | 前端 API 基址 | `http://localhost:3000/api` |

> 请先在 PostgreSQL 中创建数据库（默认名 `loredoku`）。

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

单个 workspace 可用 `--workspace`，例如 `npm run test --workspace @loredoku/server`。

> **提示**：server 端测试覆盖 projects / items / regions / versions 全流程，**依赖本地 PostgreSQL**，建议每次改动后都跑一遍：
> `cd packages/server && npx vitest run --no-cache`

---

## 功能概览

- **地图项目（`/projects`）**：创建 / 编辑 / 删除 / 复制地图，指定画布尺寸 `n × n`（2 ~ 24）。
- **物品管理（`/items`）**：维护图案方块（背景 / 物体两类），支持图片上传、尺寸、`canStand`（是否可站立）、缩略图与触发信息。
- **角色管理（`/characters`）**：维护参与者角色（头像、性别等）。
- **可视化编辑器（`/editor/:projectId`）**：拖拽放置物品、框选 / 笔刷绘制区域、区域命名与配色、橡皮擦、撤销 / 重做（上限 50 步）；画布**自适应方格宽度 90 ~ 240px**（v0.3.5 OPT-A01，v0.3.6 OPT-B02 追加底部工具条留白，v0.3.7 OPT-C01 四边各加 24px 外边距），缩放 25% ~ 400%；线条与字体随方格尺寸**等比缩放**（v0.3.6 OPT-B03）。
- **画布平移（v0.3.9 FEAT-E03）**：在地图**方格以外**的空白处按下并拖动即可平移画布；指针进入方格为 `pointer`（v0.3.9 FEAT-E04），空白处为 `grab` / 拖拽中 `grabbing`。工具栏中的「拖动」按钮已移除。
- **地图基本信息（`/editor/:projectId` 顶栏「基本信息」）**：右侧抽屉统一编辑本图的显示常量 —— 方格大小（缺省为自适应值，可覆盖 90 ~ 240）、画布外框 / 网格分隔线 / 鼠标光标框 / 操作光标框 / 区域轮廓线 / 区域高亮线的线宽与颜色、区域标签的字号 / 描边 / 颜色 / 高亮配色、标尺文本大小与到地图的间距、联动主题色调色板（默认红蓝，可增删改）。全部随草稿保存、随作品快照发布、可撤销（v0.3.8 FEAT-D01/D02/D03/D04）。
- **基本信息草稿化（v0.3.9 FEAT-E01）**：抽屉内的修改是**草稿**，不会立即改变画布，须点击底部的「保存」才生效；底部另有「取消」可放弃修改。有未保存修改时切换到其它信息栏会先弹出确认（继续编辑 / 放弃修改 / 保存并继续）。发布成功后画布保持原位，不再重置视口（v0.3.9 FIX-E01）。
- **基本信息即完整表单（v0.3.10 FIX-F01/FIX-F02）**：**画布尺寸**与样式同属一份草稿，一次「保存」同时写入两者；抽屉内的画布尺寸确认弹窗与提示文案已移除。数值控件**实时写入草稿**——点击输入框的自增按钮、逐字输入都会立刻反映到「保存」按钮上，无需先按回车或移开焦点（聚焦期间不回填文本，避免多位数字被钳制值覆盖）。
- **基本信息首次进入即保存（v0.3.10 FIX-F03）**：从未保存过基本信息的项目，第一次进入编辑器会自动把整份草稿（含画布尺寸）落库一次，保证「编辑器里看到的」与「草稿里存的」始终一致；已有未保存改动时不会抢先保存。
- **问号图标提示（v0.3.10 SPEC-F01）**：抽屉内所有需要说明的标签后面跟一个圆形问号图标，悬停显示完整说明；原先散落在字段下方的灰色说明段落已全部并入图标提示。
- **无边框取色器（v0.3.10 FIX-F04）**：`input type="color" 统一走共享组件 `ui/color-input`（无黑边框，仅一圈细 `ring` 保证浅色可见）。
- **性别符号加粗（v0.3.10 FIX-F06）**：♂ / ♀ 符号 `fontWeight: 700`，颜色不变。
- **画布缩放与方格大小相互独立（v0.3.8 FEAT-D05）**：底栏的放大 / 缩小 / 百分比只改变查看比例，**不修改任何数值**；只有「基本信息」里的方格大小会改变实际渲染尺寸。
- **参与者区**：标题栏 40px（与物品栏头部对齐）、单元格 110×104px、每框左上角 1 起序号（v0.3.6 OPT-B06）。
- **参与者联动**：悬停 / 点击参与者框，高亮其关联的角色、物品、区域、格子（红 / 蓝效果，无时长概念，结束时淡出）。
- **参与者位置条件（v0.4.1 FEAT-E01）**：参与者信息抽屉在「联动」与「保存」之间新增**位置条件**模块——点「添加位置」后进入**画布点选**模式（左侧提示「请在画布上点击要允许的位置（`Esc` 取消）」，`Esc` 或再点一次按钮退出），点选的可站立格以 `R{行} C{列}` 列出、可逐项删除。**多个位置之间是「或」关系，留空表示不限制位置**；结果随保存写入 `characterSlots[i].positionConditions`（`[{ x, y }]`，可缺省），草稿校验会拒绝越界坐标。
- **作品（`/works`）**：发布快照生成作品，表格化平铺展示，支持查看效果（`/works/:workId/view`）、导出 JSON、基于作品创建草稿、删除。
- **预览页与编辑页一致（v0.3.10 FIX-F07 / FEAT-F01 / FEAT-F02）**：预览页的参与者区直接复用编辑器的 `ParticipantPanel`（`readOnly` 模式：同一套矩阵卡片、序号、主题色圆头像、线索区与单框高亮，但不可拖动、无「×」按钮）；顶栏新增「标尺」开关（`Ruler` 图标，默认显示，选择存 `localStorage` 键 `loredoku.workview.ruler`）；预览页的方格大小、四周留白与标尺厚度一律按作品快照里的 `style` 计算（自适应时传入 `canvasInsets({ showRulers, rulerSize })`，与编辑器同一套预留）。
- **预览页标题（v0.4.0 OPT-G01）**：标题改为**地图名称**，版本号以 `v{N}` 徽标与标题同行展示，发布备注降级为次要文本；浏览器标签页同步为 `{地图名称} · 格物`。
- **作品部署（v0.4.0 FEAT-G02，`/works` 每行「部署」）**：把已发布作品部署为可玩的游戏。弹窗可改**游戏名称**（默认取作品名称）、填写**访问路径**（v0.4.1 OPT-W04，见下条）、上传**封面**（可留空，部署成功后上传）、选择**难度**五档（Very Easy / Easy / Medium / Hard / Expert，绿 → 黄绿 → 黄 → 橙 → 红）。**同一张地图只能部署一个版本**（`map_games.project_id` 唯一索引，再次部署覆盖旧行并重新分配 id），部署时把作品快照冗余拷贝进 `map_games.snapshot`，因此游戏渲染的是**部署那一刻的固定副本**，作品后续重新发布不影响已部署游戏。
- **作品页表头（v0.4.1 OPT-W01 / OPT-W02）**：表格精简为 **5 列：名称 / 版本 / 部署状态 / 发布时间 / 操作**（原尺寸、参与者数、区域数、物品数、备注五列移除，搜索仍可按备注命中）。「已部署」徽标**从操作列迁出到独立的部署状态列**，点击徽标直接进入 `/games/{访问路径}`；`deployed` 的判定由「按地图汇总」改为 **`project_id + version_no` 双重命中**——只有**真正被部署的那个版本行**才带徽标，同一地图的其它版本行显示 `—`，重新部署后旧行掉徽标、新行上徽标。
- **重新部署回填（v0.4.1 OPT-W03）**：打开部署弹窗时按该游戏上一次的取值回填**难度**与**访问路径**（名称仍取作品名称，Q4）。封面为**三态**——沿用已上传封面（默认，弹窗内直接预览）/ 选择新文件替换 / 点「移除」显式清空（`clearCover: true`，不传则保留库里的封面）。
- **访问路径（v0.4.1 OPT-W04）**：部署弹窗在名称下方新增**访问路径**输入框，默认按 **`puzzle-` + 名称转写 + `-` + 难度转写** 填充（如 `Flower Garden` + 非常简单 → `puzzle-flower-garden-very-easy`），下方实时预览 `/games/{当前值}`，右侧「重新生成」按当前名称与难度重算。名称或难度改动会**自动跟随**，一旦手动编辑过（`slugTouched`）或属于重新部署（回填即视为已确定）就不再被覆盖。转写规则：转小写 → 分隔符转 `-` → 去除非 `[a-z0-9-]` → 合并连续 `-` → 去首尾 `-`；**名称转写为空（全中文 / 纯符号）时不自动编造路径，而是报错要求手动填写**（v0.4.1 Q13）。校验要求 3 ~ 80 字符、`^[a-z0-9-]+$`、不以 `-` 开头或结尾，并**全局唯一**——另一张地图占用同一路径时部署失败并提示「该访问路径已被占用，请更换」，**不自动追加序号**（Q12）。游戏地址因此由 `/games/{数字 id}` 改为 **`/games/{访问路径}`**，旧链接不再可用（Q14）。
- **游戏首页（v0.4.0 FEAT-G01，`/games`）**：面向玩家的独立入口——**顶层路由，不用 `AppShell`**，玩家从这里看不到地图 / 物品 / 角色 / 作品等制作端模块，只能通过链接进入（作品页「已部署」徽标、游戏页「返回」按钮）。简约卡片网格（2 / 3 / 4 列响应式，间距 20px）。每张卡片展示**封面**（16:10，无封面时显示地图名称首字）、**名称**、**难度徽标**（五色）、**`n×n` 规格**；点击卡片进入游戏页面。空态给出前往作品管理页的链接。
- **游戏页面（v0.4.0 FEAT-G03，v0.4.1 起为 `/games/:slug`）**：左中右三栏的全屏游玩页（不用 `AppShell`，与编辑器同级的顶层路由）。
  - **左上**：返回按钮 + 游戏名称、封面缩略图、难度徽标、`n×n` 与来源版本；只读，不提供编辑。
  - **左下**：与预览页**同一个** `ParticipantPanel`（`readOnly`），联动效果完全一致；新增「点击参与者 → 进入放置状态」。放置态下悬停另一张卡片只临时切换联动预览，移开后**恢复已武装参与者的联动并保持高亮**——放置状态不随悬停退出，只有再次点击参与者或工具按钮才退出（v0.4.1 BUG-G02：恢复用幂等的 `restore` 事件，不是会反向关闭的 `click`）。**已放置的参与者在名单里变淡**（头像 `opacity: 0.45`，v0.4.1 SPEC-G05）。
  - **中间**：与预览页一致的地图（含标尺），新增**游戏放置层**与**工具提示层**两个游戏专属图层，**不渲染操作光标框**；画布**固定自适应**（无平移、无缩放），格内光标为 `pointer`。放置态下**短按格子放参与者编号**（九宫格候选），**长按格子（≥500ms）放参与者头像**（确认该格就是这位参与者，整格替换）；不满足条件的落点会 `toast` 说明原因（不可站立 / 已有禁止符号 / 已有头像 / 该参与者已在别处 / 九宫格已满）而不是静默失败。
  - **右侧工具栏**：禁止符号（`X` 图标，红色）/ 清除工具 / 回退 / 提交四个等宽按钮，激活态 `bg-accent` 且**互斥**；清除按钮**长按 500ms 清空全图**（记一步可回退）；除四个工具按钮外只有一个**标尺开关**；底部显示「已放置 N 个 / 可回退 M 步」。参与者编号**从 1 开始**（与参与者面板左上角序号一致）。
- **放置规则（v0.4.0 SPEC-G01 ~ SPEC-G04 + v0.4.1 SPEC-G05 / SPEC-G06 / FEAT-V01）**：每格放置内容是「参与者图片 / 参与者标号列表 / 禁止符号」三者互斥的形态之一。标号按 **3×3 九宫格**从左到右、从上到下排列（最多 9 个，字号约 `cellSize/4`，颜色取参与者主题色 + 黑色描边）；短按逐位追加标号，**长按整格替换为头像**（九宫格已满只挡短按，不挡长按确认）。**有不可站立物品的格子不能放置**；禁止符号会**激活该格的不可站立遮罩**，并清除该格原有标号。回退栈上限 200 步，清空全图只记一步；**提交后不能回退到提交点之前**。规则全部集中在纯函数库 `packages/web/src/lib/gamePlacement.ts`。
  - **唯一性（SPEC-G05）**：每位参与者**只能占一个格子**——已在别处的参与者再次放到其它格会被拒绝（同格重放只是把「标号」提升为「头像」）；清除 / 回退后恢复可放置。
  - **自动 ×（SPEC-G06）**：放置成功后，**同行同列**中「可站立、原本没有 ×、也没有头像」的格子会自动补上禁止符号；不可站立格、已有头像格、已有 × 格一律跳过。自动 × 与放置**合并为一步**，回退一次即全部撤销。
  - **提交校验（FEAT-V01）**：提交前校验**编号 1→n 是否全部放置**、**行互斥**、**列互斥**、**位置条件（OR 语义，留空即不限制）**；不通过时弹出「提交未通过」对话框，**一次列出全部问题**（按编号排序，每条带「未放置 / 同行 / 同列 / 位置条件」徽标），修正后可再次提交。

### 方格要素（v0.3.5 OPT-A04 §3.2 + v0.3.6 OPT-B03/B04 + v0.3.7 OPT-C05）

单个方格自内向外分四层：**Content**（物品图）→ **Inner Line**（内描边）→ **Border**（网格线，相邻格共享一条）→ **Outline**（外描边，不参与布局）。

| 要素 | 基准值（cellSize = `BASE_CELL` = 120） | 缩放 |
|---|---|---|
| 网格分隔线（相邻格共享） | 2px | × `scale` |
| 画布外框（独立成层） | 6px = 区域轮廓线默认宽 | × `scale` |
| 内描边 Inner Line（鼠标光标框） | 2px | × `scale` |
| 操作光标框 Outer Line | 2px | × `scale` |
| 区域轮廓线 | 区域自身 `borderWidth`（4 ~ 12；缺省取自「基本信息」） | × `scale` |
| 区域高亮线 | 4px，紧贴区域轮廓线**内侧**向内扩展 | × `scale` |
| 区域标签 | 字号 17px（悬停 19px）/ 描边 4px | × `scale` |
| 标尺字符 | 17px（操作格 19px） | × `scale` × `zoom` |
| 物件层物品内边距 | 4px | × `scale`，clamp `[2, 12]` |

`scale = cellSize / BASE_CELL`；线条宽度统一 clamp `[0.5, 12]`、字体 clamp `[9, 28]`（全项目共用一组上下限）。缩放只在 `cellSize` 变化时重算，画布 zoom 由容器 `transform` 负责，不会二次缩放。

### 画布图层堆叠（v0.3.9 SPEC-E01，v0.4.0 SPEC-G01/G02 扩为 15 层）

完整规范见 [`docs/layer-priority.md`](./docs/layer-priority.md)，该文档是图层**命名与次序的唯一权威**。
每层都有中文名 / 英文名 / 代码常量名三个标识，文档、代码与界面文案必须一致：

优先级（由高到低）与 z-index：

| 序号 | 中文名 | 英文名 | 代码常量名 | z-index |
|---|---|---|---|---|
| 1 | 鼠标光标框 | Mouse Cursor Box | `mouseCursorBox` | 46 |
| 2 | 操作光标框 | Operation Cursor Box | `operationCursorBox` | 45 |
| 3 | 区域标签 | Region Label | `regionLabel` | 42 |
| 4 | 工具提示层 | Game Tool Hint Layer | `gameToolHint` | 41 |
| 5 | 游戏放置层 | Game Placement Layer | `gamePlacement` | 40 |
| 6 | 物件图层 | Object Layer | `objectLayer` | 38 |
| 7 | 画布外框 | Canvas Frame | `canvasFrame` | 36 |
| 8 | 网格分隔线 | Grid Separator | `gridSeparator` | 34 |
| 9 | 区域轮廓线 | Region Outline | `regionOutline` | 32 |
| 10 | 不可站立遮罩 | Non-standable Mask | `nonStandableMask` | 30 |
| 11 | 区域高亮线 | Region Highlight | `regionHighlight` | 28 |
| 12 | 方块高亮 | Cell Highlight | `cellHighlight` | 26 |
| 13 | 背景高亮 | Background Highlight | `backgroundHighlight` | 24 |
| 14 | 背景图层 | Background Layer | `backgroundLayer` | 20 |
| 15 | 画布底色 | Canvas Base | `canvasBase` | 10 |

表内 15 层与 `MAP_LAYER_ORDER` 一一对应；区域填充（z = 22）是 v0.2.5 遗留层，不在表内。
**工具提示层**与**游戏放置层**是 v0.4.0 新增的**游戏页面专属**图层（编辑器与预览页不渲染）：前者画跟随指针的待放置预览（标号 / `×` / 橡皮），后者画玩家已放置的内容；二者夹在区域标签与物件图层之间，页面按需裁剪层集合（游戏页不渲染操作光标框）。
不可站立遮罩位于区域轮廓线**之下**、区域高亮线**之上**（v0.3.8 起，取代 v0.3.5 的「覆盖物品图」约定）；游戏中的禁止符号同样点亮该遮罩。
v0.3.9 / v0.4.0 的旧名 → 新名对照见规范文档 §6 命名迁移记录。

**区域高亮线（v0.3.9 FIX-E02）**：由纯函数 `buildRegionHighlightPaths`（`packages/web/src/lib/region.ts`）
先追踪区域闭合轮廓、再把每条边的支撑线沿法向向内偏移、最后用相邻偏移直线的**交点**重建顶点，
输出单条**连续闭合**路径（`M..L..Z` + `strokeLinejoin="miter"`），直线段与拐角均不再断开。

### 交互色板（v0.3.5 OPT-A06 §5.1）

`HIGHLIGHT_RED = #EF9A9A`、`HIGHLIGHT_BLUE = #90CAF9` 是默认调色板项，v0.3.8 起实际取值来自**每张地图自己的调色板**（`style.linkageColors`，key → hex），统一驱动方块高亮、背景高亮与区域高亮线，同时是鼠标提示框「被阻挡色」与操作提示框颜色的缺省值。参与者主题色 / 区域颜色 / 物品图 不受调色板影响。

### 标尺字符（v0.3.6 OPT-B05 §5 + v0.3.7 OPT-C02 + v0.3.9 FEAT-E02 + v0.3.10 FEAT-F01）

默认淡灰 `#9CA3AF` / **17px**；鼠标所在行列变深灰 `#374151`（字号不变，**不使用蓝色或下划线**）；操作光标框所在行列深灰 + **19px**（叠加时操作格优先）。字号与到地图的间距均可在「基本信息 → 标尺」中配置（v0.3.9 FEAT-E02）：文本大小 9 ~ 32（默认 17，操作格恒为 +2）、间距 0 ~ 32（默认 6）。标尺条厚度由 `rulerStripSize({maxFontSize, gap})` 动态求得（不小于 `RULER_SIZE = 28`），因此加大字号不会让文字溢出。字号仍随 `scale × zoom` 缩放。

标尺本体抽成了共享组件 `packages/web/src/components/map/MapRulerStrips.tsx`（v0.3.10 FEAT-F01），编辑器与作品预览页渲染**同一份**几何：预览页无「操作光标框」，因此 `operationCell` 恒为 `null`，只有「悬停行列变深灰」一档；预览页顶栏提供「标尺」开关，默认显示，选择持久化在 `localStorage` 键 `loredoku.workview.ruler`（`visible` / `hidden`）。

### 地图样式常量与缺省值（v0.3.8 FEAT-D02 + v0.3.9 SPEC-E01 / FEAT-E02）

`MapDraft.style`（可缺省，缺省即内置默认）保存本图的显示常量，编辑器保存时始终写回完整样式：

| 分组 | 字段 | 缺省值 | 范围 |
|---|---|---|---|
| 画布 | `cellSize` | `null`（自适应） | 90 ~ 240 整数 |
| 线条 | `canvasFrame` 线宽 / 颜色 | 6px / `#000000` | 1 ~ 12 / `#RRGGBB` |
| 线条 | `gridSeparator` 线宽 / 颜色（原 `border`） | 2px / `#000000` | 1 ~ 12 / `#RRGGBB` |
| 线条 | `mouseCursorBox` 线宽 / 颜色 / 阻挡色 / 阴影环（原 `mouseCursor`） | 2px / `#FFFFFF` / `#EF9A9A` / `rgba(0,0,0,0.15)` | 1 ~ 12 / `#RRGGBB` |
| 线条 | `operationCursorBox` 线宽 / 颜色 / 外扩（原 `operationCursor`） | 2px / `#90CAF9` / 1px | 1 ~ 12 / 0 ~ 8 |
| 线条 | `regionOutline` 线宽 / 颜色（原 `regionBorder`） | 6px / `#000000` | 4 ~ 12（改宽同步所有区域） |
| 线条 | `regionHighlight` 线宽 / 颜色 | 4px / `#90CAF9` | 1 ~ 12 / `#RRGGBB` |
| 区域标签 | `regionLabel.fontSize` / `strokeWidth` / `color` / `strokeColor` | 17 / 4 / `#FFFFFF` / `#000000` | 9 ~ 48 / 0 ~ 12 / `#RRGGBB` |
| 区域标签 | `regionLabel.hoverFontSize` / `hoverColor` / `hoverStrokeColor` | 19 / `#FFFFFF` / `#90CAF9` | 9 ~ 48 / `#RRGGBB` |
| 标尺 | `ruler.fontSize` / `ruler.gap` | 17 / 6 | 9 ~ 32 / 0 ~ 32 |
| 联动主题色 | `linkageColors: {key,label,color}[]` | 红 / 蓝 | 2 ~ 12 项 |

线宽与字号都是**基准值**，仍按 `cellSize / BASE_CELL` 等比缩放。解析与 clamp 集中在 `packages/web/src/lib/mapStyle.ts` 的 `resolveMapStyle`。草稿 JSON 版本相应提升为 `MAP_JSON_VERSION = 2`（`version = 1` 的旧数据仍被接受，无需迁移脚本）。
v0.3.9 SPEC-E01 把四个样式字段改名为规范名（见上表括号内旧名），`docs/layer-priority.md` §6 有完整迁移记录。

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
| 游戏 | `POST /api/projects/:id/games`（部署，同地图覆盖；请求体可选 `slug`，缺省 / 空由后端按 §4.3 计算）、`GET /api/games`（游戏首页列表，含 `slug`）、`GET /api/games/slug/:slug`（**v0.4.1 新增**，游戏页数据源，按访问路径取详情）、`GET /api/games/:id`（保留，封面上传等内部流程用）、`POST /api/games/:id/cover`（封面上传） |
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

- 使用 **Vitest**（web 侧 `environment: 'jsdom'`）。组件行为尽量以**无依赖纯函数**覆盖（`lib/linkageActivation`、`lib/cellSelection`、`lib/highlight`、`lib/editorInit`、`editorStore` 等）。
- `EditorCanvas.noDrag.test.ts`、`MapInfoDrawer.test.tsx`、`WorkViewPage.preview.test.ts`、`EditorPage.autoSave.test.ts` 通过 `import.meta.glob(..., { query: '?raw' })` 读取源码，断言画布内「点击可选中、绝不注册拖动」、颜色控件统一走 `ColorInput`、预览页复用 `ParticipantPanel` / `MapRulerStrips`、基本信息一次提交等**结构性规则**。
- 少量组件级用例（如 `MapInfoDrawer.test.tsx`）在 jsdom 下直接渲染并断言交互；本环境未安装 testing-library，断言只用原生 DOM API。

```bash
npm run typecheck          # 类型检查
npm test                   # 全量测试
cd packages/server && npx vitest run --no-cache   # 后端接口测试（需 PostgreSQL）
```

---

## 约定与注意事项

- **拖拽**：全局仅两类拖拽（队伍槽位 → 画布、物品抽屉 → 画布），统一用 **Pointer Events**（`setPointerCapture`）实现，不使用 HTML5 原生 `draggable`。
- **画布内行为**：画布内的物品 / 角色仅支持单击选中与删除，**不允许拖动移动**；所有 `<img>` 一律 `draggable={false}`。
- **平移画布**：在地图方格**以外**的空白处按住拖动即可平移（v0.3.9 FEAT-E03），工具栏不再提供「拖动」按钮；指针在方格内为 `pointer`，空白处为 `grab`。
- **弹窗关闭方式**：所有 Dialog 统一禁止「点击遮罩关闭」（v0.3.9 FIX-E03），只能通过关闭按钮 / 取消 / `Esc`，避免误触丢失已填内容。
- **基本信息是完整表单（v0.3.10 FIX-F01/FIX-F02）**：画布尺寸与样式同属一份草稿，`onCommit(style, gridSize)` 一次提交；数值控件每次 `change` 即写草稿（失焦 / 回车只负责回退非法输入），因此**不需要**先按回车才能点「保存」。空字段不等于 0，失焦会还原为已保存值。
- **组件复用**：预览页的参与者区（`ParticipantPanel readOnly`）与标尺（`MapRulerStrips`）与编辑器共用同一份实现，改动任一处必须同时验证两端。
- **命名一致性**：前端文案与路由统一使用「作品」（`/works`、`/works/:workId/view`）；后端沿用 `map_versions` / `version_no` / `/versions`，不做改动。
- **数据模型**：参与者不进入地图；`CharacterSlotEntry` 携带 `themeColor` + `clue` + 扁平 `linkages` + 可选 `positionConditions`（v0.4.1 FEAT-E01，`[{ x, y }]`，`.strict()` 下必须显式声明新字段，否则旧 payload 被拒）。`characterSlotEntrySchema` 使用 `.strict()` 拒绝遗留的 `triggers` 字段。
- **迁移**：`db/migrations/` 目录下的每个文件都会被 Knex 当作迁移加载，辅助模块不要放在该目录（参与者迁移的纯变换函数位于 `server/src/service/draftLinkageMigration.ts`，v0.4.1 的 `map_games.slug` 回填位于 `server/src/service/gameSlugBackfill.ts`）。**索引即约束**：`table.unique(cols, { indexName })` 建的是 UNIQUE **约束**，回滚必须用 `table.dropUnique(cols, name)`，`DROP INDEX` 会以 `2BP01` 失败。
- **访问路径常量**：转写 / 校验一律走 `@loredoku/shared` 的 `slugify` / `buildDefaultSlug` / `slugError` / `normalizeSlugInput`，前端只做预览与净化，**判定以服务端为准**；难度转写用 `GAME_DIFFICULTY_SLUGS` 固定表，避免 `veryEasy` 这类驼峰泄漏到 URL。
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
| `docs/v0.3.8.md` | 区域高亮线接线修复、地图基本信息（样式常量）、方格大小覆盖、联动调色板、缩放语义 |
| `docs/v0.3.9.md` | 发布后保持视口、区域高亮线闭合、基本信息草稿化与保存 / 取消、标尺配置、画布外空白拖拽平移、图层命名规范化 |
| `docs/v0.3.10.md` | 基本信息完整草稿化（含画布尺寸）、实时写入、首次进入即保存、无边框取色器、问号图标提示、性别符号加粗、预览页复用参与者面板与标尺 |
| `docs/v0.4.0.md` | 信息框残留修复、预览页标题、游戏首页 / 作品部署 / 游戏页面、游戏放置层与工具提示层 |
| `docs/v0.4.1.md` | 作品页表头 5 列与按版本判定「已部署」、部署回填、**访问路径（`/games/:slug`）**、放置唯一性与自动 ×、参与者位置条件、提交校验、点击参与者高亮保持（当前版本） |
| `docs/layer-priority.md` | 《画布图层优先级规范》—— 15 层的中文名 / 英文名 / 次序的唯一权威 |
