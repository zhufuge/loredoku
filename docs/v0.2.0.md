# 地图编辑器系统需求文档

**项目代号**：murdoku-maker
**文档类型**：变更说明（仅描述本次新增/修改内容，未提及的部分沿用 0.1）
**变更日期**：—

---

## 0. 变更总览

| 类别 | 编号 | 摘要 |
|---|---|---|
| 修复 | FIX-01 | 编辑器未保存时点击浏览器返回，弹窗点「离开」后卡死 |
| 优化 | OPT-01 | 画布默认居中 |
| 优化 | OPT-02 | 新建项目画布尺寸默认值改为 6 |
| 优化 | OPT-03 | 网格线加粗、改为黑色 |
| 优化 | OPT-04 | 区域默认颜色改为黑色、默认不透明 |
| 新特性 | FEAT-01 | 角色管理（列表 + 基本信息 + 头像上传） |
| 新特性 | FEAT-02 | 卡片重构为「物品」：表重命名、分类、多格占位、可站立标识 |
| 新特性 | FEAT-03 | 编辑器增强：尺寸调整、标尺、多图层、底部工具条、角色槽位、右侧信息抽屉 |
| 新特性 | FEAT-04 | 区域支持任意连通形状、标识 ID、名称标签、悬停高亮 |
| 新特性 | FEAT-05 | 版本发布管理（数独式校验、版本快照、基于版本生成草稿） |
| 新特性 | FEAT-06 | 地图数据由逐格行存储改为单条 JSONB 存储，支持导入导出 |

---

## 1. 修复项

### FIX-01 离开确认弹窗在浏览器返回场景下失效

**现象**
在编辑器页 `dirty = true` 时点击**浏览器返回按钮**，弹出确认框，点击「离开」后弹窗不消失、页面也不返回。

**根因**
- 弹窗 `open` 由本地 `useState` 控制，导航由 `history` 控制，二者状态不同步；
- `proceed()` 在弹窗状态尚未被 React 提交时被调用，被弹窗自身的 `onOpenChange` 回调覆盖；
- 路由仍使用 `<BrowserRouter>`，`useBlocker` 未生效。

**修复要求**

1. **路由改造**：改用 Data Router（`createBrowserRouter` + `RouterProvider`），以支持 `useBlocker`。
2. **单一数据源**：确认弹窗的 `open` 状态必须严格由 `blocker.state === 'blocked'` 推导，**不得使用独立的 `useState`**。
3. **点击「离开」的执行顺序**：
   ```
   blocker.state === 'blocked' → requestAnimationFrame(() => blocker.proceed())
   ```
   保证 React 完成一次渲染后再导航。
4. **点击「取消」**：调用 `blocker.reset()`，URL 不变。
5. **关闭/刷新浏览器标签页**：由 `beforeunload` 事件拦截，不使用自定义弹窗（浏览器不允许自定义）。
6. **兜底机制**：监听 `popstate`，若 300ms 后 URL 仍在编辑器路由、`dirty = true`、弹窗已关闭，调用 `history.go(-1)`。

**验收标准**
- 在编辑器修改内容后点击浏览器返回 → 出现弹窗；
- 点「离开」→ 弹窗关闭且成功返回上一页；
- 点「取消」→ 弹窗关闭且停留在编辑器；
- 刷新/关闭标签页 → 浏览器原生气泡提示。

---

## 2. 优化项

### OPT-01 画布默认居中

- 进入编辑器时按视口计算初始 `pan`，使网格中心与画布容器中心重合：
  ```
  panX = (containerW - gridSize * cellSize * zoom) / 2
  panY = (containerH - gridSize * cellSize * zoom) / 2
  ```
- 窗口 `resize` 时，若用户**未手动拖动过**画布，则重新居中；拖动过后保持用户视角。
- 「重置视图」按钮 / `Ctrl + 0`：恢复居中 + 100% 缩放。

### OPT-02 新建项目默认尺寸

- 新建项目弹窗中「画布尺寸 n」默认值由 20 改为 **6**。
- 取值范围仍为 3~24，不改变。

### OPT-03 网格线样式

| 项 | 原值 | 新值 |
|---|---|---|
| 网格线颜色 | `#E5E7EB` | `#000000` |
| 网格线宽度 | 1px | **2px** |
| 画布外边框 | 1px 浅灰 | **3px `#000000`** |

- 区域边界线宽最小值随之由 3px 调整为 **4px**。

### OPT-04 区域默认视觉

| 项 | 原默认值 | 新默认值 |
|---|---|---|
| 颜色 | `#3B82F6` | **`#000000`** |
| 填充透明度 `fillOpacity` | `0.08` | **`1`（不透明）** |

- 由于默认为不透明会遮挡底层内容，图层面板新增 **「区域填充临时透明化」** 开关（仅本地视图，不写入数据），开启时该区域 `fillOpacity` 在视图中按 `0.3` 渲染。

---

## 3. 新特性

### FEAT-01 角色管理

#### 3.1.1 功能范围
- 角色列表页 `/characters`
- 新增、编辑、软删除角色
- 上传/替换/删除头像（自动正方形居中裁剪至 256×256）
- 展示角色被引用的地图列表

#### 3.1.2 数据库新增表 `characters`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | BIGSERIAL | PK | |
| code | VARCHAR(64) | UNIQUE, NOT NULL | 业务 ID |
| name | VARCHAR(100) | NOT NULL | 角色名称 |
| description | TEXT | | 简介 |
| avatar_path | TEXT | | 头像相对路径 |
| avatar_mime | VARCHAR(64) | | |
| avatar_size | INTEGER | | 字节数 |
| avatar_width / avatar_height | INTEGER | | 像素尺寸 |
| meta | JSONB | NOT NULL DEFAULT '{}' | 扩展 |
| is_active | BOOLEAN | NOT NULL DEFAULT true | 软删除标记 |
| created_at / updated_at | TIMESTAMPTZ | | |

索引：`idx_chars_active (is_active) WHERE is_active = true`

#### 3.1.3 新增接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/characters` | 列表，参数 `keyword`、`isActive` |
| POST | `/api/characters` | 创建 |
| GET | `/api/characters/:id` | 详情 |
| PATCH | `/api/characters/:id` | 修改基础信息 |
| DELETE | `/api/characters/:id` | 软删除 |
| POST | `/api/characters/:id/avatar` | 上传头像（自动方形裁剪） |
| DELETE | `/api/characters/:id/avatar` | 删除头像 |
| GET | `/api/characters/:id/usages` | 引用该角色的地图列表 |

#### 3.1.4 文件存储新增目录
```
storage/uploads/characters/{characterId}/
  ├── {uuid}.png
  └── {uuid}_avatar.webp    # 256×256 方形裁切
```

#### 3.1.5 页面交互
- 左侧列表：头像 + 名称 + code，支持搜索
- 右侧表单：名称、code、描述、头像上传（圆形预览）、meta
- 删除时若 `/usages` 非空 → 提示"该角色正被 N 个地图使用"，提供「仅停用」与「停用并清空引用」

---

### FEAT-02 卡片 → 物品（Item）重构

#### 3.2.1 命名变更

| 原概念 | 新概念 | 原表名 | 新表名 |
|---|---|---|---|
| 卡片 / Card | 物品 / Item | `cards` | `items` |
| 卡片触发信息 | 物品触发信息 | `card_triggers` | `item_triggers` |
| 卡片管理页 | 物品管理页 | `/cards` | `/items` |

- 迁移脚本：`RENAME TABLE cards TO items`、`RENAME TABLE card_triggers TO item_triggers`，并同步重命名外键列 `card_id → item_id` 与相关索引名。
- API 前缀由 `/api/cards` 改为 `/api/items`（旧路径**保留 302 重定向 3 个月**，便于过渡）。

#### 3.2.2 表结构扩展

`items` 表在原 `cards` 基础上**新增字段**：

| 字段 | 类型 | 约束 | 默认 | 说明 |
|---|---|---|---|---|
| category | VARCHAR(32) | NOT NULL | — | `background` / `object` |
| width_cells | SMALLINT | NOT NULL, CHECK 1~24 | 1 | 占据列数 |
| height_cells | SMALLINT | NOT NULL, CHECK 1~24 | 1 | 占据行数 |
| can_stand | BOOLEAN | NOT NULL | true | 是否可站角色 |

`item_triggers` 表字段同原 `card_triggers`，仅外键列名改为 `item_id`。

#### 3.2.3 分类语义

| 分类值 | 显示名 | 用途 | 图层约束 |
|---|---|---|---|
| `background` | 背景 | 地面、草地、水面 | 仅可放背景层 |
| `object` | 物件 | 桌子、墙、汽车 | 仅可放物件层 |

#### 3.2.4 多格占位语义
- `width_cells × height_cells` 描述物品在画布上占据的格数，至少有一个 > 1 即为多格物品。
- 落位时以**鼠标悬停格为左上角锚点**，检查目标矩形是否越界或与同层物品冲突。
- 多格物品在数据中的表示：仅在**锚点格**存完整信息，其余覆盖格存 `objectRef` 指向锚点（详见 FEAT-06 的 JSON 结构）。

#### 3.2.5 可站立标识
- `can_stand = false` 的物品（墙、石头等）所在格不可放置角色。
- 物件层物品的 `can_stand` 决定该格是否可站立；背景层物品**不参与**站立判断。
- 物品管理页中，`canStand = false` 的物品卡片显示「禁站」角标。

#### 3.2.6 接口变更

| 方法 | 新路径 | 变更点 |
|---|---|---|
| GET | `/api/items` | 新增查询参数 `category`、`canStand` |
| POST | `/api/items` | Body 新增 `category`、`widthCells`、`heightCells`、`canStand` |
| PATCH | `/api/items/:id` | 支持上述新字段 |
| 其余 | `/api/items/:id/...` | 与 v1 卡片接口语义一致，仅路径与字段名调整 |

#### 3.2.7 物品管理页交互变更
- 顶部增加分类 Tab：`全部 / 背景 / 物件`
- 表单新增：分类下拉、占位宽 × 高（两个 Number）、可站角色开关
- 当 `width × height > 1` 时展示缩略预览，提示实际占位形状
- 建议上传图宽高比与占位比一致（仅提示，不强制）

---

### FEAT-03 编辑器增强

#### 3.3.1 整体布局调整

```
┌──────────────────────────────────────────────────────────────┐
│ 顶栏：← 返回 | 项目名 | 状态徽章 | 版本 ▾ | 保存 | 发布       │
├──────┬────────────────────────────────────────┬──────────────┤
│      │  C1  C2  C3  C4  C5  C6   ← 顶部标尺     │              │
│ 角色 │ ┌──┬──┬──┬──┬──┬──┐                    │ 右侧信息抽屉  │
│ 槽位 │ │  │  │  │  │  │  │                    │（可折叠）     │
│ 区   │ ├──┼──┼──┼──┼──┼──┤                    │              │
│      │ │  │  │  │  │  │  │                    │ · 格子信息    │
│ [1]  │ ├──┼──┼──┼──┼──┼──┤                    │ · 区域信息    │
│ [2]  │ │  │  │  │  │  │  │                    │ · 角色信息    │
│ …    │ └──┴──┴──┴──┴──┴──┘                    │              │
│      │        ┌──────────────────────┐        │              │
│      │        │ 工具条（底部居中浮动）│        │              │
│      │        └──────────────────────┘        │              │
└──────┴────────────────────────────────────────┴──────────────┘
```

#### 3.3.2 画布尺寸调整

**入口**：顶栏项目名旁的 `n × n` 标签，点击打开弹窗。

**规则**：
- 变大：原内容坐标不变，画布向**右下角**扩展
- 变小：从**右下角**裁剪。被裁掉范围内的物品、区域成员、角色一并移除
- 多格物品若跨越新边界 → 该物品整体移除
- 被移除的角色回到左侧槽位空槽

**新增接口**

```
PATCH /api/projects/:id/grid-size
Body: { "gridSize": 8 }
```

**响应**：
```jsonc
{
  "code": 0,
  "data": {
    "gridSize": 8,
    "removed": { "cells": 5, "items": 3, "regions": 1, "charactersReturnedToSlot": 1 }
  }
}
```

**交互**：弹窗内 Slider + Number（3~24），变小时实时以半透明红罩预览将裁掉的区域。

#### 3.3.3 标尺

- **顶部**：`C1 C2 ... Cn`
- **左侧**：`R1 R2 ... Rn`
- 宽 28px，背景 `#F9FAFB`，文字 `#374151`，字号 11px
- 当前悬停/选中行列在标尺上高亮（背景 `#DBEAFE`）
- 随画布平移同步滚动；字号不随缩放变化

#### 3.3.4 多图层模型

- 每格最多两层：`background`（背景层）+ `object`（物件层）
- 每层最多一个物品
- 图层与物品分类强绑定（见 FEAT-02）
- 底部工具条提供 `[背景] [物件]` 图层切换
- **渲染顺序**（下→上）：
  ```
  网格底色 → 背景层 → 区域填充 → 物件层 → 区域边框 → 角色 → 悬停/选中效果
  ```

#### 3.3.5 底部工具条

浮动于画布底部居中，胶囊形（`rounded-full shadow-lg`）。

| 分组 | 元素 | 说明 |
|---|---|---|
| 工具 | 选择 `V` | 默认，点击选中、拖拽移动 |
| | 区域 `R` | 框选区域 |
| | 角色 `C` | 从槽位/抽屉拖入角色 |
| | 橡皮 `E` | 清除当前图层物品 |
| | 平移 `Space` | 临时切换 |
| 物品抽屉 | 「物品」按钮 | 向上弹出物品抽屉 |
| 缩放 | `− / 100% / +` | 点击百分比重置至 100% |
| 历史 | `↶ ↷` | 撤销 / 重做 |

#### 3.3.6 物品抽屉

- 从底部工具条向上弹出，高度约 200px
- Tabs：`全部 / 背景 / 物件`，右侧搜索
- 缩略图右下角标注 `2×1` 等多格标识
- 不可站立物品显示「禁站」角标
- 拖入画布时按物品 `category` 自动匹配图层
- 目标格已有同层物品 → 默认替换；按住 `Alt` 拖入则拒绝并提示

#### 3.3.7 角色槽位区

- 位于画布左侧，竖直排列 `n` 个 48×48 槽位
- 空槽显示虚线边框，有角色则显示头像
- 顶部显示 `已放置 x/n`
- 从「角色抽屉」拖拽角色到槽位填充
- 从槽位拖拽角色到**可站立**格子完成放置，槽位清空
- 从地图拖回槽位 → 撤下角色

#### 3.3.8 右侧信息抽屉

初始收起（仅显示竖直把手），点击对象后自动展开，宽 320px。

**场景一：选择工具点击单个格子**
- 坐标 `C{x+1}, R{y+1}`
- 背景层：缩略图、名称、ID、触发信息
- 物件层：缩略图、名称、ID、多格尺寸、可站立标识
- 角色：头像、名称（点击展开编辑）
- 所属区域：名称 + 区域 ID
- 快捷操作：清空本格 / 清空物件层

**场景二：点击区域名称标签**
- 名称、区域 ID、颜色、线宽、填充透明度、格子数
- 操作：编辑 / 定位到区域 / 删除

**场景三：点击已放置角色**
- 弹 `Dialog`（非抽屉）展示角色详情 + **地图关联信息编辑器**
- 关联信息为自由键值对（如 `dialog`、`questId`、`trigger`），写入 `placedCharacters[].mapMeta`
- 若角色所在格不可站立，显示红色警告

#### 3.3.9 高亮触发联动（在 v1 基础上扩展）
- 悬停槽位中角色 → 地图上该角色高亮
- 点击格子内物品的触发标签 → 画布上所有具有相同 `trigger_key/value` 的物品高亮
- 悬停区域名称标签 → 该区域边框高亮（详见 FEAT-04）

---

### FEAT-04 区域增强

#### 3.4.1 任意连通形状

新增三种形状工具（在底部工具条上切换）：

| 模式 | 说明 |
|---|---|
| 矩形 | 拖出矩形，选中范围内所有格（保留 v1 行为） |
| 多边形 | 依次点击顶点，双击闭合；顶点吸附到格点 |
| 自由笔刷 | 按住拖过格子加入选择；`Alt + 拖拽` 为减选 |

**连通性校验**：所选格子必须 4-邻接连通，否则提示"区域必须是相连的方格"。

#### 3.4.2 区域标识 ID

- 每个区域在名称之外新增业务 ID：`regionId`（短 uuid，如 `rg_a1b2c3`）
- 项目内唯一，仅字母数字下划线
- 创建时可编辑，默认自动生成
- 存入地图 JSON 的 `regions[].id`

#### 3.4.3 区域名称标签

**位置规则**：
- 取区域中 `y` 最大的行（最下方行）
- 在该行的区域格子里取 `x` 中位数所在格作为 `labelCell`
- 结果写入地图 JSON 的 `regions[].labelCell`

**样式**：
- 胶囊形，背景为该区域颜色，文字按对比度自动取黑/白
- 字号 11px，`pointer-events: auto`

**交互**：
- 点击标签 → 选中区域，右侧抽屉展示区域信息
- **悬停标签 → 区域边框高亮加粗 + 发光**（`filter: drop-shadow(0 0 4px <color>)`）
- 区域内物品随区域选中一并高亮

#### 3.4.4 默认视觉（OPT-04 同步生效）
- 颜色默认 `#000000`
- 边界线宽默认 4px，范围 4~12px
- 填充透明度默认 1，范围 0~1

---

### FEAT-05 版本发布管理

#### 3.5.1 数据模型

**项目表新增字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| current_version_no | INTEGER NOT NULL DEFAULT 0 | 最新版本号，0 = 未发布 |
| status | VARCHAR(16) NOT NULL DEFAULT 'draft' | `draft` / `published` |

**新增表 `map_versions`**

| 字段 | 类型 | 约束 |
|---|---|---|
| id | BIGSERIAL | PK |
| project_id | BIGINT | FK → map_projects ON DELETE CASCADE |
| version_no | INTEGER | NOT NULL，从 1 递增 |
| grid_size | INTEGER | NOT NULL |
| data | JSONB | NOT NULL，发布时的地图快照 |
| notes | TEXT | 发布说明 |
| published_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| | | UNIQUE (project_id, version_no) |

#### 3.5.2 发布校验规则（服务端强制，前端预校验）

| 编号 | 规则 | 失败提示示例 |
|---|---|---|
| P1 | 已放置角色数 = `gridSize` | "需放置 6 个角色，当前 4 个" |
| P2 | 每个角色所在格**可站立** | "角色 X 位于不可站立格 (3,4)" |
| P3 | 任意两角色**不同行** | "角色 X 与角色 Y 位于同一行" |
| P4 | 任意两角色**不同列** | "角色 X 与角色 Y 位于同一列" |
| P5 | 每一行至少有 1 个可站立格 | "第 R3 行没有可站立格" |
| P6 | 每一列至少有 1 个可站立格 | "第 C5 列没有可站立格" |
| P7 | 多格物品完整在画布内、无图层冲突 | "位置 (x,y) 存在图层冲突" |
| P8 | 区域之间无交叉格 | "区域 A 与区域 B 存在重叠格" |

> P1~P4 组合即数独式约束。

#### 3.5.3 新增接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/:id/versions` | 版本列表 |
| GET | `/api/projects/:id/versions/:versionNo` | 某版本完整数据 |
| POST | `/api/projects/:id/publish` | 发布当前草稿 |
| POST | `/api/projects/:id/versions/:versionNo/draft` | 基于某版本创建新草稿 |
| DELETE | `/api/projects/:id/versions/:versionNo` | 删除某版本 |

**发布成功响应**
```jsonc
{ "code": 0, "data": { "versionNo": 4, "publishedAt": "..." } }
```

**发布失败响应（HTTP 422）**
```jsonc
{
  "code": 42201,
  "message": "发布校验失败",
  "data": {
    "errors": [
      { "rule": "P1", "message": "需放置 6 个角色，当前 4 个" },
      { "rule": "P3", "message": "角色「村民A」与「村民B」位于同一行" }
    ]
  }
}
```
新增错误码：`42201` 发布校验失败。

#### 3.5.4 交互流程

**顶栏版本切换下拉**
- 展示：`草稿` 或 `v3（已发布）`
- 下拉列出全部历史版本
- 选择历史版本 → 进入只读模式浏览
- 只读模式顶栏出现「基于此版本创建草稿」按钮

**发布流程**
1. 点击顶栏「发布」
2. 前端预校验 P1~P8，失败则弹窗列出错误项，**点击错误项定位到画布**
3. 校验通过 → 弹窗填写 `notes`（选填）→ 确认
4. 调用 `POST /api/projects/:id/publish`
5. 成功后顶栏版本号刷新

**编辑已发布版本**
- 只读模式点击「基于此版本创建草稿」→ 调用 `POST .../versions/:versionNo/draft`
- 成功 → 跳回可编辑模式，Toast 提示"已从 v3 创建新草稿"

**新增路由**
| 路径 | 说明 |
|---|---|
| `/projects/:id/versions` | 版本列表页 |
| `/editor/:projectId/v/:versionNo` | 只读版本浏览 |

---

### FEAT-06 数据存储重构

#### 3.6.1 设计原则

- 地图数据**整体以 JSONB 存储**，不再逐格落库
- 项目表增加 `draft_data` JSONB 字段保存当前草稿
- 发布快照存于 `map_versions.data` JSONB
- 角色、区域、格子、图层信息全部内嵌在 JSON 中

**收益**：读写原子化、无跨表事务、导入导出零成本、彻底消除稀疏行问题。

#### 3.6.2 项目表变更

| 变更 | 字段 |
|---|---|
| 新增 | `draft_data JSONB NOT NULL DEFAULT '{}'` |
| 新增 | `current_version_no INTEGER NOT NULL DEFAULT 0` |
| 新增 | `status VARCHAR(16) NOT NULL DEFAULT 'draft'` |
| 移除 | `map_cells` 表及其索引 |
| 移除 | `map_regions` 表、`map_region_cells` 表及其索引 |

> `grid_size` 本版**允许修改**（详见 FEAT-03.2）。

#### 3.6.3 地图 JSON 结构（`draft_data` / `versions.data`）

```jsonc
{
  "version": 1,                    // JSON 结构版本号，便于升级兼容
  "gridSize": 6,

  // 稀疏存储：仅记录非空格子，key = "x,y"
  "cells": {
    "0,0": {
      "background": { "itemId": 12 },
      "object": { "itemId": 15, "w": 2, "h": 1 }   // 多格物品仅锚点存完整信息
    },
    "1,0": { "objectRef": "0,0" },                 // 该格被 0,0 处的 2×1 物品占据
    "2,3": { "background": { "itemId": 18 }, "object": { "itemId": 22, "w": 1, "h": 1 } }
  },

  "regions": [
    {
      "id": "rg_a1b2c3",           // 区域标识 ID
      "name": "森林区",
      "color": "#000000",
      "borderWidth": 4,
      "fillOpacity": 1,
      "cells": [[1,1],[2,1],[1,2],[2,2],[3,2]],
      "labelCell": [2,2]            // 名称标签锚点（最下方行居中格）
    }
  ],

  // 角色槽位：长度恒为 gridSize，null 表示空槽
  "characterSlots": [
    null, null,
    { "characterId": 5 },
    { "characterId": 7 },
    null, null
  ],

  // 已在地图上的角色
  "placedCharacters": [
    {
      "characterId": 5,
      "x": 2, "y": 3,
      "mapMeta": { "dialog": "村民A", "questId": "q001" }
    }
  ]
}
```

#### 3.6.4 JSON 约束规则（前后端同步校验）

1. `gridSize` 范围 3~24。
2. `cells` key 的 `x, y` 在 `[0, gridSize)` 内。
3. `objectRef` 必须指向同一 JSON 中存在的锚点格，且锚点确实覆盖此格。
4. 多格物品的所有覆盖格必须在画布内。
5. 背景层物品 `category` 必须为 `background`；物件层同理。
6. 区域 `cells` 必须 4-邻接连通。
7. 同一格最多归属一个区域。
8. `characterSlots.length === gridSize`。
9. `placedCharacters[].characterId` 必须存在于某个槽位或已放置角色中。

#### 3.6.5 接口变更

| 方法 | 路径 | 变更 |
|---|---|---|
| GET | `/api/projects/:id/map` | 返回 `project` + `draft` + `updatedAt` |
| PUT | `/api/projects/:id/map` | Body 为 `{ draft, expectedUpdatedAt }`，全量覆盖 |
| GET | `/api/projects/:id/export` | **新增**，导出地图 JSON（可选 `?withAssets=1` 打包 zip） |
| POST | `/api/projects/import` | **新增**，导入地图 JSON 创建新项目 |
| — | 旧 `/api/projects/:id/regions/*` | **移除**（区域随 JSON 一并保存） |

**PUT 请求体**
```jsonc
{
  "draft": { /* 3.6.3 JSON 结构 */ },
  "expectedUpdatedAt": "2026-05-01T10:00:00Z"
}
```

**服务端处理顺序**：
1. zod schema 校验 JSON 结构
2. 业务规则校验（3.6.4）
3. 乐观锁比对，冲突返回 `40902`
4. 单事务 `UPDATE map_projects SET draft_data = ?, grid_size = ?, updated_at = now()`

新增错误码：`40902` 草稿被他人修改（乐观锁冲突）；`40903` 区域重叠冲突。

#### 3.6.6 导入导出

**导出**：返回可直接 `JSON.parse` 的完整地图数据，携带 `version` 字段。`?withAssets=1` 时打包为 zip，内含 `map.json` + `assets/` 图片目录。

**导入**：严格 schema 校验，支持选项：
- `reuseItems`：是否按 code 复用已存在物品（否则新建）
- `reuseCharacters`：同上，针对角色

---

## 4. 前端状态与 Hook 变更

### 4.1 Zustand Store 扩展

在 v1 基础上新增字段：

```ts
interface EditorState {
  // 新增
  viewMode: 'draft' | 'version';
  versionNo?: number;
  activeLayer: 'background' | 'object';
  regionShape: 'rect' | 'polygon' | 'brush';
  characterSlots: (SlotData | null)[];
  placedCharacters: PlacedCharacter[];
  hoverCell: { x: number; y: number } | null;

  // 新增 actions
  assignCharacterToSlot(slotIndex: number, characterId: number): void;
  placeCharacter(slotIndex: number, x: number, y: number): void;
  returnCharacterToSlot(characterId: number): void;
  updateCharacterMapMeta(characterId: number, meta: object): void;
  resizeGrid(newSize: number): Promise<ResizeResult>;
  publish(notes?: string): Promise<PublishResult>;
  createDraftFromVersion(versionNo: number): Promise<void>;
}
```

### 4.2 离开拦截 Hook（FIX-01）

统一封装为 `useUnsavedChangesGuard(dirty: boolean)`：

- 使用 `useBlocker`，要求路由采用 `createBrowserRouter`
- 弹窗 `open` 严格由 `blocker.state === 'blocked'` 推导
- 点「离开」：`requestAnimationFrame(() => blocker.proceed())`
- 点「取消」：`blocker.reset()`
- `beforeunload` 拦截关闭/刷新
- `popstate` 兜底

### 4.3 快捷键新增

| 快捷键 | 功能 |
|---|---|
| `C` | 切换到角色工具 |
| `1` / `2` | 切换图层（背景 / 物件） |
| `Ctrl + Shift + P` | 发布 |
| `Alt + 拖拽` | 区域自由笔刷模式下减选 |

---

## 5. 技术栈增量

| 项 | 变更 |
|---|---|
| 路由 | react-router-dom 必须使用 **Data Router**（`createBrowserRouter` + `RouterProvider`）以支持 `useBlocker` |
| 后端 | 新增 `sharp`（头像方形裁切，v1 已用于缩略图，本次扩展用途） |
| 数据库 | PostgreSQL 需启用 JSONB 相关索引能力（默认支持） |

---

## 6. 数据迁移

由于表结构调整较大，需提供一次性迁移脚本：

1. `cards` → `items` 重命名，新增 `category / width_cells / height_cells / can_stand` 四列，默认值分别为 `'object' / 1 / 1 / true`。
2. `card_triggers` → `item_triggers`，外键列 `card_id` → `item_id`。
3. 新建 `characters`、`map_versions` 表。
4. `map_projects` 增加 `draft_data / current_version_no / status` 三列。
5. **数据折叠**：将 `map_cells`、`map_regions`、`map_region_cells` 三表数据按项目聚合生成 JSON，写入 `map_projects.draft_data`。
6. 校验折叠结果无误后，`DROP` 三张旧表。

> 迁移脚本须在**事务**中执行，并提供 dry-run 模式。

---

## 7. 本版验收标准

1. **FIX-01**：编辑器 `dirty` 时浏览器返回 → 弹窗点「离开」→ 弹窗关闭且成功返回上一页；点「取消」→ 停留当前页。
2. **OPT-01**：进入编辑器画布自动居中。
3. **OPT-02**：新建项目尺寸默认值为 6。
4. **OPT-03**：网格线为 2px 黑色，外边框 3px 黑色。
5. **OPT-04**：区域默认颜色 `#000000`、填充不透明。
6. **FEAT-01**：角色可创建、编辑、上传头像（自动方形裁剪）、查看引用。
7. **FEAT-02**：原「卡片」已全部更名为「物品」；物品有分类、可设多格占位、可设是否可站立；表名与接口路径同步更新。
8. **FEAT-03**：
   - 编辑器可调整画布尺寸，变大向右下扩展、变小从右下裁剪；
   - 画布上方有 `C1..Cn`、左侧有 `R1..Rn` 标尺；
   - 每格支持背景层 + 物件层两物品；
   - 底部居中工具条包含工具、物品抽屉、缩放、撤销/重做；
   - 左侧有 `n` 个角色槽位；
   - 点击格子/区域标签/角色，右侧抽屉展示对应信息，角色可编辑地图关联信息。
9. **FEAT-04**：区域支持矩形/多边形/自由笔刷任意连通形状；有标识 ID；名称显示在最下方行居中格；悬停名称标签时区域边框高亮。
10. **FEAT-05**：发布时执行 P1~P8 校验；发布产生带版本号的不可变快照；基于已发布版本可创建新草稿。
11. **FEAT-06**：地图数据以单条 JSONB 存储；支持导入导出。
