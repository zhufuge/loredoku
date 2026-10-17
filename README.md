# loredoku · 格物

一款推理数独类游戏，包含游戏编辑工坊。工坊中包含地图、物品、角色和谜题的管理。

- 技术栈：Node.js + TypeScript · Koa + PostgreSQL（Knex）· Vite + React 18 + TailwindCSS + shadcn/ui
- 仓库形态：npm workspaces monorepo（`shared` / `server` / `web`）
- 需求文档：见 [`docs/`](./docs)

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
│   │       ├── router/         # 路由（health / projects / puzzles / items / characters / versions / games）
│   │       ├── controller/     # 控制器
│   │       ├── service/        # 业务逻辑（含发布校验 versionService、兼容层 *Compat.ts）
│   │       ├── repository/     # Knex 数据访问
│   │       ├── db/             # knex 连接与 migrations
│   │       └── utils/          # 日志、图片、响应封装、校验
│   └── web/                    # Vite + React 前端
│       └── src/
│           ├── pages/          # MapsPage / ItemsPage / CharactersPage / PuzzlesPage / …
│           ├── components/     # editor / puzzle / item / character / project / game / map / ui
│           ├── stores/         # editorStore（地图画布）/ puzzleStore（谜题），均带撤销栈
│           ├── hooks/          # TanStack Query 数据 hooks
│           ├── api/            # Axios 接口封装
│           ├── lib/            # 网格、命中检测、高亮、联动、线索解析、游戏放置等纯函数
│           └── testing/        # 源码级测试的共享读取入口（见「测试说明」）
├── docs/                       # 各版本需求文档
└── tsconfig.base.json          # 共享 TS 配置
```

---

## 环境要求与快速开始

| 依赖 | 版本 |
|---|---|
| Node.js | ≥ 20 |
| PostgreSQL | 15+ |

```bash
npm install
cp .env.example .env      # 按本地情况修改
npm run db:migrate        # 执行全部迁移
npm run dev               # 后端 3000 + 前端 5173
```

`npm run dev` 支持 `-s <port>` / `-w <port>` 自定义端口（命令行 > `.env`，且 `PUBLIC_BASE_URL` 会跟着后端端口一起改，否则头像 / 物品图 / 封面会全部 404）。

浏览器访问 `http://localhost:{web-port}`。

---

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` / `dev:server` / `dev:web` | 启动开发环境 |
| `npm run build` | 构建全部 workspace |
| `npm run typecheck` | 全量 TypeScript 类型检查 |
| `npm test` | 全部测试（各 workspace Vitest + 根目录 `scripts/`） |
| `npm run db:migrate` / `db:rollback` | 数据库迁移 / 回滚 |

> server 测试**依赖本地 PostgreSQL**。

---

## 相关文档

逐版需求文档在 [`docs/`](./docs)。另有 [`docs/layer-priority.md`](./docs/layer-priority.md) 为图层规范唯一权威。

要给这个仓库写代码（人或 AI Agent），先读 **[`AGENTS.md`](./AGENTS.md)** —— 常用命令、测试手法、代码约定与踩过的坑都在那里。
