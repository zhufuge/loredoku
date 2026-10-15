# 画布图层优先级规范

**文档类型**：画布渲染次序与图层命名的规范性定义（唯一权威）
**适用范围**：编辑器画布（`/editor/:projectId`）与作品预览页（`/works/:workId/view`）
**版本**：v0.3.9（图层命名规范化；次序自 v0.3.4 OPT-901 起持续修订）
**实现载体**：`packages/shared/src/constants.ts` 的 `MAP_LAYER_ORDER` / `MAP_LAYER_Z`

---

## 1. 图层命名表

每一层都有**中文名**、**英文名**与**代码常量名**三个标识，三者在文档、代码与界面文案中必须一致。
文中出现「上方 / 下方」时，**一律指视觉叠放次序**（上方 = 更靠近观察者 = 更大的 CSS `z-index`），
与文档排版方向无关。

| 层号 | 中文名 | 英文名 | 代码常量名 | 定义 |
|---|---|---|---|---|
| 1 | 鼠标光标框 | Mouse Cursor Box | `mouseCursorBox` | 跟随指针移动的方格提示框，标示指针当前所指方格 |
| 2 | 操作光标框 | Operation Cursor Box | `operationCursorBox` | 固定在「当前操作方格」上的提示框 |
| 3 | 区域标签 | Region Label | `regionLabel` | 区域名称文字（含字色与描边） |
| 4 | 物件图层 | Object Layer | `objectLayer` | **物件层**物品的图片 |
| 5 | 画布外框 | Canvas Frame | `canvasFrame` | 整张画布最外圈的边框线 |
| 6 | 网格分隔线 | Grid Separator | `gridSeparator` | 方格之间的内部分隔线 |
| 7 | 区域轮廓线 | Region Outline | `regionOutline` | 区域外轮廓描线 |
| 8 | 不可站立遮罩 | Non-standable Mask | `nonStandableMask` | 标示「该格物品不可站立」的半透明遮罩 |
| 9 | 区域高亮线 | Region Highlight | `regionHighlight` | 区域被悬停或联动激活时出现的内侧高亮线 |
| 10 | 方块高亮 | Cell Highlight | `cellHighlight` | 联动激活时覆盖**整格**（含背景图层）的不透明色块 |
| 11 | 背景高亮 | Background Highlight | `backgroundHighlight` | 联动激活时**仅替换背景图层**的色块 |
| 12 | 背景图层 | Background Layer | `backgroundLayer` | **背景层**物品的图片 |
| 13 | 画布底色 | Canvas Base | `canvasBase` | 画布底色（未被任何图层覆盖时的基础面） |

> **区域填充**（`regionFill`）为 v0.2.5 遗留图层，未纳入本表，固定置于 `backgroundLayer` 之上、
> `backgroundHighlight` 之下（`z-index = 22`）。新增图层必须登记进本表，不得使用表外 z-index。

---

## 2. 优先级次序（唯一权威）

由高到低：

| 层号 | 中文名 | 英文名 | z-index |
|---|---|---|---|
| 1 | 鼠标光标框 | Mouse Cursor Box | 46 |
| 2 | 操作光标框 | Operation Cursor Box | 45 |
| 3 | 区域标签 | Region Label | 42 |
| 4 | 物件图层 | Object Layer | 40 |
| 5 | 画布外框 | Canvas Frame | 39 |
| 6 | 网格分隔线 | Grid Separator | 38 |
| 7 | 区域轮廓线 | Region Outline | 36 |
| 8 | 不可站立遮罩 | Non-standable Mask | 35 |
| 9 | 区域高亮线 | Region Highlight | 32 |
| 10 | 方块高亮 | Cell Highlight | 30 |
| 11 | 背景高亮 | Background Highlight | 28 |
| 12 | 背景图层 | Background Layer | 20 |
| 13 | 画布底色 | Canvas Base | 10 |
| — | 区域填充（表外遗留） | Region Fill | 22 |

单行形式（便于对照代码）：

```
鼠标光标框 > 操作光标框 > 区域标签 > 物件图层 > 画布外框 > 网格分隔线 > 区域轮廓线
> 不可站立遮罩 > 区域高亮线 > 方块高亮 > 背景高亮 > 背景图层 > 画布底色
```

> 《方框要素定义与命名规范 v1.0》中的四个方格要素名称在本表中对应关系为：
> **Content**（物品图）→ 物件图层 / 背景图层；**Border**（相邻格共享的网格线）→ 网格分隔线；
> **Inner Line**（紧贴 Border 内侧的描边，用于鼠标光标框）→ 鼠标光标框内描边；
> **Outline**（位于 Border 外侧、不参与布局，用于操作光标框）→ 操作光标框外描边。

编辑器专属的拖拽 / 框选反馈（框选矩形、区域草稿单元格、未落位物品预览）挂在第 2 层**之下的**
临时层（`operationCursorBox − 1` / `− 2`），属于编辑器 affordance，不属于本规范的 13 层。

---

## 3. 各层行为定义

### 3.1 鼠标光标框（Mouse Cursor Box，层 1）

- 跟随指针实时移动；指针离开画布即消失；
- 由**内描边**构成，线宽与颜色取自地图基本信息
  （`style.mouseCursorBox.width / color`）；指针所指方格存在「不可站立物品」时改用「被阻挡颜色」
  （`blockedColor`）；
- 另叠加一圈半透明阴影环（`shadowColor`）覆盖网格分隔线，使框线在深色网格上仍然可辨；
- 为画布**最高层**：任何情况下都不得被其它图层遮挡。

### 3.2 操作光标框（Operation Cursor Box，层 2）

- **固定在「当前操作方格」**（最近一次点击选中的方格），不随指针移动；
- 点击另一格即移动到该格；点击画布外空白或按 `Esc` 即消失；
- 以 **Outline（外描边）** 形式绘制在网格分隔线**外侧**，不参与布局计算；
- 恒位于层 1 之下：二者落在同一格时，鼠标光标框的线在内、操作光标框的线在外，形成可分辨的双层框；
- 数值来源：`style.operationCursorBox.width / color / offset`。

### 3.3 区域标签（Region Label，层 3）

- 文字位于**物件图层之上**，任何物品图都不得遮挡区域标签；
- 位于**画布外框之上**，不被画布外框压住；
- 采用「描边 + 填充」绘制（描边在下、填充在上），保证在深浅背景上都可读；
- 区域被悬停或激活时，切换到「高亮字体颜色 / 高亮描边颜色」；
- 区域标签可接收指针事件（用于悬停与点击）；其余绘制层一律不接收指针事件。

### 3.4 物件图层（Object Layer，层 4）

- **物件层**物品的图片；
- 位于**网格分隔线之上**：分隔线不得切断物品图；
- 位于**画布外框之上**：画布外框不得遮挡物品图；
- 图片被裁剪在其占位矩形内部，并在占位矩形四周保留内边距（`objectPadding`）；
- 多格物品的图片按其**整体占位矩形**绘制，而非逐格绘制。

### 3.5 画布外框（Canvas Frame，层 5）

- 整张画布的外圈边框，线宽与颜色取自 `style.canvasFrame.width / color`；
- **绘制在画布矩形之外**（以半线宽向外偏移），因此与格内任何内容**几何上不重叠**；
- 位于**物件图层之下**：即使内容贴边，也不遮挡物品图；
- 位于**网格分隔线之上**：与内部分隔线交会处由画布外框占优，避免视觉上的「重叠加粗」；
- 与**网格分隔线**是两个不同的东西：外框只画最外一圈，网格分隔线只画格与格之间。

### 3.6 网格分隔线（Grid Separator，层 6）

- 方格之间的**内部分隔线**；相邻两格**共享同一条**线，因此 `n × n` 的画布共有 `n − 1` 条横线
  与 `n − 1` 条竖线，严禁每格绘制四条边；
- 位于**区域轮廓线之上**：区域轮廓线不得盖住网格，保证方格划分始终清晰；
- 不接收指针事件；
- 数值来源：`style.gridSeparator.width / color`。

### 3.7 区域轮廓线（Region Outline，层 7）

- 区域外轮廓的描线，线宽取**区域自身配置值**（由 `style.regionOutline.width` 初始化）；
- 位于**网格分隔线之下**、**不可站立遮罩之上**；
- 相邻区域交界处由两个区域各自绘制一条线，**不做合并、不做取舍**，交界处较粗为预期表现；
- 颜色由 `style.regionOutline.color` 统一决定（区域自身的 `color` 只用于区域填充）。

### 3.8 不可站立遮罩（Non-standable Mask，层 8）

- 当某格物件层物品的 `canStand = false` 时，对该格叠加半透明遮罩（`rgba(0,0,0,0.18)`）；
- 位于**区域轮廓线之下**、**区域高亮线之上**；
- 遮罩矩形内缩至网格分隔线内侧，不覆盖网格线；
- 物品图本身位于本层之上，因此物件层物品会在遮罩上方显示；由于物品图带有内边距（四周留白 2 ~
  12px），遮罩仍可在物品图四周的留白处被看到，提示作用保留；
- 物品被停用或删除时视为「可站立」，不再绘制遮罩；修改物品的 `canStand` 设置即时生效，
  **不会删除任何格子内容**。

### 3.9 区域高亮线（Region Highlight，层 9）

- 区域被悬停 / 联动激活时出现，绘制在**区域轮廓线内侧**并向内扩展，不遮住区域轮廓线；
- 位于**方块高亮之上**：整格色块不得盖住区域轮廓提示；
- 几何由纯函数 `buildRegionHighlightPaths` 生成：先追踪区域的**闭合轮廓环路**，再把每条边的支撑线
  沿法向向内偏移，最后以相邻偏移直线的**交点**重建顶点。因此高亮线是**连续闭合**的折线，
  直线段不断开、拐角处严丝合缝；
- 区域被激活期间**常亮**，激活结束时以 150ms 淡出；
- 数值来源：`style.regionHighlight.width / color`。

### 3.10 方块高亮（Cell Highlight，层 10）

- 联动激活时，对目标方格绘制**不透明**色块，覆盖**整格**（含背景图层）；
- 多格物品的方块高亮展开到其**全部占位格**；
- 位于**背景高亮之上**、**区域高亮线之下**；
- 颜色取联动配置所引用的**联动主题色**（`style.linkageColors` 中的 `key`）。

### 3.11 背景高亮（Background Highlight，层 11）

- 联动激活时，**仅替换背景图层**：只覆盖背景层色块范围，不掩盖物件层物品；
- 位于**背景图层之上**、**方块高亮之下**；
- 颜色取联动配置所引用的**联动主题色**。

### 3.12 背景图层（Background Layer，层 12）

- **背景层**物品的图片，铺满整格（不内缩），作为方格底色；
- 位于**画布底色之上**、**所有高亮层之下**。

### 3.13 画布底色（Canvas Base，层 13）

- 画布底色，是最底面的基础面；
- 任何图层都绘制在其之上；
- 不接收指针事件。

---

## 4. 叠加与遮挡规则

1. **同级不共存**：同一图层内的多个元素按创建顺序叠放，但本规范只约束**层与层**之间的次序。
2. **上层不透明即遮挡下层**：如方块高亮（层 10）为不透明色块，会完全遮住背景图层（层 12）与画布
   底色（层 13），但不影响物件图层（层 4）与区域标签（层 3）。
3. **两框可同格叠加**：层 1 与层 2 允许落在同一格，此时表现为「外圈操作光标框 + 内圈鼠标光标框」。
4. **画布外框不参与遮挡**：层 5 绘制在画布矩形之外，与格内内容无重叠，其层级只用于与
   「网格分隔线」在角落处的交会取舍。
5. **指针事件与层级解耦**：层 1 / 层 2 及编辑器 affordance 一律不接收指针事件；
   可交互的只有画布容器本身、物件图层（选择类工具下）、区域标签。
6. **指针样式与层级无关**：指针进入任一方格时统一为 `pointer`；画布外空白为 `grab`（可拖拽平移），
   拖拽中为 `grabbing`。
7. **画布缩放不改变层序**：缩放由容器 `transform: scale()` 实现，不得为任何图层引入新的
   `z-index` 或层叠上下文。带 `z-index` 的包装元素会形成**层叠上下文**，从而压平其子层的次序，
   因此同一次渲染中**禁止**用带 `z-index` 的 wrapper 包裹多个不同层级的子层。

---

## 5. 变更流程

调整本规范时需要同时满足：

1. 更新 `MAP_LAYER_ORDER`（顺序即优先级）与 `MAP_LAYER_Z`（数值）；
2. 更新本文档的 §1 命名表与 §2 次序表；
3. 更新图层顺序单元测试：`MAP_LAYER_ORDER` 项数、z-index 严格递减、以及各条相对关系断言；
4. 若新增图层，必须同步更新渲染代码中所有相关 `zIndex` 取值，禁止表外常量；
5. 若重命名图层，必须在 §6 追加一条命名迁移记录，并同步界面文案（「地图基本信息」抽屉的字段名）。

---

## 6. 命名迁移记录

### v0.3.9 SPEC-E01（中文名 / 英文名 / 代码常量名全部替换为规范名）

| 层号 | 旧代码常量名 | 新代码常量名 | 旧中文名 | 新中文名 | 新英文名 |
|---|---|---|---|---|---|
| 1 | `cellMouseCursor` | `mouseCursorBox` | 当前鼠标所在框 / 鼠标提示框 | 鼠标光标框 | Mouse Cursor Box |
| 2 | `cellOperationCursor` | `operationCursorBox` | 当前操作方格框 / 操作提示框 | 操作光标框 | Operation Cursor Box |
| 3 | `regionLabel` | `regionLabel` | 区域名称 | 区域标签 | Region Label |
| 4 | `object` | `objectLayer` | 物体 | 物件图层 | Object Layer |
| 5 | `canvasFrame` | `canvasFrame` | 地图最外边框 | 画布外框 | Canvas Frame |
| 6 | `gridBorder` | `gridSeparator` | 边框 border | 网格分隔线 | Grid Separator |
| 7 | `regionEdge` | `regionOutline` | 区域边界线 | 区域轮廓线 | Region Outline |
| 8 | `noStandShadow` | `nonStandableMask` | 不可站立物体阴影 | 不可站立遮罩 | Non-standable Mask |
| 9 | `regionHighlight` | `regionHighlight` | 区域高亮线 | 区域高亮线 | Region Highlight |
| 10 | `cellHighlight` | `cellHighlight` | 方块高亮 | 方块高亮 | Cell Highlight |
| 11 | `backgroundHighlight` | `backgroundHighlight` | 背景高亮 | 背景高亮 | Background Highlight |
| 12 | `background` | `backgroundLayer` | 背景 | 背景图层 | Background Layer |
| 13 | `emptyCell` | `canvasBase` | 空方格 | 画布底色 | Canvas Base |

地图样式字段同步改名：`style.border` → `style.gridSeparator`、`style.regionBorder` →
`style.regionOutline`、`style.mouseCursor` → `style.mouseCursorBox`、`style.operationCursor` →
`style.operationCursorBox`。v0.3.4 ~ v0.3.8 的历史文档保留当时的旧名，不再回改。

---

## 7. 验收清单

- [ ] `MAP_LAYER_ORDER` 共 13 项，顺序与 §2 完全一致；
- [ ] `MAP_LAYER_Z` 沿 `MAP_LAYER_ORDER` **严格递减**，且无重复值；
- [ ] 鼠标光标框 z-index > 操作光标框 z-index，二者同格可叠加且界限可辨；
- [ ] 区域标签不被物件图层、画布外框遮挡；
- [ ] 物件图层不被网格分隔线、画布外框、背景图层、区域轮廓线遮挡；
- [ ] 区域轮廓线不遮挡网格分隔线；
- [ ] 不可站立遮罩位于区域轮廓线之下、区域高亮线之上；
- [ ] 区域高亮线不遮挡区域轮廓线，且**连续闭合**（直线段不断开、拐角闭合）；
- [ ] 方块高亮覆盖整格且不遮蔽区域标签与物件图层；
- [ ] 背景高亮不遮蔽物件层物品；
- [ ] 缩放画布不改变任何层序，不出现双重缩放；
- [ ] 界面文案（基本信息抽屉、图层相关提示）使用 §1 的中文名。
