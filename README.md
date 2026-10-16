# loredoku · 格物

地图编辑器（Map Editor）—— 一个可视化工具，把带图案的「物品方块」拖拽放置到 `n × n` 的方格画布上，并对连续方格框选、命名、标记为区域；地图**按版本发布**（每次发布生成一个带版本标记的新条目），再以某个**已发布版本**为画布创建「谜题」——参与者、联动与主题色都归谜题所有，谜题可预览、导出 JSON，并部署为可玩的游戏。

- 项目名称：`loredoku`（中文名：格物）；包名 `@loredoku/shared` / `@loredoku/server` / `@loredoku/web`
- 技术栈：Node.js + TypeScript · Koa + PostgreSQL（Knex）· Vite + React 18 + TailwindCSS + shadcn/ui
- 仓库形态：npm workspaces monorepo（`shared` / `server` / `web`）
- 需求文档：见 [`docs/`](./docs)（`v0.1.0` ~ `v0.5.0` 逐版需求，最新为 v0.5.0）

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
│   │       ├── router/         # 路由（health / projects / puzzles / items / characters / versions / games）
│   │       ├── controller/     # 控制器
│   │       ├── service/        # 业务逻辑（含发布校验 versionService）
│   │       ├── repository/     # Knex 数据访问
│   │       ├── middleware/     # 错误处理、404、上传
│   │       ├── db/             # knex 连接与 migrations
│   │       └── utils/          # 日志、图片、响应封装、校验
│       └── web/                    # Vite + React 前端
│       └── src/
│           ├── pages/          # ProjectsPage / ItemsPage / CharactersPage / PuzzlesPage / PuzzleEditorPage / PuzzleViewPage / MapVersionViewPage / GamesPage / GamePage / EditorPage
│           ├── components/     # editor / puzzle / item / character / project / game / map / ui
│           ├── stores/         # editorStore（地图画布状态 + 撤销栈）/ puzzleStore（谜题状态 + 撤销栈）
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
| `PUBLIC_BASE_URL` | 拼接文件访问 URL 的公开前缀（**换端口时必须同步**） | `http://localhost:3000` |
| `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | PostgreSQL 连接 | `localhost:5432` / `postgres` / `loredoku` |
| `UPLOAD_ROOT` | 上传目录（默认 `packages/server/storage/uploads`） | `./storage/uploads` |
| `VITE_API_BASE_URL` | 前端 API 基址；**留空即走同源 `/api`**，由 Vite 代理转发 | 注释掉（走代理） |

> 请先在 PostgreSQL 中创建数据库（默认名 `loredoku`）。

### 3. 初始化数据库

```bash
npm run db:migrate      # 执行全部迁移
npm run db:rollback     # 回滚最近一批迁移
```

### 4. 启动开发环境

```bash
npm run dev                              # 后端 3000 + 前端 5173（默认）
npm run dev -- --server-port 4000        # 后端 4000，前端 5173
npm run dev -- -w 5180                   # 前端 5180，后端 3000
npm run dev -- -s 4000 -w 5180           # 两个都自定义
```

会并行启动：

- 后端：`http://localhost:{server-port}`（tsx watch 热重载）
- 前端：`http://localhost:{web-port}`（Vite；`/api` 由 `VITE_PROXY_TARGET` 代理到同一个后端端口）
- 启动时会打印一行汇总，便于直接复制

参数规则（`scripts/dev.mjs`）：

| 参数 | 缩写 | 默认 | 作用 |
|---|---|---|---|
| `--server-port <n>` | `-s` | `3000` | 后端监听端口 |
| `--web-port <n>` | `-w` | `5173` | 前端 Vite 端口 |

- 参数可选；**命令行 > `.env`**，且 `PUBLIC_BASE_URL` 会跟着后端端口一起改（不改就会让头像 / 物品图 / 封面全部 404）；
- 必须是 `1~65535` 的整数，两个端口不能相同；非法值会打印一行中文错误并以非 0 退出码结束（不启动任何进程）。

浏览器访问 **http://localhost:{web-port}** 即可。

---

## 常用脚本

在仓库根目录执行：

| 命令 | 说明 |
|---|---|
| `npm run dev` | 同时启动 server + web（支持 `-s` / `-w` 指定端口，见上） |
| `npm run dev:server` / `npm run dev:web` | 单独启动后端 / 前端（`npm run dev:web -- --port 5180` 亦可） |
| `npm run build` | 构建全部 workspace |
| `npm run typecheck` | 全量 TypeScript 类型检查 |
| `npm test` | 运行全部测试（各 workspace 的 Vitest + 根目录 `scripts/` 单测） |
| `npm run db:migrate` / `db:rollback` | 数据库迁移 / 回滚 |

单个 workspace 可用 `--workspace`，例如 `npm run test --workspace @loredoku/server`。

> **提示**：server 端测试覆盖 projects / items / regions / versions 全流程，**依赖本地 PostgreSQL**，建议每次改动后都跑一遍：
> `cd packages/server && npx vitest run --no-cache`
>
> 本机若出现「多文件聚合运行时漏收测试文件」，用 `bash scripts/run-tests.sh packages/web` 逐文件运行（同样适用于 `packages/shared` / `packages/server`）。

---

## 功能概览

- **地图管理（`/projects`，v0.5.0 FEAT-K09 起为「条目并集」）**：创建 / 编辑 / 删除 / 复制地图，指定画布尺寸 `n × n`（2 ~ 24）。列表同时展示两种条目——**工作条目**（`map_projects` 行，可编辑，徽标「草稿」或「已发布 v{n}」）与**版本条目**（`map_versions` 行，徽标 `v{n}`，只读快照）；同一血缘（`root_id`）的条目可用「按地图归组」相邻显示，类型三态筛选（全部 / 只看工作条目 / 只看版本条目，默认全部）。版本条目的操作是**查看效果**（只读画布预览 `/maps/:projectId/:versionNo/view`）/ **以此版本新建谜题**（跳 `/puzzles?new={projectId}:{versionNo}`）/ **编辑此版本**（fork 出新工作条目，绝不改原版本行）/ **删除**；版本条目**不可重命名、不可改封面**。
- **地图封面与卡片（v0.4.2 FEAT-H03 / OPT-H04，v0.5.0 FEAT-K09 扩到版本条目）**：新建 / 编辑地图时可**选填封面**（PNG / JPEG / WebP / SVG，≤ 4 MB，固定 16:10），网格卡片把封面作为卡片的头、无封面时显示名称首字，列表行同步加上 64×40 的封面缩略图；卡片与列表都**去掉了「卡片 N」「区域 N」**（接口字段保留），只留 `n × n` 与更新时间 —— 卡片用**相对时间**（「3 天前更新」，悬停显示绝对时间），列表保留绝对时间。新建走**两步串行**（先建地图拿到 id，再上传封面），封面失败时地图不会丢，弹窗提示「重试上传」。版本条目副信息补「该地图共 N 个版本 · 发布于 …」。
- **物品管理（`/items`）**：维护图案方块（背景 / 物体两类），支持图片上传、尺寸、`canStand`（是否可站立）、缩略图与触发信息。
- **角色管理（`/characters`）**：维护参与者角色（头像、性别等）。
- **可视化编辑器（`/editor/:projectId`）**：拖拽放置物品、框选 / 笔刷绘制区域、区域命名与配色、橡皮擦、撤销 / 重做（上限 50 步）；画布**自适应方格宽度 90 ~ 240px**（v0.3.5 OPT-A01，v0.3.6 OPT-B02 追加底部工具条留白，v0.3.7 OPT-C01 四边各加 24px 外边距），缩放 25% ~ 400%；线条与字体随方格尺寸**等比缩放**（v0.3.6 OPT-B03）。v0.5.0 SPEC-K12 起左侧只剩「物品 / 区域」两个标签（角色与参与者整棵子树搬去谜题编辑器）。
- **画布平移（v0.3.9 FEAT-E03）**：在地图**方格以外**的空白处按下并拖动即可平移画布；指针进入方格为 `pointer`（v0.3.9 FEAT-E04），空白处为 `grab` / 拖拽中 `grabbing`。工具栏中的「拖动」按钮已移除。
- **地图基本信息（`/editor/:projectId` 顶栏「基本信息」）**：右侧抽屉统一编辑本图的显示常量 —— 方格大小（缺省为自适应值，可覆盖 90 ~ 240）、画布外框 / 网格分隔线 / 鼠标光标框 / 操作光标框 / 区域轮廓线 / 区域高亮线的线宽与颜色、区域标签的字号 / 描边 / 颜色 / 高亮配色、标尺文本大小与到地图的间距。全部随草稿保存、随版本快照发布、可撤销（v0.3.8 FEAT-D01/D02/D03/D04）。**v0.5.0 起联动主题色调色板从这里移除**——调色板改由谜题持有（见「谜题」）。
- **基本信息草稿化（v0.3.9 FEAT-E01）**：抽屉内的修改是**草稿**，不会立即改变画布，须点击底部的「保存」才生效；底部另有「取消」可放弃修改。有未保存修改时切换到其它信息栏会先弹出确认（继续编辑 / 放弃修改 / 保存并继续）。发布成功后画布保持原位，不再重置视口（v0.3.9 FIX-E01）。
- **基本信息即完整表单（v0.3.10 FIX-F01/FIX-F02）**：**画布尺寸**与样式同属一份草稿，一次「保存」同时写入两者；抽屉内的画布尺寸确认弹窗与提示文案已移除。数值控件**实时写入草稿**——点击输入框的自增按钮、逐字输入都会立刻反映到「保存」按钮上，无需先按回车或移开焦点（聚焦期间不回填文本，避免多位数字被钳制值覆盖）。
- **基本信息首次进入即保存（v0.3.10 FIX-F03）**：从未保存过基本信息的项目，第一次进入编辑器会自动把整份草稿（含画布尺寸）落库一次，保证「编辑器里看到的」与「草稿里存的」始终一致；已有未保存改动时不会抢先保存。
- **问号图标提示（v0.3.10 SPEC-F01）**：抽屉内所有需要说明的标签后面跟一个圆形问号图标，悬停显示完整说明；原先散落在字段下方的灰色说明段落已全部并入图标提示。
- **无边框取色器（v0.3.10 FIX-F04）**：`input type="color" 统一走共享组件 `ui/color-input`（无黑边框，仅一圈细 `ring` 保证浅色可见）。
- **性别符号加粗（v0.3.10 FIX-F06）**：♂ / ♀ 符号 `fontWeight: 700`，颜色不变。
- **画布缩放与方格大小相互独立（v0.3.8 FEAT-D05）**：底栏的放大 / 缩小 / 百分比只改变查看比例，**不修改任何数值**；只有「基本信息」里的方格大小会改变实际渲染尺寸。
- **保存 / 发布是两个按钮，保存为主（v0.4.2 FEAT-H05 §5.4，v0.5.0 SPEC-K13 重写发布语义）**：顶栏「保存」是 primary、「发布」是 outline，二者**不合并**；「发布」**不再因有未保存修改而置灰**——点它会先弹出**发布确认**（标题「发布为 v{N}？」，说明「将新增一个带 v{N} 标记的地图条目，出现在地图列表中；当前工作条目不会被覆盖」，版本号取**整个血缘**的 `MAX(version_no) + 1`，可选填**发布备注**，有未保存修改时额外提示「将先保存再发布」，主按钮相应变为**「保存并发布」**），确认后**先 `save()` 再 `publish()`** 串行执行、保存失败即中止发布。发布成功后弹出**成功弹窗**（「已发布 v{N}，已在地图列表新增条目」）并给出「查看该条目」（→ `/projects`）与「预览」（→ `/maps/:id/:v/view`）两个去处；校验不通过仍走既有的「无法发布」清单，没有第二套 UI。顶栏的「未保存」徽标同时是**快捷保存按钮**（点击即保存）。顶栏另有「版本历史」按钮，列出同血缘的全部版本条目（查看效果 / 编辑此版本 / 删除），**不提供回滚**。
- **方格信息与底栏（v0.4.2 OPT-H10 / OPT-H11，v0.5.0 SPEC-K12 再删参与者）**：方格信息里的「区域信息」重排成一张**只读卡片**（色点 + 名称 + 「包含 N 格」徽标 + 一行「边界线宽 / 填充 %」），**不再显示完整 region id**（退到 `title` 提示），也**不再渲染「编辑 / 定位 / 删除」**——那三个按钮在方格上下文里冗余（编辑 / 删除在左侧「区域」标签里已有），选中区域本身时仍然可用。底栏工具条**删掉「放置角色（C）」**（CLAR-603 之后角色不进入地图，该入口是死路），工具组只剩选择 / 放置、区域选择、橡皮擦；v0.5.0 起左侧「角色」标签**整体移除**（参与者搬到谜题编辑器，地图编辑器只剩「物品 / 区域」）。
- **文案统一：项目 → 地图（v0.4.2 OPT-H02）**：地图管理页、编辑器、物品 / 角色页的占用提示等**用户可见文案**一律改称「地图」（代码标识符、API 路径 `/api/projects`、表名 `map_projects` 均不变）。
- **参与者（v0.5.0 起归谜题所有）**：以下参与者区 / 联动 / 抽屉 / 位置条件能力**原属地图编辑器**，v0.5.0 随「删除作品模块、新增谜题模块」整体搬到**谜题编辑器**（`/puzzles/:puzzleId/edit`）：地图画布变成只读参考，参与者矩阵、主题色、联动、位置条件全部写在谜题自己的 `PuzzleDraft` 里。
- **参与者区**：标题栏 40px（与物品栏头部对齐）、单元格 110×104px、每框左上角 1 起序号（v0.3.6 OPT-B06）。头像区只有**一层圆**（v0.4.2 OPT-H06）：主题色圆盘负责裁剪，缩略图不再自带圆环，无图角色直接显示首字而不是一个白色内圆。
- **参与者联动**：悬停 / 点击参与者框，高亮其关联的角色、物品、区域、格子（红 / 蓝效果，无时长概念，结束时淡出）。列表项**不再显示「高亮」徽标**（v0.4.2 OPT-H07：效果固定，徽标不携带信息），联动弹窗的区块标题也由「效果与颜色」简化为**「颜色」**。
- **参与者抽屉改版（v0.4.2 FEAT-H08 / FEAT-H09）**：主题色只显示**当前选中**（一行：色块 + hex + 「修改」），点开 `ThemeColorDialog` 再从 15 色板或自定义 hex 里选，弹窗内实时预览、确定后才交回抽屉；「保存 / 取消」固定在抽屉**底部页脚**（位于滚动区之外，永远可达），右上「×」与 `Esc` 与「取消」**语义一致**——都是丢弃本次编辑并关闭，绝不写库。
- **参与者位置条件（v0.4.1 FEAT-E01，v0.4.3 BUG-J04 修复持久化）**：参与者信息抽屉在「联动」与「保存」之间新增**位置条件**模块——点「添加位置」后进入**画布点选**模式（左侧提示「请在画布上点击要允许的位置（`Esc` 取消）」，`Esc` 或再点一次按钮退出），点选的可站立格以 `R{行} C{列}` 列出、可逐项删除。**多个位置之间是「或」关系，留空表示不限制位置**；结果随保存写入 `characterSlots[i].positionConditions`（`[{ x, y }]`，可缺省），草稿校验会拒绝越界坐标。**v0.4.3 之前该字段在 web 侧写入时被丢弃**（`editorStore.ensureEntry` 漏字段）：编辑任何人、刷新页面、乃至存进数据库的 JSON 都不带它 —— 现已在 `ensureEntry` 中保留并深拷贝，`init` / 任意 `commit` / `toDraft` 全链路存活。
- **谜题（`/puzzles`，v0.5.0 FEAT-K01 ~ K08）**：谜题引用一个**已发布地图版本**作为画布（创建时只能选已发布版本，选定即钉住 `n × n`，创建后不可修改），另有**名称**与**描述**两个字段。列表表头与 v0.4.3 作品页逐字一致（名称 / 版本 / 部署状态 / 发布时间 / 操作），行操作：查看效果（`/puzzles/:id/view`）/ 部署 / 导出（谜题自己的 `PuzzleDraft` v1 JSON）/ 复制 / 删除。谜题编辑器（`/puzzles/:id/edit`）左侧只有「角色」标签，底栏只剩查看类操作（标尺 / 尺寸展示 / 缩放 / 撤销重做，**尺寸是纯展示的 `span`**），画布是**只读参考**（不提供选择 / 区域 / 物品 / 橡皮擦，也没有「调整画布尺寸」弹窗与发布按钮），格子信息弹框**只读**（无任何操作按钮）；「基本信息」抽屉只有**描述**与**联动主题色**两段。谜题 JSON 支持导出 / 导入（导入会校验地图版本一致性与 item / region 引用）。
- **预览页与编辑页一致（v0.3.10 FIX-F07 / FEAT-F01 / FEAT-F02，v0.5.0 改数据源）**：谜题预览页的参与者区直接复用 `ParticipantPanel`（`readOnly` 模式：同一套矩阵卡片、序号、主题色圆头像、线索区与单框高亮，但不可拖动、无「×」按钮）；顶栏新增「标尺」开关（`Ruler` 图标，默认显示，选择存 `localStorage` 键 `loredoku.puzzleview.ruler`）；预览页的方格大小、四周留白与标尺厚度一律按地图版本的 `style` 计算（自适应时传入 `canvasInsets({ showRulers, rulerSize })`，与编辑器同一套预留）。地图版本也有自己的只读预览页（`/maps/:projectId/:versionNo/view`，无参与者面板）。
- **预览页标题（v0.4.0 OPT-G01）**：标题改为**地图名称**，版本号以 `v{N}` 徽标与标题同行展示，发布备注降级为次要文本；浏览器标签页同步为 `{地图名称} · 格物`。
- **谜题部署（v0.4.0 FEAT-G02，v0.5.0 CONS-K16 起按谜题部署）**：把谜题部署为可玩的游戏。弹窗可改**游戏名称**（默认取谜题名称）、填写**访问路径**（v0.4.1 OPT-W04，见下条）、上传**封面**（可留空，部署成功后上传）、选择**难度**五档（Very Easy / Easy / Medium / Hard / Expert，绿 → 黄绿 → 黄 → 橙 → 红）。**同一个谜题只能部署一个游戏**（`map_games.puzzle_id` 部分唯一索引，再次部署覆盖旧行并重新分配 id）；同一地图的不同版本可被不同谜题同时部署。部署时把地图快照与谜题数据冗余拷贝进 `map_games.snapshot`，因此游戏渲染的是**部署那一刻的固定副本**，谜题后续修改不影响已部署游戏（存量游戏没有 `puzzle_id`，回退读取快照里的 `legacyCharacterSlots` / `legacyLinkageColors`）。
- **谜题列表表头（v0.4.1 OPT-W01 / OPT-W02，v0.5.0 原样搬到谜题）**：表格精简为 **5 列：名称 / 版本 / 部署状态 / 发布时间 / 操作**（原尺寸、参与者数、区域数、物品数、备注五列移除，搜索仍可按备注命中）。「已部署」徽标**从操作列迁出到独立的部署状态列**，点击徽标直接进入 `/games/{访问路径}`；`deployed` 的判定为**按谜题命中**——只有真正被部署的那个谜题才带徽标，重新部署后旧谜题掉徽标、新谜题上徽标。
- **重新部署回填（v0.4.1 OPT-W03）**：打开部署弹窗时按该游戏上一次的取值回填**难度**与**访问路径**（名称仍取谜题名称，Q4）。封面为**三态**——沿用已上传封面（默认，弹窗内直接预览）/ 选择新文件替换 / 点「移除」显式清空（`clearCover: true`，不传则保留库里的封面）。
- **访问路径（v0.4.1 OPT-W04）**：部署弹窗在名称下方新增**访问路径**输入框，默认按 **`puzzle-` + 名称转写 + `-` + 难度转写** 填充（如 `Flower Garden` + 非常简单 → `puzzle-flower-garden-very-easy`），下方实时预览 `/games/{当前值}`，右侧「重新生成」按当前名称与难度重算。名称或难度改动会**自动跟随**，一旦手动编辑过（`slugTouched`）或属于重新部署（回填即视为已确定）就不再被覆盖。转写规则：转小写 → 分隔符转 `-` → 去除非 `[a-z0-9-]` → 合并连续 `-` → 去首尾 `-`；**名称转写为空（全中文 / 纯符号）时不自动编造路径，而是报错要求手动填写**（v0.4.1 Q13）。校验要求 3 ~ 80 字符、`^[a-z0-9-]+$`、不以 `-` 开头或结尾，并**全局唯一**——另一张地图占用同一路径时部署失败并提示「该访问路径已被占用，请更换」，**不自动追加序号**（Q12）。游戏地址因此由 `/games/{数字 id}` 改为 **`/games/{访问路径}`**，旧链接不再可用（Q14）。
- **游戏首页（v0.4.0 FEAT-G01，`/games`）**：面向玩家的独立入口——**顶层路由，不用 `AppShell`**，玩家从这里看不到地图 / 物品 / 角色 / 谜题等制作端模块，只能通过链接进入（谜题列表「已部署」徽标、游戏页「返回」按钮）。简约卡片网格（2 / 3 / 4 列响应式，间距 20px）。每张卡片展示**封面**（16:10，无封面时显示地图名称首字）、**名称**、**难度徽标**（五色）、**`n×n` 规格**；点击卡片进入游戏页面。空态给出前往谜题列表的链接。
- **游戏页面（v0.4.0 FEAT-G03，v0.4.1 起为 `/games/:slug`）**：左中右三栏的全屏游玩页（不用 `AppShell`，与编辑器同级的顶层路由）。
  - **左上**：返回按钮 + 游戏名称、封面缩略图、难度徽标、`n×n` 与来源（「来自地图 v{N}」）；只读，不提供编辑。
  - **左下**：与预览页**同一个** `ParticipantPanel`（`readOnly`），联动效果完全一致；新增「点击参与者 → 进入放置状态」。放置态下悬停另一张卡片只临时切换联动预览，移开后**恢复已武装参与者的联动并保持高亮**——放置状态不随悬停退出，只有再次点击参与者或工具按钮才退出（v0.4.1 BUG-G02：恢复用幂等的 `restore` 事件，不是会反向关闭的 `click`）。**已放置参与者的整张卡片变淡**（v0.4.2 SPEC-H14：外框 + 头像 + 序号 + 名称 + 线索 + 提示词全部淡化，`opacity: 0.45` 落在卡片根节点、只此一处；淡化是常驻状态，激活时只叠加描边、不恢复不透明）。
  - **中间**：与预览页一致的地图（含标尺），新增**游戏放置层**与**工具提示层**两个游戏专属图层，**不渲染操作光标框**；画布**固定自适应**（无平移、无缩放），格内光标为 `pointer`。放置态下**点击格子放的是该参与者的「编号」**（v0.4.3 CLAR-J01：再点同一格即移除），**长按格子（≥500ms）才是「放置参与者」**（放头像，整格替换）；不满足条件的落点会 `toast` 说明原因（不可站立 / 已有禁止符号 / 已有头像 / 九宫格已满 / **该参与者的头像已在别格**）而不是静默失败；**编号可以落在多个格子上**（v0.4.3 SPEC-J05），所以短按不会再被唯一性挡住。
  - **右侧工具栏**：禁止符号（`X` 图标，红色）/ 清除工具 / 回退 / 提交四个等宽按钮，激活态 `bg-accent` 且**互斥**；清除按钮**长按 500ms 清空全图**（记一步可回退）；除四个工具按钮外只有一个**标尺开关**；底部显示「已放置 N 个 / 可回退 M 步」。参与者编号**从 1 开始**（与参与者面板左上角序号一致）。
- **放置规则（v0.4.0 SPEC-G01 ~ SPEC-G04 + v0.4.1 SPEC-G05 / SPEC-G06 / FEAT-V01 + v0.4.3 SPEC-J02 / SPEC-J03）**：每格放置内容是「参与者图片 / 参与者编号列表 / 禁止符号」三者互斥的形态之一。编号按 **3×3 九宫格**从左到右、从上到下排列（最多 9 个，字号约 `cellSize/4`，颜色取参与者主题色 + 黑色描边）；**点击切换该编号**（有则删、无则加，删到空即整格变回空格），**长按整格替换为头像**（九宫格已满只挡「加入」方向，不挡长按确认）。**有不可站立物品的格子不能放置**；禁止符号会**激活该格的不可站立遮罩**，并清除该格原有编号。回退栈上限 200 步，清空全图只记一步；**提交后不能回退到提交点之前**。规则全部集中在纯函数库 `packages/web/src/lib/gamePlacement.ts`。
  - **唯一性（SPEC-G05 + v0.4.3 SPEC-J05）**：唯一的是**头像** —— 每位参与者最多确认一个格子（已在别格放过头像时，长按另一格会被拒绝并指出那一格在哪）；**编号是候选标记，可以同时留在多个格子上**，短按既不看唯一性，也不会再有「编号 N 已放置在 R{r} C{c}」的提示。清除 / 回退后恢复可放置。
  - **编号清理（v0.4.2 SPEC-H01 + v0.4.3 SPEC-J05 收窄）**：**长按确认头像**时，把该参与者的**编号**从其它格子清除（只清编号，不动头像、不动不可站立遮罩）；某格因此失去最后一个编号时该格变回**空格**而不是 `×`。短按放编号**不清理**（候选可以在多处）。清理与放置**合并为一个历史步**，回退一次全部还原。
  - **自动 ×（SPEC-G06 + v0.4.3 SPEC-J02 收窄）**：**只有长按放头像**才会在**同行同列**中「可站立、原本没有 ×、也没有头像」的格子补上禁止符号；不可站立格、已有头像格、已有 × 格一律跳过。**点击放编号不补 ×** —— 编号是候选标记，玩家可以自由试探，需要排除时用工具栏的「禁止符号」手动补。自动 × 与放置**合并为一步**，回退一次即全部撤销。
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

`HIGHLIGHT_RED = #EF9A9A`、`HIGHLIGHT_BLUE = #90CAF9` 是默认调色板项。v0.3.8 起实际取值来自调色板（key → hex），统一驱动方块高亮、背景高亮与区域高亮线，同时是鼠标提示框「被阻挡色」与操作提示框颜色的缺省值。**v0.5.0 起调色板改由谜题持有**（`PuzzleDraft.linkageColors`，地图 `style` 里不再有该字段），参与者主题色 / 区域颜色 / 物品图 不受调色板影响。

### 标尺字符（v0.3.6 OPT-B05 §5 + v0.3.7 OPT-C02 + v0.3.9 FEAT-E02 + v0.3.10 FEAT-F01）

默认淡灰 `#9CA3AF` / **17px**；鼠标所在行列变深灰 `#374151`（字号不变，**不使用蓝色或下划线**）；操作光标框所在行列深灰 + **19px**（叠加时操作格优先）。字号与到地图的间距均可在「基本信息 → 标尺」中配置（v0.3.9 FEAT-E02）：文本大小 9 ~ 32（默认 17，操作格恒为 +2）、间距 0 ~ 32（默认 6）。标尺条厚度由 `rulerStripSize({maxFontSize, gap})` 动态求得（不小于 `RULER_SIZE = 28`），因此加大字号不会让文字溢出。字号仍随 `scale × zoom` 缩放。

标尺本体抽成了共享组件 `packages/web/src/components/map/MapRulerStrips.tsx`（v0.3.10 FEAT-F01），编辑器与谜题预览页渲染**同一份**几何：预览页无「操作光标框」，因此 `operationCell` 恒为 `null`，只有「悬停行列变深灰」一档；预览页顶栏提供「标尺」开关，默认显示，选择持久化在 `localStorage` 键 `loredoku.puzzleview.ruler`（`visible` / `hidden`）。

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

线宽与字号都是**基准值**，仍按 `cellSize / BASE_CELL` 等比缩放。解析与 clamp 集中在 `packages/web/src/lib/mapStyle.ts` 的 `resolveMapStyle`。草稿 JSON 版本相应提升为 `MAP_JSON_VERSION = 3`（v0.5.0：`characterSlots` 与 `style.linkageColors` 移除，旧版 JSON 由 `server/src/service/mapDraftCompat.ts` 吸收，参与者搬进谜题）。联动主题色调色板改由谜题持有，见「谜题」。
v0.3.9 SPEC-E01 把四个样式字段改名为规范名（见上表括号内旧名），`docs/layer-priority.md` §6 有完整迁移记录。

### 编辑器焦点互斥（v0.3.7 OPT-C07）

参与者联动（悬停 / 点击）与方格选中（操作提示框 + 信息抽屉）互斥：点击画布任意方格会清除参与者激活并把焦点交给方格，点击参与者则清空方格选中。规则集中在 `packages/web/src/lib/editorFocus.ts` 的 `reduceEditorFocus`，`Esc` 清除全部焦点。

---

## 后端 API 概览

统一前缀 `/api`，响应含业务错误码（见 `ErrorCode`）。

| 资源 | 主要端点 |
|---|---|
| 健康检查 | `GET /api/health` |
| 项目 | `GET/POST /api/projects`、`GET/PATCH/DELETE /api/projects/:id`、`POST /api/projects/:id/duplicate`、`POST /api/projects/:id/cover`（**v0.4.2 新增**：封面上传，`multipart/form-data` 字段名 `file`）、`DELETE /api/projects/:id/cover`（**v0.4.2 新增**：清空封面） |
| 地图数据 | `GET/PUT /api/projects/:id/map`、`PATCH /api/projects/:id/grid-size`、`GET /api/projects/:id/map/export`、`POST /api/projects/:id/map/import` |
| 区域 | `GET/POST /api/projects/:id/regions`、`PATCH/DELETE /api/projects/:id/regions/:regionId` |
| 谜题（v0.5.0 新增） | `GET/POST /api/puzzles`、`GET/PATCH/DELETE /api/puzzles/:id`、`PUT /api/puzzles/:id`（保存草稿）、`POST /api/puzzles/:id/duplicate`、`GET /api/puzzles/:id/map`（引用地图版本的只读上下文）、`GET /api/puzzles/published-versions`（新建谜题的地图版本选择器，只列已发布版本） |
| 作品 / 版本 | `POST/GET /api/projects/:id/versions`、`GET /api/projects/:id/versions/:versionNo`、`POST .../versions/:versionNo/fork`（**v0.5.0 新增**：编辑此版本 → 新增工作条目）、`POST .../versions/:versionNo/draft`（**v0.5.0 起废弃**，无 UI 入口，仅历史兼容）、`DELETE .../versions/:versionNo`、`GET /api/versions`（跨地图版本列表） |
| 游戏 | `POST /api/puzzles/:id/games`（**v0.5.0 起按谜题部署**，同谜题覆盖；请求体可选 `slug`，缺省 / 空由后端按 §4.3 计算）、`GET /api/games`（游戏首页列表，含 `slug`）、`GET /api/games/slug/:slug`（**v0.4.1 新增**，游戏页数据源，按访问路径取详情）、`GET /api/games/:id`（保留，封面上传等内部流程用）、`POST /api/games/:id/cover`（封面上传） |
| 物品 | `GET/POST /api/items`、`GET/PATCH/DELETE /api/items/:id`、`POST /api/items/:id/enable|disable`、`GET /api/items/:id/usages`、`PUT /api/items/:id/triggers`、`POST/DELETE /api/items/:id/image` |
| 角色 | `GET/POST /api/characters`、`GET/PATCH/DELETE /api/characters/:id`、`POST /api/characters/:id/enable|disable`、`GET /api/characters/:id/usages`、`POST/DELETE /api/characters/:id/avatar` |

> 兼容：`/api/cards*` 会 308 永久重定向到 `/api/items*`（v0.1 遗留命名）。

### 发布校验规则（P3 / P4）

发布地图版本时由 `server/src/service/versionService.ts` 校验：

- **P3**：区域之间不得交叉；
- **P4**：多格物品需落在画布内（v0.3.4 OPT-904 起 `can_stand === false` 的物品**允许**放在物体层）；
- 另有边界检查：所有格子 / 区域坐标必须落在画布内。

**v0.4.0 起的参与者规则（P1 至少 1 名可用参与者 / P2 无头像不计入 / P5 联动引用有效）随 v0.5.0 的参与者搬迁一并移到谜题侧**——地图是纯画布，谜题才携带参与者；`GET /api/projects` 的返回也改为条目并集（`MapEntrySummary`）。

---

## 测试说明

- 使用 **Vitest**（web 侧 `environment: 'jsdom'`）。组件行为尽量以**无依赖纯函数**覆盖（`lib/linkageActivation`、`lib/cellSelection`、`lib/highlight`、`lib/editorInit`、`lib/gamePlacement`、`lib/relativeTime`、`scripts/dev.mjs` 等）。
- `EditorCanvas.noDrag.test.ts`、`MapInfoDrawer.test.tsx`、`PuzzleViewPage.preview.test.ts`、`PuzzleEditorPage.test.ts`、`PuzzleEditorPage.infoDrawer.test.ts`、`EditorPage.autoSave.test.ts`、`EditorPage.infoDrawer.test.ts`、`EditorPage.publish.test.ts`、`EditorBottomBar.test.ts`、`ProjectCards.test.ts`、`ProjectsPage.entries.test.ts`、`PuzzlesPage.deploy.test.ts`、`wording.test.ts` 通过 `import.meta.glob(..., { query: '?raw' })` 读取源码，断言画布内「点击可选中、绝不注册拖动」、颜色控件统一走 `ColorInput`、预览页复用 `ParticipantPanel` / `MapRulerStrips`、基本信息一次提交、发布走确认弹窗且文案为「新增条目」、底栏不含「放置角色」、**谜题底栏不含任何写工具且尺寸是纯展示 `span`**、**地图列表条目并集与三态筛选**、**谜题列表 5 列与操作**、**生产代码里不出现「项目」/「作品」**等**结构性规则**。
- 少量组件级用例（如 `MapInfoDrawer.test.tsx`、`ThemeColorDialog.test.tsx`、`ParticipantPanel.placedDim.test.tsx`）在 jsdom 下直接渲染并断言交互；本环境未安装 testing-library，断言只用原生 DOM API（Radix 弹窗会 `portal` 到 `document.body`，查询要走 `document`）。
- `scripts/dev.test.mjs` 覆盖 `npm run dev` 的参数解析与环境变量映射，由根目录的 `vitest run scripts` 运行。

```bash
npm run typecheck          # 类型检查
npm test                   # 全量测试（含根目录 scripts/）
cd packages/server && npx vitest run --no-cache   # 后端接口测试（需 PostgreSQL）
bash scripts/run-tests.sh packages/web            # 逐文件跑（规避聚合运行的 EPERM 漏收）
```

---

## 约定与注意事项

- **拖拽**：全局仅两类拖拽（角色列表 → 参与者区、物品抽屉 → 画布），统一用 **Pointer Events**（`setPointerCapture`）实现，不使用 HTML5 原生 `draggable`。
- **画布内行为**：画布内的物品 / 角色仅支持单击选中与删除，**不允许拖动移动**；所有 `<img>` 一律 `draggable={false}`。
- **平移画布**：在地图方格**以外**的空白处按住拖动即可平移（v0.3.9 FEAT-E03），工具栏不再提供「拖动」按钮；指针在方格内为 `pointer`，空白处为 `grab`。
- **弹窗关闭方式**：所有 Dialog 统一禁止「点击遮罩关闭」（v0.3.9 FIX-E03），只能通过关闭按钮 / 取消 / `Esc`，避免误触丢失已填内容。
- **基本信息是完整表单（v0.3.10 FIX-F01/FIX-F02）**：画布尺寸与样式同属一份草稿，`onCommit(style, gridSize)` 一次提交；数值控件每次 `change` 即写草稿（失焦 / 回车只负责回退非法输入），因此**不需要**先按回车才能点「保存」。空字段不等于 0，失焦会还原为已保存值。
- **组件复用**：预览页的参与者区（`ParticipantPanel readOnly`）与标尺（`MapRulerStrips`）与编辑器共用同一份实现，改动任一处必须同时验证两端。
- **命名一致性**：前端文案与路由统一使用「地图 / 谜题」（`/puzzles`、`/puzzles/:id/view`、`/maps/:projectId/:versionNo/view`）；后端沿用 `map_projects` / `map_versions` / `version_no` / `/versions`，不做改动。`wording.test.ts` 断言**用户可见文案里不出现「项目」「作品」**（`/works` 已删）。
- **数据模型**：参与者不进入地图；v0.5.0 起地图 `MapDraft` 是**纯画布**（`version = 3`，无 `characterSlots`、`style` 无 `linkageColors`），`CharacterSlotEntry`（携带 `themeColor` + `clue` + 扁平 `linkages` + 可选 `positionConditions`）搬到谜题的 `PuzzleDraft`（`version = 1`）。`characterSlotEntrySchema` 使用 `.strict()` 拒绝遗留的 `triggers` 字段；存量 v2 地图 JSON 由 `server/src/service/mapDraftCompat.ts` 吸收（旧草稿里的参与者回填成谜题种子，`puzzleBackfill.ts`），存量游戏快照由 `gameSnapshotCompat.ts` 读取 `legacyCharacterSlots` / `legacyLinkageColors`。
- **迁移**：`db/migrations/` 目录下的每个文件都会被 Knex 当作迁移加载，辅助模块不要放在该目录（参与者迁移的纯变换函数位于 `server/src/service/draftLinkageMigration.ts`，v0.4.1 的 `map_games.slug` 回填位于 `server/src/service/gameSlugBackfill.ts`，v0.5.0 的谜题回填位于 `server/src/service/puzzleBackfill.ts`）。**索引即约束**：`table.unique(cols, { indexName })` 建的是 UNIQUE **约束**，回滚必须用 `table.dropUnique(cols, name)`，`DROP INDEX` 会以 `2BP01` 失败。v0.5.0 两个迁移（`20260101000016_v050_puzzles` / `20260101000017_v050_games_puzzle`）已实测 `db:rollback` → `db:migrate` 往返。
- **访问路径常量**：转写 / 校验一律走 `@loredoku/shared` 的 `slugify` / `buildDefaultSlug` / `slugError` / `normalizeSlugInput`，前端只做预览与净化，**判定以服务端为准**；难度转写用 `GAME_DIFFICULTY_SLUGS` 固定表，避免 `veryEasy` 这类驼峰泄漏到 URL。
- **主题色**：调色板共 15 色（见 `THEME_COLOR_PALETTE`），默认 `#FFFFFF`。修改主题色的入口是**受控弹窗** `ThemeColorDialog`（不直接写 store），抽屉自身的「保存」才是唯一的写库路径（v0.4.2 FEAT-H08）。
- **参与者 ≠ 参与者编号（v0.4.2 CLAR-H13）**：文档、UI 文案与测试名里，「参与者（participant）」指名单柜里的那个人，「参与者编号 / 编号」指格子里那个 1 起的数字。凡涉及落点、清理、淡化的描述一律写到「编号」这一层，避免「把参与者放进格子」这类把两者混为一谈的说法；代码标识符不随之改名（§17 Q15）。
- **地图封面（v0.4.2 FEAT-H03）**：`map_projects.cover_path` 是唯一真相，`coverUrl` 由 `PUBLIC_BASE_URL` 拼出 —— 换后端端口时**必须**同步它，否则头像 / 物品图 / 封面会全部 404（`npm run dev -s 4000` 已自动同步）。复制地图**沿用同一 `cover_path`**（`duplicate` 直接拷贝字段，不复制二进制）。封面不写 mime / size 元数据。
- **开发端口参数（v0.4.2 DEV-H12）**：`npm run dev` 的可选参数由 `scripts/dev.mjs` 解析，纯函数 `parseDevArgs` / `buildDevEnv` 可单测；`web` 侧固定带 `--strictPort`，端口被占时直接失败而不是静默换端口。根 `dev:server` / `dev:web` 脚本末尾带 `--`，保证 `npm run dev:web -- --port 5180` 能把参数透传给 `vite`。

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
| `docs/v0.4.1.md` | 作品页表头 5 列与按版本判定「已部署」、部署回填、**访问路径（`/games/:slug`）**、放置唯一性与自动 ×、参与者位置条件、提交校验、点击参与者高亮保持 |
| `docs/v0.4.2.md` | 参与者 / 编号术语澄清、落位后清除其余格子编号、**已放置参与者整框淡化**、地图管理页文案统一与**封面**、卡片信息精简、发布确认与成功入口（**保存 / 发布两按钮、保存为主**）、参与者框圆形精简、联动标签精简、主题色弹窗、抽屉底部保存 / 取消、方格信息区域信息重排、底栏删「放置角色」、`npm run dev` 端口参数 |
| `docs/v0.4.3.md` | 放置参与者与编号说明（**点击格子放的是编号、长按才是参与者**）、放编号**不再自动补排除项**、放编号改为**切换**（有则删、无则加）、**编号可多次放置**（唯一性只约束头像，去掉「编号 N 已放置在 …」提示）、编辑页参与者**位置条件丢失**修复 |
| `docs/v0.5.0.md` | **功能范围重划分**：新增**谜题**模块（角色 / 参与者 / 联动主题色 + 绑定已发布地图版本 + 描述）、**删除作品模块**、地图改为**条目 + 版本**（发布新增条目、版本条目不可原地修改）、地图 JSON v3 / 谜题 JSON v1 |
| `docs/layer-priority.md` | 《画布图层优先级规范》—— 15 层的中文名 / 英文名 / 次序的唯一权威 |
