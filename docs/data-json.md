# 地图 / 谜题 data JSON 结构

**文档类型**：数据结构参考（当前状态，随代码演进维护；**唯一真源是 zod schema**，本文是它的可读版）
**适用范围**：`maps.data`、`puzzles.data`，以及编辑器「导出 JSON / 导入 JSON」得到的 `.json` 文件
**代码落点**：`packages/shared/src/types/domain.ts`、`schemas/mapDraft.ts`、`schemas/puzzle.ts`、`schemas/participant.ts`、`constants/`（v0.10.4 起按主题分文件，总出口仍是 `constants/index.ts`）
**最后同步**：v0.7.12（`MAP_JSON_VERSION = 8`、`PUZZLE_JSON_VERSION = 2`）

---

## 目录

1. 两份 data 的关系
2. 它存在哪儿、怎么进出
3. 通用约定
4. `MapDraft` — 地图画布
5. `PuzzleDraft` — 谜题
6. 版本与向后兼容
7. 导入 / 导出的确切行为
8. 手写 JSON 的检查清单
9. 相关文档

---

## 1. 两份 data 的关系

```
MapDraft（一张画布）
  └─ 发布 → maps 版本行的 data（快照）

PuzzleDraft（一份谜题）
  ├─ map.data : 一份 MapDraft 的副本（创建谜题时从某个已发布版本复制）
  ├─ characterSlots : 名册（参与者 + 线索 + 联动）
  └─ linkageColors : 联动主题色调色板
```

两条硬规则先记住，后面所有细节都从它们推出来：

1. **谜题自带画布，不是引用画布。** `PuzzleDraft.map.data` 是完整的一份 `MapDraft`，所以谜题能独立发布、独立冻结；地图之后再改版本，已有谜题不受影响。
2. **谜题的画布尺寸只有一个真源：`data.map.data.gridSize`。** 没有 `grid_size` 列、没有第二个数字，名册长度也按它来。

---

## 2. 它存在哪儿、怎么进出

| 数据 | 列 / 文件 | 说明 |
|---|---|---|
| 地图草稿 | `maps.data`（`version = 'draft'` 的行） | `jsonb`；**可以为 `NULL`** = 还没初始化（创建地图时不写草稿，第一次进编辑器才填尺寸或导入） |
| 地图版本 | `maps.data`（`version` 为纯数字字符串的行） | 发布时把草稿整份复制过来；版本行只读、软删 |
| 谜题 | `puzzles.data` | 草稿行与版本行同构，都是 `PuzzleDraft` |
| 游戏 | **库里没有自己的 JSON** | `games.puzzle_id` 指向一条**谜题版本行**，游戏页直接读它的 `data`；玩家的摆放进度在浏览器本地（见下） |

**JSON 里没有的东西**（它们在表列上，不随文件走）：

- 地图的 `name` / `description` / `cover_path` —— 所以导出的地图 JSON 是一份纯画布，不带名字。
- 谜题的 `cover_path`；谜题的 `name` / `description` **两边都有**：`data` 里存一份，保存时镜像回 `puzzles.name` / `description`（列表页不必解 JSON）。

**库外还有一份 JSON**：玩家在游戏页摆的格子存在 `localStorage`，键是 `loredoku.game.progress.<slug>`，形状为
`{ v, gridSize, participantCount, board }`。`board` 的键同样是 `"x,y"`，值是三种之一：

| 值 | 含义 |
|---|---|
| `{ "kind": "participant", "index": n }` | 第 `n` 位参与者的头像（`n` 从 1 起） |
| `{ "kind": "numbers", "entries": [n, …] }` | 格子里 3×3 排开的参与者编号，最多 9 个 |
| `{ "kind": "forbidden", "auto"?: true }` | 黑色 `×`；`auto` = 同行同列自动补的，不是玩家点的（v0.7.11） |

`null` 也接受，等同「这格没放东西」。`v` 是存档版本（当前 `2`），`gridSize` + `participantCount` 是指纹：两者任何一个对不上，整条存档作废（宁可空白，不可错乱）。它不是导出文件，也不落库 —— 只是别在 `games` 表里找它。

**接口**：

| 动作 | 接口 | 请求体 |
|---|---|---|
| 保存地图画布 | `PUT /api/maps/:id/map` | `{ data: MapDraft }` |
| 导入地图 | `POST /api/maps/:id/map/import` | `{ data: MapDraft }` |
| 改尺寸 | `PATCH /api/maps/:id/grid-size` | `{ gridSize }` |
| 保存谜题 | `PUT /api/puzzles/:id` | `{ data: PuzzleDraft, updatedAt?, mapSource? }` |
| 发布 | `POST /api/maps/:id/versions` · `POST /api/puzzles/:id/versions` | `{ version? }` |

> 表里的请求体是**信封**，信封里的 `data` 才是本文描述的 JSON。导出的文件就是 `data` 本身，没有外面那层 `{ data: ... }`。

---

## 3. 通用约定

**坐标**：`x` 向右、`y` 向下，都从 `0` 开始；`gridSize = n` 的棋盘合法范围是 `0 … n-1`。
schema 给坐标的是一个**很松的上限** `0 … 96`（`GRID_SIZE_MAX × 4`），真正的边界在保存 / 发布时按 `gridSize` 校验 —— 所以「解析通过」不等于「格子都在盘内」。

**`cells` 是稀疏的**：只写有内容的格子，键是字符串 `"x,y"`（必须匹配 `^\d+,\d+$`）。空格子**不要**写成 `null`，直接不出现。

**引用一律用数据库 id**：`assetId` / `variantId` / `characterId` / 版本号，没有一处用资源 `code` 或角色 `code`。
所以一份 JSON **不是跨库可移植的** —— 换一个数据库导入，这些数字会指向别的资源（或者什么都不指向）。它的用途是备份、审阅、手工构造，以及在同一个库里搬运。

**颜色**一律 `#RRGGBB`（6 位，大小写不限）；唯一例外是 `style.mouseCursorBox.shadowColor`，它接受 `#RRGGBB` 或 `rgb()/rgba()`。

**缺键 = 默认值**：`style` 的每个子对象、`themeColor`、`clue`、`linkages`、`rosterCols`、`description` 都有默认值，缺键会在解析时补齐。

**多余键分两种待遇**，别按「全是 strict」记（`packages/shared/src/schemas/strictness.test.ts` 就是下面这张表的可执行版本）：

| 待遇 | 哪些层 |
|---|---|
| **报错**（`unrecognized_keys`） | `MapDraft` / `PuzzleDraft` / `map` 快照 / `DraftCell` / `DraftRegion` / `region.style` 与它的三个子对象 / `CharacterSlotEntry` / `positionConditions` 的每个元素 |
| **静默丢弃**（没写 `.strict()`） | `style` 的九个块及其内部（`style.canvasFrame` 里多写一个键不报错，只是不生效）、`cell.background` / `cell.item`、`linkageColors` 的每一项、联动的四个目标对象 |

第二类正是 `formId` 必须显式预处理的原因：锚点对象不吃 strict，名字写错的键会被悄悄扔掉（§6.3）。

**`version` 不是开关**：schema 只要求它是正整数。编辑器写出的永远是当前值（地图 `8`、谜题 `2`），谜题保存时服务端还会强制改写成 `PUZZLE_JSON_VERSION`；它真正的作用是给迁移和人看的标记，读取路径不靠它分支。

---

## 4. `MapDraft` — 地图画布

### 4.1 顶层

| 键 | 类型 | 必填 | 取值 | 说明 |
|---|---|---|---|---|
| `version` | number | ✔ | 正整数 | 当前 `8`；见 §6 |
| `gridSize` | number | ✔ | 2–24 | 棋盘边长（正方形）；尺寸的唯一真源 |
| `cells` | object | ✔ | 键 `"x,y"` | 稀疏的格子表，见 §4.2 |
| `regions` | array | ✔ | 元素见 §4.5 | 可以为空数组 |
| `style` | object | ✘ | 见 §4.7 | 缺席 = 全用 `DEFAULT_MAP_STYLE` |

> **没有** `characterSlots`、没有 `style.linkageColors` —— 这两块从 v0.5.0 起归谜题。地图 JSON 里出现它们会被 `.strict()` 拒绝，导入时还会额外给一句人话提示（§7）。

### 4.2 `cells` / `DraftCell`

一个格子最多写三样东西（前两样才是「层」）：

| 键 | 类型 | 说明 |
|---|---|---|
| `background` | `DraftAssetRef` | 背景层，恒占 1 格（§4.3） |
| `item` | `DraftAnchorItem` | 物品层；只有**锚点格**写这一块（§4.4） |
| `itemRef` | string | **历史字段**（v0.6.0 前的 `objectRef`），1–64 字符。只为兼容老草稿，新数据不写 |

### 4.3 背景层 `DraftAssetRef`

| 键 | 类型 | 必填 | 取值 | 说明 |
|---|---|---|---|---|
| `assetId` | number | ✔ | 正整数 | 必须是 `type = 'background'` 的资源 |
| `variantId` | number | ✘ | 正整数 | 用哪个形态；缺席 = 该资源的第一个形态 |

### 4.4 物品层 `DraftAnchorItem`

| 键 | 类型 | 必填 | 取值 | 说明 |
|---|---|---|---|---|
| `assetId` | number | ✔ | 正整数 | 必须是 `type = 'item'` 的资源 |
| `variantId` | number | ✘ | 正整数 | 同上，缺席 / 找不到都回退第一个形态 |
| `w` | number | ✔ | ≥ 1 的整数 | 脚位宽（格）。**新放置恒为 1**，老草稿保留原值 |
| `h` | number | ✔ | ≥ 1 的整数 | 脚位高（格） |
| `scale` | number | ✘ | 0.25–4 | **展示**缩放，`1` = 填满脚位；缺席 = 1 |
| `offsetX` | number | ✘ | -4–4 | 按**格**的水平偏移，正数向右；缺席 = 0 |
| `offsetY` | number | ✘ | -4–4 | 按**格**的垂直偏移，正数向下；缺席 = 0 |

**脚位与展示是两件事**：占格 / 擦除 / 碰撞读 `w × h`；`scale` / `offset` 只改画出来那一块，可以把图放大到脚位之外，也不会让它变成 3×3 的占格物。老草稿里一个 2×2 的物品，`w` / `h` 仍是 2，所以已发布地图一像素不变。

### 4.5 `regions`

| 键 | 类型 | 必填 | 取值 | 说明 |
|---|---|---|---|---|
| `id` | string | ✔ | 1–64 字符 | 编辑器生成形如 `rg_45ca41eb`；联动按它引用 |
| `name` | string | ✔ | 1–100 字符 | 显示为区域标签 |
| `cells` | array | ✔ | `[[x, y], …]`，≥ 1 项 | 区域覆盖的格子；不同区域**不可重叠**（保存即拒），发布时还要求**连通** |
| `labelCell` | `[x, y] \| null` | ✘ | 合法坐标 | 标签落在哪一格；缺席 / `null` = 自动算（`computeLabelCell`，取最后一行）。v0.10.7 起渲染按**该行本区域格子的横向跨度中点**放标签，所以底部行是偶数格时也居中（此前取中位那一格，会右偏半格） |
| `style` | object | ✘ | 见 §4.6 | 只记与地图级缺省的**差异** |

### 4.6 `region.style` — 区域自己的样式

三个子对象都可整个缺席；每个子对象内部也是「只写改过的字段」。三者全等于地图级缺省时，整个 `style` 键不应写（助手 `regionStyleOverride` 负责这件事）。

| 子对象 | 字段（全部可选） |
|---|---|
| `outline` | `width` 1–12 整数、`color` |
| `highlight` | `width` 1–12（可小数）、`color` |
| `label` | `fontFamily`、`fontSize` 9–48 整数、`strokeWidth` 0–12、`color`、`strokeColor`、`hoverFontSize` 9–48 整数、`hoverColor`、`hoverStrokeColor`、`hoverStrokeWidth` 0–12、`offset`（见下） |

`label.offset` 是这块区域标签相对「格子上沿居中」的像素位移，`{ "x"?: number, "y"?: number }`，两轴都可缺（只改一个方向时另一轴视为 0），整块缺席 = 不偏移。正数向右 / 向下。**v0.10.7 起没有上下限**（原先是 ∓200）：只要求是有限数字，取整在渲染侧做。

`fontFamily` 存的是**字体名**（`"WenKai"`、`"霞鹜文楷"`）或内置 key（`system` / `sans` / `serif` / `kai` / `mono`），不是 CSS 串：长度 ≤ 64，且不能含引号 / 逗号 / 分号（否则会撕开回退链）。本构建没带的字体照原样保留，渲染时退回系统字体。

### 4.7 `style` — 地图级缺省

九个块，全部有默认值；下表的「默认」就是 `DEFAULT_MAP_STYLE`。

| 键 | 字段 | 默认 |
|---|---|---|
| `cellSize` | `number \| null` | `null` = 自适应；显式值 32–240。v0.10.3 起渲染只把它当**上限**（实际格子 = `min(此值, 按窗口算出的自适应值)`），也不再出现在编辑界面里 |
| `canvasFrame` | `width` 1–12、`color` | `12` / `#000000` |
| `gridSeparator` | `width` 1–12、`color` | `4` / `#000000` |
| `mouseCursorBox` | `width` 1–12、`color`、`blockedColor`、`shadowColor` | `8` / `#FFFFFF` / `#EF9A9A` / `rgba(0,0,0,0.15)` |
| `operationCursorBox` | `width` 1–12、`color`、`offset` 0–8 | `8` / `#90CAF9` / `1` |
| `regionLabel` | `fontFamily`、`fontSize` 9–48、`strokeWidth` 0–12、`color`、`strokeColor`、`hoverFontSize` 9–48、`hoverColor`、`hoverStrokeColor`、`hoverStrokeWidth` 0–12 | `system` / `32` / `10` / `#FFFFFF` / `#000000` / `36` / `#FFFFFF` / `#3B82F6` / `10` |
| `regionOutline` | `width` 1–12 整数、`color` | `12` / `#000000` |
| `regionHighlight` | `width` 1–12、`color` | `12` / `#3B82F6` |
| `ruler` | `fontSize` 9–32、`gap` 0–32 | `24` / `24` |

所有尺寸都是**在 `cellSize = 120` 下作者写的值**，渲染时统一乘 `cellSize / 120`，所以同一份配置在 2×2 和 24×24 上读数一致。

### 4.8 完整示例（3×3）

```json
{
  "version": 8,
  "gridSize": 3,
  "cells": {
    "0,0": { "background": { "assetId": 12, "variantId": 31 } },
    "1,0": { "background": { "assetId": 12, "variantId": 31 } },
    "0,1": { "background": { "assetId": 12, "variantId": 31 } },
    "1,1": {
      "background": { "assetId": 12, "variantId": 31 },
      "item": { "assetId": 88, "variantId": 120, "w": 1, "h": 1, "scale": 1.5 }
    },
    "2,2": { "item": { "assetId": 88, "variantId": 120, "w": 1, "h": 1 } }
  },
  "regions": [
    {
      "id": "rg_45ca41eb",
      "name": "前厅",
      "cells": [[0, 0], [1, 0], [0, 1], [1, 1]],
      "labelCell": [1, 1],
      "style": { "outline": { "color": "#5C2223" }, "highlight": { "color": "#EE9B9B" } }
    }
  ],
  "style": {
    "cellSize": 120,
    "canvasFrame": { "width": 8, "color": "#000000" },
    "gridSeparator": { "width": 2, "color": "#000000" },
    "regionOutline": { "width": 6, "color": "#000000" },
    "regionHighlight": { "width": 4, "color": "#3B82F6" },
    "regionLabel": { "fontFamily": "WenKai", "fontSize": 32 }
  }
}
```

这份例子是**合法**的：`style` 里没写的键会补默认值，`region.style` 只记了改过的两个颜色。

### 4.9 校验发生在哪

| 时机 | 检查 | 失败表现 |
|---|---|---|
| 解析（写入 / 导入） | zod schema：类型 / 范围 / 颜色格式 / 多余键 | 400 或「JSON 格式不正确」 |
| 保存 / 导入 | 格子与区域坐标在 `gridSize` 内；资源 id 存在；区域**不重叠** | 400；重叠是 `40903` |
| 发布 | 上一条全部 + 物品脚位不出界（`x + w ≤ gridSize`）+ 每个区域**连通** | `42201`，逐条列出 |

发布失败的每一条都带 `rule`：`bounds`（坐标越界）、`asset_reference`（资源不存在）、`item_out_of_bounds`（脚位出界）、`region_overlap`（区域重叠）、`region_connected`（区域不连通）—— 界面按它决定指向哪个格子或区域。

`variantId` 只参与渲染，不参与校验：指向别的资源的形态、或那个形态已被删，渲染时**静默回退该资源的第一个形态**。

---

## 5. `PuzzleDraft` — 谜题

### 5.1 顶层

| 键 | 类型 | 必填 | 取值 | 说明 |
|---|---|---|---|---|
| `version` | number | ✘ | 正整数 | 缺省 / 保存时都会被写成 `2` |
| `map` | object | ✔ | 见 §5.2 | 底图快照 + 一份画布副本 |
| `name` | string | ✔ | 1–100 字符 | 同时镜像到 `puzzles.name` |
| `description` | string | ✘ | ≤ 500 字符，默认 `""` | 同时镜像到 `puzzles.description` |
| `linkageColors` | array | ✔ | 2–12 项，见 §5.3 | 联动主题色调色板 |
| `characterSlots` | array | ✔ | 元素见 §5.4，可为 `null` | 名册；**长度在载入时归一到 `gridSize`** |
| `rosterCols` | `number \| null` | ✘ | 1–24 整数 | 名册矩阵列数；缺席 / `null` = 自动 |
| `clues` | array | ✘ | ≤ 8 项，每项 ≤ 120 字符，默认 `[]` | **全局线索**（v0.7.14）：整盘共享的几条规则，玩家侧贴在盘面左上角 |
| `ending` | string | ✘ | ≤ 200 字符，默认 `""` | **结束语**（v0.7.14）：玩家通过时出现在结算弹窗里 |
| `forbiddenSymbol` | `{ path: string } \| null` | ✘ | `storage/uploads` 下的图片相对路径 | **禁止符号的图**（v0.8.6）：玩家标记排除项时画面上显示的那张图；缺席 / `null` = 默认的 `×` 字形。新建谜题时从主题的 `data.forbiddenSymbol` 抄一份 |

### 5.2 `map` — 底图快照

| 键 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `mapId` | number | ✔ | 来自哪张地图（**只用于展示 / 追溯，无外键**） |
| `versionNo` | number | ✔ | 来自哪个已发布版本 |
| `mapName` | string | ✘ | 复制那一刻的地图名；默认 `""` |
| `data` | `MapDraft` | ✔ | **画布副本**，§4 的全部规则原样适用 |

两点容易踩：

- **谜题不跟着地图走。** 地图后来改了、甚至删了，这份副本都不动。
- **保存时客户端送来的 `map` 会被服务端丢掉。** 服务端总是用库里存的那份覆盖，只有显式带 `mapSource: { mapId, versionNo }`（= 换了底图）才去读那份已发布版本的画布。所以客户端伪造不了底图。

### 5.3 `linkageColors`

| 键 | 类型 | 必填 | 取值 |
|---|---|---|---|
| `key` | string | ✔ | `^[a-z][a-z0-9_-]{0,31}$`；联动按它引用 |
| `label` | string | ✔ | 1–16 字符，显示给作者看 |
| `color` | string | ✔ | `#RRGGBB` |

至少 2 项、至多 12 项（`red` / `blue` 是历史 key，老数据继续有效）。**它是必填的**：导入文件必须明确写出来，解析时不会补一份默认调色板。

新建谜题是另一回事：服务端在创建那一刻从底图版本的老 `style.linkageColors` 继承一份，继承不到才用随包的红 / 蓝对（`DEFAULT_LINKAGE_COLORS`）—— 那是一次显式写入，不是解析默认值，所以新谜题一打开就有两项而不是报错。同理，名册此时按画布尺寸开满 `null`，`rosterCols` 写 `null`（自动）。

### 5.4 `characterSlots` — 名册

数组长度在 schema 里**不限**（导入的文件可以带任何长度），载入时由 `genSlotArray(gridSize, …)` 归一：多的截掉、少的补 `null`。空位就是 `null`。

一个非空槽位（`CharacterSlotEntry`，`.strict()`）：

| 键 | 类型 | 必填 | 取值 | 说明 |
|---|---|---|---|---|
| `characterId` | number | ✔ | 正整数 | 角色表 id |
| `themeColor` | string | ✘ | `#RRGGBB`，默认 `#FFFFFF` | 参与者主题色 |
| `clue` | string | ✘ | ≤ 200 字符，默认 `""` | 卡片上的一行线索，支持 `**加粗**` |
| `linkages` | array | ✘ | 默认 `[]` | 扁平联动列表，见 §5.5 |
| `positionConditions` | array | ✘ | `[{ "x": 0, "y": 0 }, …]` | 允许占据的格子（多项取「或」）；**缺席 / 空数组 = 不限位置** |
| `displayNumber` | `string \| null` | ✘ | ≤ 6 字符 | 左上角「编号」显示什么；清空 = 写回序号 |

### 5.5 `linkages` — 四种联动目标

判别键是 `type`；四种都必带 `effect` 与 `color`。

| `type` | 其余键 | 含义 |
|---|---|---|
| `character` | `id`：某个槽位的 `characterId` | 高亮另一位参与者 |
| `asset` | `id`、`scope`（`all` \| `instances`，默认 `all`）、`instances?`（`[[x, y], …]`） | 高亮某个资源的全部实例，或指定某几格 |
| `cell` | `cells`：`[[x, y], …]`，≥ 1 项 | 高亮指定格子 |
| `region` | `id`：区域的 `id` | 高亮整个区域 |

`effect` ∈ `highlight` | `glow` | `blink` | `tooltip`。
`color` 必须是**本谜题** `linkageColors` 里的某个 `key`。

`scope` 与 `instances` 之间 schema **不互相约束**，但渲染对这两条的待遇不一样，别写反：

| 写下的 | 高亮 |
|---|---|
| `scope: "all"` | 该资源的全部实例（`instances` 写了也不看） |
| `scope: "instances"` + `instances: [[x, y], …]` | 只高亮这几格（按**锚点格**比对） |
| `scope: "instances"` + 没有 `instances` 键 | 退化成全部实例 |
| `scope: "instances"` + `instances: []` | 一格都匹配不上，什么都不高亮 |

后两种编辑器都不会写出来，手写时自己当心。

### 5.6 几个字段的语义

- **`positionConditions`**：只约束「这位参与者能放哪」，不影响渲染；空数组与缺席等价，所以保存时一律写「缺席」。
- **`displayNumber`**：配置在**条目**上而不是槽位序号上 —— 拖动换座位时序号变、它不变。留空 = 回落到序号。
- **`rosterCols`**：只是布局提示，不是事实。存的值超出今天的名册长度会被夹到 `[1, 槽位数]`；编辑器输入框上限是 6（`ROSTER_COLS_MAX`），超过 6 列的旧数据仍能渲染（面板封顶 512px 横向滚动）。行数从不存储，恒为 `ceil(槽位数 / 列数)`。
- **`clues` / `ending`**（v0.7.14）：**属于整个谜题**，与参与者各自的 `characterSlots[].clue` 分两层 —— 后者讲「这位住在哪」，是一个头像的条件；前者讲「这盘按什么规则摆」，玩家必须同时看着盘面。空串是合法的（导入的文件里可能带空行），读的时候要滤掉；编辑器的提交路径会 trim + 去空，所以正常写出来不会有空项。**旧数据缺这两个键是常态**（v0.7.14 之前发布出去的版本行是冻住的 JSON），读的地方一律按空处理，不要假设服务端补过默认值。
- **`forbiddenSymbol`**（v0.8.6）：作者**上传**的那张图，数据里只记它在 `storage/uploads` 下的相对路径（如 `puzzles/12/forbidden-symbol/<uuid>.webp`），不存 URL —— `PUBLIC_BASE_URL` 会随环境变；渲染时前端用 `fileUrlFromPath` 拼成 `/api/files/...`。上传时服务端就把它缩成长边 ≤ 256px 的 webp（只存这一张）。它是**谜题自己的字段**而不是主题风格，所以每一关各自带着它。**主题的 `data.forbiddenSymbol` 是新建谜题的缺省**（同一形状）：服务端在 `createPuzzle` 那一刻深拷贝进来，之后各走各的 —— 主题后来换图不影响已建/已发布的关卡。资源包导出会把这个文件收进包里（`files/symbols/...`）并把这条 path 改写成包内相对路径（`docs/v0.8.6.md` §4）。

### 5.7 完整示例（底图 3×3，3 个槽位）

```json
{
  "version": 2,
  "map": {
    "mapId": 17,
    "versionNo": 3,
    "mapName": "前厅平面图",
    "data": {
      "version": 8,
      "gridSize": 3,
      "cells": {
        "0,0": { "background": { "assetId": 12, "variantId": 31 } },
        "1,1": {
          "background": { "assetId": 12, "variantId": 31 },
          "item": { "assetId": 88, "variantId": 120, "w": 1, "h": 1 }
        }
      },
      "regions": [
        {
          "id": "rg_45ca41eb",
          "name": "前厅",
          "cells": [[0, 0], [1, 0], [0, 1], [1, 1]],
          "labelCell": [1, 1]
        }
      ],
      "style": { "cellSize": 120 }
    }
  },
  "name": "谁拿走了印盒",
  "description": "前厅只点了一盏灯。",
  "linkageColors": [
    { "key": "red", "label": "红", "color": "#EF9A9A" },
    { "key": "blue", "label": "蓝", "color": "#90CAF9" }
  ],
  "characterSlots": [
    {
      "characterId": 3063,
      "themeColor": "#CEC4AD",
      "clue": "她在**前厅**，就站在那件家具旁边。",
      "linkages": [
        { "type": "asset", "id": 88, "scope": "all", "effect": "highlight", "color": "red" },
        { "type": "region", "id": "rg_45ca41eb", "effect": "highlight", "color": "blue" }
      ]
    },
    {
      "characterId": 3064,
      "themeColor": "#FFFFFF",
      "clue": "",
      "linkages": [
        { "type": "character", "id": 3063, "effect": "glow", "color": "blue" },
        { "type": "cell", "cells": [[2, 2]], "effect": "blink", "color": "red" }
      ],
      "positionConditions": [{ "x": 0, "y": 2 }, { "x": 1, "y": 2 }],
      "displayNumber": "?"
    },
    null
  ],
  "rosterCols": 3,
  "forbiddenSymbol": { "path": "puzzles/12/forbidden-symbol/a1b2c3d4.webp" },
  "toolIcons": {
    "clear": { "path": "puzzles/12/tool-icons/clear/9f8e7d6c.webp" },
    "submit": { "path": "puzzles/12/tool-icons/submit/5a4b3c2d.webp" }
  }
}
```

`characterSlots` 长度 3 = `gridSize`，最后一个槽位空着。第 2 位参与者的 `linkages` 里 `character` 目标指向第 1 位的 `characterId`、`cell` 目标在 3×3 之内 —— 这两条都会被 schema 检查。`forbiddenSymbol` 指向一张上传的图（v0.8.6）：玩家在游戏页把这格标成排除项时，画面上画的就是那张图，而不是默认的 `×`；该图由 `POST /api/puzzles/:id/forbidden-symbol` 上传。**不写这个键就是「跟随主题」**（v0.8.7）：读取时依次找谜题自己的 → 主题的 → 内置的 `×`，所以新建谜题不会把主题那份抄进草稿。

`toolIcons`（v0.8.7）是同一套做法的三份：`clear` / `undo` / `submit` 三枚工具按钮的图标，**缺哪一枚就跟随主题**（再没有才画内置的 lucide 图标）。每枚复用同一个 `{ path }`，一次上传只改一枚；三枚都清空时整个键删掉，与「从没配过」同义。上面例子里只配了两枚 —— 没写 `undo` 就等于那一枚用主题的。

### 5.8 三层校验

| 层 | 检查 | 在哪跑 |
|---|---|---|
| ① schema 自洽 | 名册里的 `character` 目标必须是**本谜题**里存在的参与者；`cell` 目标与 `positionConditions` 必须在 `gridSize` 内；`color` 必须是调色板里的 key | `puzzleDraftSchema.superRefine`（前后端都会跑） |
| ② 跨表引用 | `asset` 目标必须在**自带画布的物品层**里出现过；`region` 目标的 `id` 必须在**自带画布的区域**里存在 | `validatePuzzleReferences`：导入前（前端）、保存前（服务端 `assertReferenceIssues`） |
| ③ 发布 | 名册至少 1 位参与者；角色 id 都存在；②再跑一遍 | `validatePuzzle` |

所以「JSON 解析通过」不等于「能保存」：引用了自家画布上没有的资源 / 区域，会在保存时被 400 拦下。

---

## 6. 版本与向后兼容

### 6.1 地图 `MAP_JSON_VERSION`

| 值 | 引入 | 变了什么 |
|---|---|---|
| 8 | v0.7.6 | 锚点键 `formId` → `variantId`（表名 `asset_forms` → `asset_variants`）；`w` / `h` 留在放置上 |
| 7 | v0.7.0 | 区域样式改成 `style` 深覆盖；删掉 `color` / `borderWidth` / `fillOpacity` 与整层区域填充 |
| 6 | v0.6.1 | 背景层也能写 `variantId` |
| 5 | v0.6.1 | 物品锚点可写 `variantId` |
| 4 | v0.6.0 | `object` → `item`、`itemId` → `assetId`、`objectRef` → `itemRef` |
| 3 | v0.5.0 | 名册与联动调色板搬去谜题 |
| 2 | v0.3.8 | 新增 `style` |
| 1 | 初版 | — |

### 6.2 谜题 `PUZZLE_JSON_VERSION`

| 值 | 引入 | 变了什么 |
|---|---|---|
| 2 | v0.7.1 | `map` 从「引用 `{ mapId, versionNo, gridSize }`」变成「来源信息 + 画布副本 `{ mapId, versionNo, mapName, data }`」 |
| 1 | v0.5.0 | 只有引用，没有画布 |

**只加可选字段不升版本号**（v0.7.14 的 `clues` / `ending` 就是这样）：老解析器读到新数据
会按 strict 拒掉，所以那批数据只在新版本里存在；新解析器读到老数据则靠默认值补齐。
版本号留给「老数据必须被改写才能读」那种变化（v1 → v2 的 `map` 换形状）。

### 6.3 老键与旧形状的待遇

| 老键 | 现在的键 | 处理方式 |
|---|---|---|
| `formId` | `variantId` | schema 预处理收下并改名（`withLegacyAnchorKey`）；**不收会被静默剥掉**，多形态资源会悄悄退回第一形态 |
| `projectId` | `mapId` | 同上（`puzzleMapRefSchema`） |
| `objectRef` | `itemRef` | v0.6.0 的字段名；`itemRef` 仍在 schema 里占位 |
| `characterSlots` / `style.linkageColors`（地图里） | 已移走 | 读旧行时 `absorbLegacyMapDraft` 直接丢掉这些键；**导入文件则明确拒绝**（§7） |
| 区域 `color` / `borderWidth` / `fillOpacity` | `region.style` | 读旧行时 `upgradeRegionStyleDraft` 升级（`borderWidth` 会带成 `style.outline.width`）；迁移 `20260101000030` 已改写过库里的行 |
| `triggers`（名册里的分组联动） | `linkages` | v0.3.3 摊平；迁移 `20260101000013` 改写过库里的行。今天的槽位是 `.strict()`，**再出现 `triggers` 直接报错** |
| 联动 `type: "item"` | `type: "asset"` | v0.6.0 改名；schema 只认 `character` / `asset` / `cell` / `region` 四个 `type` |
| `cell` 目标的 `{ "x": 1, "y": 2 }` | `{ "cells": [[1, 2]] }` | v0.3.2 起一个细胞目标可以含多格；迁移同一批摊平 |

读路径的兼容是**幂等**的：本来就是当前版本的数据原引用返回，不会每次读都复制一遍。另有两件容易误会的事：

- **`version` 会被盖成当前值。** `absorbLegacyMapDraft` / `absorbLegacyPuzzleDraft` 返回前都写 `version = 8` / `2`，所以「读到的 `version` 是当前值」不等于「库里那一行就是当前版本」。
- **地图的老键还躺在库里。** `characterSlots` / `style.linkageColors` / 区域那三个扁平字段都没有从 JSONB 里删掉，`absorbLegacyMapDraft` 只是读的时候丢掉它们（幂等，已经是当前版本的行原引用返回）。谜题不一样：迁移 `20260101000031` 把 v1 的 `data` 整条改写成了 v2。
- **v1 的谜题读出来是一块空画布。** 引用式底图（`{ mapId, versionNo, gridSize }`）本身没有格子可还原，只能给 `cells: {}` / `regions: []`（尺寸取 `map.gridSize`）。画面靠迁移 `20260101000031` 从地图版本回填；回填不了就只有空板。

---

## 7. 导入 / 导出的确切行为

### 7.1 导出

| 从哪 | 文件内容 | 文件名 |
|---|---|---|
| 地图编辑器工具栏「导出 JSON」 | `editor.toDraft()` 的结果 = 一份 `MapDraft` | `{地图名}-{id}.json` |
| 谜题编辑器 | `puzzle.toDraft()` 的结果 = 一份 `PuzzleDraft` | `{谜题名}-puzzle.json` |

两者都是**纯 `data`**，没有信封。缩进 2 空格。界面上这两条都在浏览器里拼，不经过服务端。

服务端另有 `GET /api/maps/:id/map/export`，返回同一份 `MapDraft`（没初始化过的地图给一份 6×6 空草稿，而不是 404）—— 界面没走它，写脚本 / 外部工具时可以用。谜题**没有**对应的 export 端点，只能读 `GET /api/puzzles/:id` 的 `data`。

### 7.2 导入地图

1. `JSON.parse` → `mapDraftSchema.safeParse`（`.strict()`）。
2. 解析前先看一眼 `characterSlots` / `style.linkageColors`：命中则提示**「该 JSON 是旧版（含参与者 / 联动主题色），请先移除这两部分，或改用导入到谜题」**并拒绝 —— 不静默剥离，否则作者会以为参与者导进去了。
3. 从工具栏导入 → 二次确认「导入会覆盖当前画布内容，导入后可通过撤销回退」；从**初始化弹窗**导入不确认（画布还是空的，没有「覆盖」可言）。
4. **导入后不自动保存**，写的是本地草稿，可以撤销。

### 7.3 导入谜题

1. `JSON.parse` → `puzzleDraftSchema.safeParse`。
2. **底图必须对得上**：`data.map.mapId` / `data.map.versionNo` 必须等于当前谜题的底图，否则提示「导入文件引用了另一个地图版本（v{n}），请新建谜题再导入」。理由：底图在创建时固定，静默换掉会改变整道题。
3. `validatePuzzleReferences`（跨表引用）再跑一遍。
4. 二次确认后应用。**只应用谜题自己的字段**（名称 / 描述 / 调色板 / 名册 / 列数）—— **画布不动**。`map.data` 只是随文件带过来的副本；名册长度还按**当前**画布的 `gridSize` 归一，不按文件里那个数。

### 7.4 保存谜题时的服务端加工

```ts
const data = {
  ...input.data,
  version: PUZZLE_JSON_VERSION,                  // 强制
  map: await resolveMapSnapshot(stored.map, input.mapSource), // 覆盖 / 换图
};
```

之后校验角色存在、跨表引用合法，再写库：`data` 整份落 JSONB，同时把 `name` / `description` 镜像回列。并发方面：请求里的 `updatedAt` 与库里不一致会返回 `40902`「草稿已被其他会话修改」。

---

## 8. 手写 JSON 的检查清单

按出现频率排：

1. **多写了字段** → `.strict()` 直接失败。`MapDraft` 里最常见的是 `characterSlots`、`style.linkageColors`、`name`。
2. **`cells` 写成了数组**，或键写成 `"0, 0"`（带空格）/ `"1;2"`。键必须匹配 `^\d+,\d+$`。
3. **坐标从 1 开始**。第一格是 `0`，`gridSize = 3` 的棋盘最大坐标是 `2`。
4. **颜色格式**：`red`、`#fff`、`rgb(0,0,0)` 都不行（`shadowColor` 是唯一例外）。
5. **物品缺 `w` / `h`**。哪怕只想放 1×1，也要显式写 `"w": 1, "h": 1`。
6. **`linkageColors` 少于 2 项**，或联动 `color` 用了调色板里没有的 key。
7. **`character` 联动指向名册外的角色**：`id` 写的是角色 id，但这位角色不在本谜题的任何一个槽位里。
8. **`asset` / `region` 联动指向画布上没有的东西**。schema 看不见这一层，要到保存时才报。
9. **名册长度与 `gridSize` 不一致**：不报错，但会补 `null` / 截断 —— 看起来「少了一个人」时先看这里。
10. **区域不连通 / 两个区域重叠**：重叠保存就 400（`40903`），不连通要到发布才拦（`42201`）。
11. 想改尺寸却在 `data` 里改了 `gridSize` —— 画布还有越界内容时保存会被 400 拒掉。改尺寸走 `PATCH …/grid-size`：它顺带删掉越界内容，返回 `{ gridSize, removed }`，`removed` 是四类计数 `background` / `item` / `regions` / `charactersReturnedToSlot`（最后一个是 v0.4 名册时代的遗留字段，今天恒为 0）。

---

## 9. 相关文档

| 文档 | 关于什么 |
|---|---|
| `docs/map-management-and-editor.md` §3.15 | 导入 / 导出在界面上的行为 |
| `docs/v0.7.1.md` §5.3 / §7 | 谜题自带画布副本、游戏只引用谜题行 |
| `docs/v0.7.5.md` §3 | 物品 `scale` / `offset` 的展示与占格之分 |
| `docs/v0.7.6.md` §9 / §10 | 形态表改名、`formId` → `variantId` |
| `docs/v0.8.6.md` §4 | 禁止符号可以上传一张图（`forbiddenSymbol`，v0.8.6）；主题的 `data.forbiddenSymbol` 是新建谜题的缺省 |
| `docs/v0.7.0.md` §4 | 区域样式三级化（`RegionStyleOverride`） |
| `docs/layer-priority.md` | 画布图层次序（与 JSON 无关，但读渲染代码时会用到） |
