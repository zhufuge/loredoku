# 地图编辑器系统需求文档

**版本**：v1.0
**项目代号**：murdoku-maker
**文档类型**：产品 + 技术需求说明书
**技术栈**：Node.js + TypeScript + Vite / Koa + PostgreSQL / React + shadcn/ui + TailwindCSS

---

## 1. 项目概述

### 1.1 背景
提供一个可视化的地图编辑工具，用户将带有特定图案的"方块卡片"（Tile Card）拖拽放置到 `n × n` 的方格画布中，形成地图布局。同时支持对连续方格区域进行框选、命名和标记，用于后续的交互触发（如区域高亮、信息提示等）。

### 1.2 核心目标
| 编号 | 目标 |
|---|---|
| G1 | 地图项目可创建、管理、编辑、删除，项目创建时确定画布尺寸 n |
| G2 | 卡片（图案方块）可维护，含图片上传与关联触发信息 |
| G3 | 拖拽式编辑器，支持卡片放置、移动、删除、保存 |
| G4 | 支持多格区域框选、命名标记，区域边界以粗线条呈现 |

### 1.3 名词定义
| 术语 | 说明 |
|---|---|
| 项目（Project） | 一张地图，拥有独立的 `n × n` 画布 |
| 卡片（Card） | 可拖拽的图案方块，有唯一 ID、名称、图片、关联触发信息 |
| 单元格（Cell） | 画布中的一格，坐标为 `(x, y)`，`0 ≤ x,y < n` |
| 区域（Region） | 由若干单元格组成的集合，有名称、颜色、边框粗细 |
| 触发信息（Trigger） | 卡片的关联属性，满足条件时触发高亮等效果 |

---

## 2. 技术栈

### 2.1 前端
| 项 | 选型 |
|---|---|
| 构建工具 | Vite 5+ |
| 框架 | React 18 + TypeScript |
| UI 组件 | shadcn/ui（基于 Radix UI） |
| 样式 | TailwindCSS 3+ |
| 路由 | react-router-dom v6 |
| 状态管理 | Zustand（编辑器状态 + 撤销栈） |
| 数据请求 | TanStack Query（服务端状态）+ Axios |
| 表单校验 | react-hook-form + zod |
| 拖拽 | 原生 Pointer Events 自研（避免 dnd 库在网格内的性能损耗） |
| 图标 | lucide-react |

### 2.2 后端
| 项 | 选型 |
|---|---|
| 运行时 | Node.js 20 LTS |
| 语言 | TypeScript |
| Web 框架 | Koa 2 |
| 中间件 | @koa/router、koa-body、@koa/multer、koa-static、koa2-cors、koa-logger |
| 数据库 | PostgreSQL 15+ |
| 数据访问 | Knex.js（或 Drizzle ORM）+ `pg` |
| 校验 | zod |
| 文件上传 | multer（磁盘存储） |
| 日志 | pino |

### 2.3 工程结构（Monorepo，npm workspaces）
项目根目录：`murdoku-maker/`

```
murdoku-maker/
├── packages/
│   ├── shared/          # 共享 TS 类型、常量、zod schema
│   ├── server/          # Koa 后端
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── router/
│   │   │   ├── controller/
│   │   │   ├── service/
│   │   │   ├── repository/
│   │   │   ├── middleware/
│   │   │   ├── db/migrations/
│   │   │   └── utils/
│   │   └── storage/uploads/
│   └── web/             # React 前端
│       └── src/
│           ├── pages/
│           ├── components/ui/       # shadcn 组件
│           ├── components/editor/
│           ├── stores/
│           ├── api/
│           └── types/
├── package.json
├── package-lock.json
└── tsconfig.base.json
```

---

## 3. 数据模型设计

### 3.1 ER 概览
```
map_projects 1 ──< map_cells >── 1 cards
map_projects 1 ──< map_regions 1 ──< map_region_cells
cards 1 ──< card_triggers
```

### 3.2 表结构

#### 3.2.1 `map_projects` 地图项目
| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | BIGSERIAL | PK | |
| name | VARCHAR(100) | NOT NULL | 项目名称 |
| description | TEXT | | 描述 |
| grid_size | INTEGER | NOT NULL, CHECK 3~24 | n 值（n×n） |
| cover_path | TEXT | | 封面图相对路径（可选） |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

> 说明：`grid_size` 创建后**不可修改**（如需修改需新建项目或走"扩容"特殊流程，v1 不支持）。

#### 3.2.2 `cards` 卡片
| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | BIGSERIAL | PK | 内部主键 |
| code | VARCHAR(64) | UNIQUE, NOT NULL | 业务 ID，供外部系统引用 |
| name | VARCHAR(100) | NOT NULL | 卡片名称 |
| image_path | TEXT | | 图片相对路径 |
| image_mime | VARCHAR(64) | | MIME |
| image_size | INTEGER | | 字节数 |
| image_width | INTEGER | | 像素宽 |
| image_height | INTEGER | | 像素高 |
| meta | JSONB | NOT NULL DEFAULT '{}' | 扩展信息 |
| is_active | BOOLEAN | NOT NULL DEFAULT true | 软删除标记 |
| created_at / updated_at | TIMESTAMPTZ | | |

#### 3.2.3 `card_triggers` 卡片关联触发信息
| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | BIGSERIAL | PK | |
| card_id | BIGINT | FK → cards(id) ON DELETE CASCADE | |
| trigger_key | VARCHAR(64) | NOT NULL | 触发键，如 `group` / `type` / `tag` |
| trigger_value | VARCHAR(255) | NOT NULL | 触发值，如 `terrain` |
| effect_type | VARCHAR(32) | NOT NULL | `highlight` / `glow` / `blink` / `tooltip` |
| effect_config | JSONB | NOT NULL DEFAULT '{}' | 如 `{"color":"#FFD400","duration":800}` |
| created_at | TIMESTAMPTZ | | |

**触发语义**：当用户在编辑器中悬停/选中某卡片时，取出该卡片全部 `(trigger_key, trigger_value)` 对，凡持有相同键值对的其它卡片，按 `effect_type` 施加视觉效果。

#### 3.2.4 `map_cells` 画布单元格
| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | BIGSERIAL | PK | |
| project_id | BIGINT | FK → map_projects ON DELETE CASCADE | |
| x | INTEGER | NOT NULL | 列，0 起 |
| y | INTEGER | NOT NULL | 行，0 起 |
| card_id | BIGINT | FK → cards ON DELETE SET NULL | 可空表示空格 |
| rotation | SMALLINT | DEFAULT 0 | 0/90/180/270 |
| z_index | INTEGER | DEFAULT 0 | 叠放顺序 |
| updated_at | TIMESTAMPTZ | | |
| | | **UNIQUE (project_id, x, y)** | |

> 空格子不落库（采用稀疏存储），保存时仅写入有卡片的格子。

#### 3.2.5 `map_regions` 区域标记
| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | BIGSERIAL | PK | |
| project_id | BIGINT | FK → map_projects ON DELETE CASCADE | |
| name | VARCHAR(100) | NOT NULL | 区域名称 |
| description | TEXT | | 描述 |
| color | VARCHAR(16) | DEFAULT '#3B82F6' | 边框/填充色 |
| border_width | SMALLINT | DEFAULT 3 | 边界线宽（px，逻辑值） |
| fill_opacity | NUMERIC(3,2) | DEFAULT 0.08 | 区域底色透明度 |
| meta | JSONB | DEFAULT '{}' | 扩展 |
| created_at / updated_at | TIMESTAMPTZ | | |

#### 3.2.6 `map_region_cells` 区域-单元格关联
| 字段 | 类型 | 约束 |
|---|---|---|
| region_id | BIGINT | FK → map_regions ON DELETE CASCADE |
| x | INTEGER | NOT NULL |
| y | INTEGER | NOT NULL |
| | | **PK (region_id, x, y)** |

> 约束：同一项目内，一个单元格**最多归属一个区域**（在应用层校验，保存时若冲突返回 `409`）。

### 3.3 索引
```sql
CREATE INDEX idx_cells_project ON map_cells(project_id);
CREATE INDEX idx_cells_card ON map_cells(card_id);
CREATE INDEX idx_regions_project ON map_regions(project_id);
CREATE INDEX idx_triggers_card ON card_triggers(card_id);
CREATE INDEX idx_triggers_kv ON card_triggers(trigger_key, trigger_value);
CREATE INDEX idx_cards_meta ON cards USING GIN (meta);
```

---

## 4. 后端 API 设计

**统一前缀**：`/api`
**统一响应体**：
```jsonc
{ "code": 0, "message": "ok", "data": { } }
// 错误：{ "code": 40001, "message": "参数校验失败", "data": null }
```

### 4.1 地图项目

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects` | 分页列表，参数：`page`、`pageSize`、`keyword`、`sort` |
| POST | `/api/projects` | 创建。Body：`{ name, description?, gridSize }` |
| GET | `/api/projects/:id` | 详情（含卡片使用数、区域数） |
| PATCH | `/api/projects/:id` | 修改 `name` / `description`（`gridSize` 不可改） |
| DELETE | `/api/projects/:id` | 删除（级联删除 cells / regions） |
| POST | `/api/projects/:id/duplicate` | 复制项目（含画布与区域） |

**POST /api/projects 请求示例**
```json
{ "name": "新手村地图", "description": "第一章", "gridSize": 20 }
```
**校验规则**：`name` 1~100 字符且同名校验（可选）；`gridSize` 整数，范围 3~24。

### 4.2 卡片管理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/cards` | 列表，支持 `keyword`、`isActive`，返回图片访问 URL |
| POST | `/api/cards` | 创建。Body：`{ code, name, meta?, triggers? }` |
| GET | `/api/cards/:id` | 详情（含 triggers） |
| PATCH | `/api/cards/:id` | 修改名称 / meta / `isActive` |
| DELETE | `/api/cards/:id` | 软删除（`is_active=false`），若被引用则同时把引用格置空可配置 |
| POST | `/api/cards/:id/image` | `multipart/form-data`，字段名 `file`，上传/替换图片 |
| DELETE | `/api/cards/:id/image` | 删除图片 |
| GET | `/api/cards/:id/usages` | 返回引用该卡片的项目列表与坐标 |
| PUT | `/api/cards/:id/triggers` | 全量覆盖该卡片的触发信息 |

**上传约束**
- 允许类型：`image/png`、`image/jpeg`、`image/webp`、`image/svg+xml`
- 单文件 ≤ 2 MB
- 服务端用 `sharp` 读取宽高；大于 512×512 时生成等比缩略图作为展示图

### 4.3 编辑器画布

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/:id/map` | 获取完整画布数据 |
| PUT | `/api/projects/:id/map` | 全量保存画布（事务） |
| GET | `/api/projects/:id/regions` | 区域列表 |
| POST | `/api/projects/:id/regions` | 创建区域 |
| PATCH | `/api/regions/:regionId` | 更新区域信息（名称/颜色/线宽/成员格） |
| DELETE | `/api/regions/:regionId` | 删除区域 |

**GET `/api/projects/:id/map` 响应**
```jsonc
{
  "code": 0,
  "data": {
    "project": { "id": 1, "name": "新手村地图", "gridSize": 20 },
    "cells": [
      { "x": 3, "y": 4, "cardId": 12, "rotation": 0, "zIndex": 0 }
    ],
    "regions": [
      {
        "id": 7, "name": "森林区", "color": "#22C55E",
        "borderWidth": 4, "fillOpacity": 0.08,
        "cells": [{ "x": 1, "y": 1 }, { "x": 2, "y": 1 }]
      }
    ]
  }
}
```

**PUT `/api/projects/:id/map` 请求体**
```jsonc
{
  "cells": [{ "x": 3, "y": 4, "cardId": 12, "rotation": 0, "zIndex": 0 }],
  "regions": [
    { "id": 7, "name": "森林区", "color": "#22C55E",
      "borderWidth": 4, "fillOpacity": 0.08,
      "cells": [{ "x": 1, "y": 1 }] }
  ]
}
```
**服务端处理**：单事务内 `DELETE` 该项目 cells/regions → 批量 `INSERT`；校验坐标范围、`cardId` 存在性、区域互斥性。返回保存后的完整数据与 `updatedAt`。

### 4.4 静态文件

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/files/*` | 读取 `storage/uploads` 下的文件，`Cache-Control: public, max-age=31536000` |

### 4.5 错误码

| code | HTTP | 含义 |
|---|---|---|
| 0 | 200 | 成功 |
| 40001 | 400 | 参数校验失败 |
| 40004 | 404 | 资源不存在 |
| 40901 | 409 | 名称重复 / 单元格已被其它区域占用 |
| 41301 | 413 | 文件过大 |
| 41501 | 415 | 文件类型不支持 |
| 50000 | 500 | 服务器内部错误 |

---

## 5. 文件存储方案

```
murdoku-maker/packages/server/storage/
└── uploads/
    └── cards/
        └── {cardId}/
            ├── {uuid}.png          # 原图
            └── {uuid}_thumb.webp   # 缩略图
```

- 数据库中仅保存**相对路径**（如 `cards/12/a1b2c3.png`），不保存绝对路径或域名。
- 访问 URL 由后端拼接：`${PUBLIC_BASE_URL}/api/files/${path}`。
- 删除卡片图片时采用延迟物理删除（标记后由定时任务清理），避免并发读写异常。
- `UPLOAD_ROOT` 通过环境变量配置，便于后续切换对象存储（S3/OSS）。

---

## 6. 前端页面与交互设计

### 6.1 路由

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | 重定向 → `/projects` | |
| `/projects` | 地图项目列表页 | 项目管理 |
| `/cards` | 卡片管理页 | 卡片 CRUD + 图片上传 |
| `/editor/:projectId` | 编辑器页 | 全屏编辑 |

### 6.2 页面一：地图项目列表

**布局**
- 顶部：标题 + 「新建项目」按钮（右侧）
- 工具条：搜索框、排序（更新时间/名称）、视图切换（网格/列表）
- 主体：shadcn `Card` 网格，每张卡片展示封面、名称、`n × n` 尺寸、卡片数、区域数、更新时间
- 每项操作：编辑（跳转编辑器）、重命名、复制、删除

**新建项目弹窗**（shadcn `Dialog` + `Form`）
| 字段 | 组件 | 校验 |
|---|---|---|
| 名称 | Input | 必填，≤100 字 |
| 描述 | Textarea | 选填，≤500 字 |
| 画布尺寸 n | Input(Number) 或 Slider | 必填，整数 3~24，默认 20 |

**删除二次确认**：`AlertDialog`，提示"将同时删除画布上的所有卡片与区域，不可恢复"。

### 6.3 页面二：卡片管理

**布局**
- 左侧：卡片列表（缩略图 + 名称 + code + 触发标签）
- 右侧：详情表单

**卡片详情表单字段**
| 字段 | 组件 | 说明 |
|---|---|---|
| 名称 | Input | 必填 |
| 业务 ID（code） | Input | 必填，唯一，仅字母数字下划线 |
| 图片 | 上传区（拖拽/点击） | 支持预览、替换、删除 |
| meta | 键值对编辑器 | 可选扩展 |
| 触发信息 | 动态行列表 | 每行：`trigger_key` + `trigger_value` + `effect_type` + `effect_config` |

**触发信息行示例**
| trigger_key | trigger_value | effect_type | effect_config |
|---|---|---|---|
| group | terrain | highlight | `{"color":"#22C55E"}` |
| type | water | glow | `{"color":"#3B82F6","duration":1200}` |

**删除卡片**：若 `/usages` 返回非空，弹窗提示"该卡片正被 N 个项目使用"，提供「仅停用」与「停用并清空引用」两个选项。

### 6.4 页面三：编辑器（核心）

#### 6.4.1 整体布局
```
┌──────────────────────────────────────────────────────────────┐
│ 顶栏：返回 | 项目名(n×n) | 缩放-/+ 100% | 撤销 重做 | 保存    │
├──────────┬───────────────────────────────────────┬───────────┤
│ 左侧栏   │            画布区域（可滚动/缩放）      │ 右侧属性栏 │
│          │                                       │ （可选）   │
│ [卡片]   │      ┌──┬──┬──┬──┬──┬──┐              │ 选中信息   │
│ [区域]   │      ├──┼──┼──┼──┼──┼──┤              │ 区域表单   │
│ [工具]   │      ├──┼──┼──┼──┼──┼──┤              │            │
│          │      └──┴──┴──┴──┴──┴──┘              │            │
│ 260px    │                                       │ 280px      │
└──────────┴───────────────────────────────────────┴───────────┘
```

#### 6.4.2 左侧栏

**Tab 1：卡片面板（Card Palette）**
- 网格排列卡片缩略图，支持按名称/code/meta 搜索
- 每张卡片可拖拽（Pointer 拖拽，带浮动预览图跟随光标）
- 悬停卡片时高亮画布上所有"触发关联"的已放置卡片

**Tab 2：区域列表**
- 展示当前所有区域，可点击定位并高亮
- 每项可重命名 / 改色 / 删除

**Tab 3：工具**
| 工具 | 快捷键 | 说明 |
|---|---|---|
| 选择/放置 | V | 默认模式：拖入卡片、点击选中格 |
| 框选区域 | R | 拖出矩形选择一片格子 |
| 橡皮擦 | E | 点击/拖过清除格子上的卡片 |
| 平移 | Space+拖拽 / 中键 | 移动画布视口 |

#### 6.4.3 画布区域

**渲染方案**
- 外层容器：`transform: translate(px,py) scale(zoom)`，`transform-origin: 0 0`
- 网格与卡片统一使用 **DOM 渲染**（`div` 绝对定位 / CSS Grid）
  - 因 `n ≤ 24`，单项目最大格子数为 `24 × 24 = 576`，DOM 节点量级完全可控，无需 Canvas 方案
  - 每个单元格为独立 `div`，卡片图通过 `<img>` 或 CSS `background-image` 渲染
  - 区域底层与卡片层分离，便于独立更新
- 区域层：SVG 覆盖层（与网格同坐标系），`pointer-events: none`
- 交互层：透明 div 覆盖，监听 pointer 事件，把坐标换算成 `(x, y)`

**坐标换算**
```
x = floor((clientX - rect.left - panX) / (cellSize * zoom))
y = floor((clientY - rect.top  - panY) / (cellSize * zoom))
```

**格子视觉**
- 单元格尺寸 `cellSize` 默认 48px
- 网格线 1px `#E5E7EB`
- 悬停格：`ring-2 ring-primary`
- 已放置卡片：填充图片，`object-fit: cover`，圆角 2px

#### 6.4.4 拖拽交互

**从面板拖入画布**
1. `pointerdown` 在卡片上 → 创建 `DragGhost`（半透明图，`position: fixed`，跟随光标）
2. `pointermove` → 实时计算当前悬停格，若合法则该格显示虚影（幽灵预览）
3. `pointerup` → 若在画布内且坐标合法，写入状态：`cells[(x,y)] = { cardId }`
4. `Esc` 中断拖拽

**画布内移动**
- `pointerdown` 已有卡片的格子 → 记录起点；移动超过阈值（4px）进入拖拽模式，原格显示为半透明
- 释放到目标格：若目标已有卡片则**交换**（或按 `zIndex` 覆盖，可在设置中配置，默认交换）

**删除**
- 选中格后按 `Delete` / `Backspace`
- 橡皮擦工具点击或拖过

#### 6.4.5 区域框选与标记（需求 4）

**流程**
1. 切换到「框选区域」工具（`R`），光标变为十字
2. 在画布上按住并拖拽 → 实时绘制选择矩形（半透明蓝底 + 虚线边框）
3. 释放鼠标 → 高亮已选中的格子集合（矩形覆盖的所有格）
4. 弹出 **区域信息弹窗**（shadcn `Dialog`）：
   | 字段 | 组件 | 默认值 | 校验 |
   |---|---|---|---|
   | 区域名称 | Input | 空 | 必填，≤100 字，项目内唯一 |
   | 描述 | Textarea | 空 | 选填 |
   | 颜色 | ColorPicker（预设色板 + 自定义） | `#3B82F6` | 必填 |
   | 边界线宽 | Slider | 4 | 1~12 |
   | 填充透明度 | Slider | 0.08 | 0~0.5 |
5. 确认 → 写入区域；取消 → 清除选择
6. 若选中格中存在已被其它区域占用的格子 → 弹窗提示冲突，提供「覆盖」或「跳过冲突格」

**区域的编辑与调整**
- 点击区域边界 → 选中该区域，右侧属性栏可改名/改色/改线宽
- 选中区域后，按住 `Shift` 点击格子可增删成员格
- 支持拖拽区域整体平移（可选，v1.1）

#### 6.4.6 区域边界粗线渲染（关键实现）

**算法**：对区域内每个单元格 `(x, y)`，检查四邻；邻格不属于同一区域时才绘制该条边。

```ts
// 伪代码：生成 SVG path 线段集合
for (const { x, y } of region.cells) {
  const X = x * S, Y = y * S, R = X + S, B = Y + S;
  if (!has(x, y - 1)) lines.push([X, Y, R, Y]); // 上
  if (!has(x, y + 1)) lines.push([X, B, R, B]); // 下
  if (!has(x - 1, y)) lines.push([X, Y, X, B]); // 左
  if (!has(x + 1, y)) lines.push([R, Y, R, B]); // 右
}
```

**渲染**
```jsx
<svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
  {lines.map(([x1,y1,x2,y2], i) => (
    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={region.color}
          strokeWidth={region.borderWidth}
          strokeLinecap="square"
          strokeLinejoin="miter" />
  ))}
</svg>
```

**视觉要求**
- 边界线宽**必须显著大于**单元格网格线（1px），最小 3px，默认 4px
- 使用 `strokeLinecap="square"` 保证相邻线段无缝拼接、拐角无缺口
- 区域底色使用同色 `fillOpacity` 铺底，`z-index` 位于卡片图之下、网格线之上
- 区域被选中时，边界线加发光效果（`filter: drop-shadow`）

#### 6.4.7 高亮触发联动

| 触发场景 | 效果 |
|---|---|
| 悬停左侧面板中的卡片 | 画布上所有具有相同 `trigger_key/value` 的卡片按 `effect_type` 高亮 |
| 点击画布上某张卡片 | 同上，且选中态持续到点击空白处 |
| 选中区域 | 区域内所有卡片高亮，区域边界加粗发光 |
| `highlight` | 元素外发光 + 轻微放大（`scale 1.06`） |
| `glow` | 呼吸动画（`animation: pulse 1.2s infinite`） |
| `blink` | 闪烁（`opacity` 0.4↔1） |
| `tooltip` | 悬停显示 `effect_config.text` |

---

## 7. 状态管理与保存策略

### 7.1 Zustand Store 结构
```ts
interface EditorState {
  project: Project | null;
  gridSize: number;
  cells: Map<string, CellData>;        // key = `${x},${y}`
  regions: RegionData[];
  activeTool: 'select' | 'region' | 'eraser' | 'pan';
  selection: { x: number; y: number } | null;
  zoom: number;
  pan: { x: number; y: number };
  dirty: boolean;
  history: { past: Snapshot[]; future: Snapshot[] };

  // actions
  placeCard(x, y, cardId): void;
  removeCard(x, y): void;
  moveCard(from, to): void;
  createRegion(payload): void;
  updateRegion(id, patch): void;
  deleteRegion(id): void;
  undo(): void;
  redo(): void;
  save(): Promise<void>;
}
```

### 7.2 保存策略
- **手动保存**：顶栏「保存」按钮 + `Ctrl/Cmd + S`
- **自动保存**（可选开关，默认关闭）：`dirty` 后 3 秒防抖触发
- **离开拦截**：`dirty === true` 时，路由跳转/关闭页面前弹出确认
- **并发保护**：保存请求携带 `updatedAt`，服务端比对不一致返回 `409`，前端提示"数据已被他人修改"

### 7.3 撤销 / 重做
- 采用快照栈，仅保存 `cells` 与 `regions` 的浅拷贝，最多 50 步
- 快捷键：`Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z`

### 7.4 快捷键总表
| 快捷键 | 功能 |
|---|---|
| `V` / `R` / `E` | 切换工具 |
| `Space` + 拖拽 | 平移画布 |
| `Ctrl + 滚轮` | 以光标为中心缩放 |
| `Ctrl + 0` | 重置缩放至 100% |
| `Ctrl + S` | 保存 |
| `Ctrl + Z` / `Ctrl + Shift + Z` | 撤销 / 重做 |
| `Delete` / `Backspace` | 删除选中格卡片 |
| `Esc` | 取消当前操作 / 取消选中 |
| `方向键` | 移动选中格（+Shift 加速） |

---

## 8. 非功能性需求

### 8.1 性能
| 指标 | 要求 |
|---|---|
| 画布首屏渲染 | 全部尺寸下 < 300ms（DOM 渲染，`n ≤ 24`，最多 576 格） |
| 拖拽帧率 | 保持 ≥ 50 FPS |
| 保存接口 P95 | < 300ms（`n ≤ 24`，格子数最多 576） |
| 列表接口 P95 | < 300ms |
| 批量写入 | 使用 `knex.batchInsert`，单批 ≤ 1000 行 |

### 8.2 安全
- 上传文件白名单校验（MIME + 扩展名 + magic number 三重校验）
- 文件名使用 UUID 重命名，杜绝路径穿越
- 静态文件服务限制在 `UPLOAD_ROOT` 内（`path.resolve` 后前缀校验）
- 所有入参经 zod 校验；SQL 全部使用参数化查询
- 文件大小与请求体大小限制（`koa-body` 的 `maxFileSize`）

### 8.3 兼容性
- 浏览器：Chrome / Edge ≥ 110，Firefox ≥ 110，Safari ≥ 16
- 最低分辨率 1280×720，低于 1024px 宽时左侧栏折叠为抽屉

### 8.4 可用性
- 所有破坏性操作二次确认
- 接口失败统一 `toast` 提示（shadcn `Sonner`）
- 空状态、加载态（Skeleton）、错误态三态齐全

### 8.5 可维护性
- 前后端共享类型定义置于 `packages/shared`
- 后端分层：router → controller → service → repository
- 数据库迁移使用 Knex migrations，版本化管理
- 关键路径单元测试（Vitest）+ 接口集成测试（Supertest）

---

## 9. 开发计划（建议）

| 阶段 | 内容 | 产出 |
|---|---|---|
| M1（3d） | 工程脚手架、Monorepo 搭建（`murdoku-maker/`）、DB 迁移、共享类型 | 可运行的空壳 |
| M2（4d） | 项目管理 CRUD（前后端） | 项目列表页可用 |
| M3（4d） | 卡片管理 + 图片上传 + 触发信息配置 | 卡片管理页可用 |
| M4（6d） | 编辑器画布渲染、拖拽放置、缩放平移 | 可编辑画布 |
| M5（4d） | 区域框选、命名、粗边界渲染、冲突处理 | 区域功能完整 |
| M6（3d） | 保存/读取、撤销重做、快捷键、高亮联动 | 编辑器闭环 |
| M7（2d） | 性能优化、异常处理、联调测试 | 可交付版本 |

---

## 10. 后续扩展（Out of Scope，v1 不实现）

- 多图层（背景层 / 装饰层 / 逻辑层）
- 卡片旋转、翻转、多帧动画
- 区域形状非矩形（多边形、自由笔刷）
- 地图导入 / 导出（JSON、PNG、Tiled TMX）
- 多人实时协同（Yjs / WebSocket）
- 权限体系与操作日志
- 对象存储（S3 / OSS）替换本地文件系统

---

**附：验收标准摘要**

1. 能创建 `n × n` 项目并在列表中管理（增删改查、复制），n 范围 3~24。
2. 能上传图片创建卡片，卡片含名称、唯一 ID、触发关联信息。
3. 编辑器可拖拽卡片到任意格，可移动、删除，保存后刷新数据一致。
4. 可框选多个连续格子并命名标记为区域；区域边界线明显粗于网格线，且在区域内部不产生多余分隔线。
5. 触发关联信息能正确驱动高亮等视觉效果。