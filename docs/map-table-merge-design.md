# 设计：`map_versions` 合并进 `maps`（第三阶段 · 二，暂不执行）

> **状态**：**已实施**（2026-10-18，按 §10 七步走完，实施记录与两处设计外补充见 §18）。
> 需求原文：`map_versions`
> 合并进 `maps` 并删表；原字段 `id, name, description, cover_path, created_at,
> updated_at`；新增 `data`（= `draft_data`）、`version`（字符串）。
>
> **七点裁定全部确认**（2026-10-18 晚，逐条见 §11）：软删 `deleted_at timestamptz` /
> 版本号发布时可改（§4.2）/ 删 `status`+`current_version_no` / 迁移保留
> `map_versions.id` / name 快照从发布时起 / 不做恢复 UI / 删工作条目确认文案不补。
>
> **追加裁定**：版本条目**去掉「复制」**（已实施）；版本条目加**「以此为底稿新建」**
> ——进编辑器、保存时才生成草稿（已实施，§14）；`puzzles` 引用**改为版本行 id**
> （随合并执行，§9）。**不加归属列**（§2）：版本软删 / 草稿硬删，删除语义不相邻，
> 归属无消费者。
>
> **2026-10-18 19:57 复核裁定**（设计评审最后一轮，§11 第 8~12 条）：URL 的 `:id`
> 一律指 **`maps.id`**（§15 P0-1）；合并后**版本条目的「编辑信息」取消**；加
> CHECK `version='draft' OR data IS NOT NULL`；索引只建两个约束性的（§15 P1-4）；
> **不做**创建谜题对话框的快照提示、**不展示**版本「当时的名字」、多草稿不分组。
> API 路由改名 `/api/projects*` → `/api/maps*` 已定，**排在合并之后单独一步**（§16）。
>
> **2026-10-18 20:06 追加需求**（§17，**已实施**）：地图列表**分「草稿」「版本」两块**；
> **版本不做卡片展示**（恒为列表行）。两条都不依赖表结构，已先于合并落地。

## 0. 一句话

版本条目从「`map_versions` 的快照行」变成「`maps` 里 `version` 非 `'draft'` 的行」——
存储合并、行为不变；版本软删 / 草稿硬删取代归属列。

## 1. 现状（合并前）

```
maps          id, name, description, cover_path, created_at, updated_at,
              status('draft'|'published'), current_version_no,
              draft_data(jsonb, 可空), draft_updated_at, root_id
map_versions  id, project_id, version_no, data(jsonb), snapshot_created_at
```

| 子表.列 | 父表 | 删除规则 |
|---|---|---|
| `map_versions.project_id` | `maps.id` | CASCADE |
| `puzzles.map_project_id` | `maps.id` | **RESTRICT** |
| `games.project_id` | `maps.id` | CASCADE |
| `games.puzzle_id` | `puzzles.id` | SET NULL |

索引：`uq_map_versions_project_no` UNIQUE(project_id, version_no)、
`map_projects_root_id_index`(root_id)（PG 不随改名改索引名）。`items` / `characters`
**没有**到 `maps` 的外键——画布上的物品是 `data` 里的 JSON 引用，不是表行。

- **工作条目**：持活草稿 `draft_data`（`NULL` = 未初始化，v0.5.8 的一等状态）。
- **版本条目**：发布时 INSERT 的快照，`data` 冻结；**没有自己的 name / description /
  cover**，列表展示的是所属工作条目*当前*的名字。
- **血统**：`maps.root_id`，fork 出的草稿 `root_id` 继承 → 同一血统下可有多条草稿
  （§2 归属问题的根源）。`nextVersionNo = 血统 MAX(version_no)+1`，跨 fork 延续。

## 2. 删除语义：版本软删、草稿硬删

`map_versions.project_id` 原本表达「这个版本是谁发布的」，删表后有三个潜在消费者：
删工作条目的级联范围、fork 的版本列表、列表页的「条目 → 它的版本」。原设计为此提议
加 `owner_id`。用户裁定改为：

| 删除对象 | 规则 | 后果 |
|---|---|---|
| 版本行 | **软删除**：设 `deleted_at`，查询一律 `WHERE deleted_at IS NULL`，界面不展示、DB 保留 | 版本永不消失 → 没有任何操作需要「知道版本属于谁」 |
| 草稿行 | **硬删除**：真 `DELETE`，**不牵连版本** | 删地图不再级联删版本；版本行失去的只是一个编辑器入口，而入口可从版本行 fork 重建 |

软删顺带解决三件事：① 误删可救（数据都在，回收站 UI 随时能加，本版不做）；
② 版本号永不回收（软删行仍参与 `MAX`，否则删掉 v3 再发布会重新产出 v3，与「版本
不可变、谜题快照还对得上」冲突）；③ 谜题引用的版本「存在过」始终可查。

血统内可有多条 `version='draft'` 行，所以唯一约束只能建在版本行上：

```sql
CREATE UNIQUE INDEX uq_maps_root_version ON maps (root_id, version)
  WHERE version <> 'draft' AND deleted_at IS NULL;
```

即「号不可复用（软删行仍占 MAX），但行可忽略（不占唯一位）」。

## 3. 目标表结构

```
maps
  id               bigserial PK
  root_id          bigint  NOT NULL            -- 血统根（不变）
  name             varchar NOT NULL
  description      text
  cover_path       text
  data             jsonb   NULL                -- draft_data 改名；草稿行可空，版本行非空
  version          text    NOT NULL DEFAULT 'draft'   -- 'draft' | '1' | '2' | …
  deleted_at       timestamptz NULL            -- 软删标记，只有版本行会被设置
  draft_updated_at timestamptz NULL            -- 【v0.5.8 第八阶段已删】草稿乐观锁时间戳
  created_at / updated_at timestamptz NOT NULL

  CHECK (version = 'draft' OR version ~ '^\d+$')
  CHECK (version = 'draft' OR data IS NOT NULL)   -- 版本行必须有快照（P2-1）
  UNIQUE INDEX (root_id, version) WHERE version <> 'draft' AND deleted_at IS NULL
  INDEX (root_id)                               -- 已有
```

相对用户清单的出入：`data` 采纳并**列改名**（合并后每行都有 data，`draft_` 前缀失去
意义）；`version` 采纳字符串（草稿与版本同类型，免 NULL）；**删** `status`（`version`
已表达同一信息）与 `current_version_no`（改推导：`MAX(CAST(version AS int)) WHERE
root_id=? AND version<>'draft'`，含软删行；API 字段名 `currentVersionNo` 保留，前端零
改动）；保留 `root_id`（血统 / 续号 / 版本历史范围）；**不加** `owner_id`。

`draft_updated_at`（草稿乐观锁 revision）当时一并保留，**其后在 v0.5.8 第八阶段整列删除**：
用户定下「先不做锁」，保存改成后写覆盖，修订号失去消费者（详见 v0.5.8 §15.5）。

## 4. `version` 值域与自定义版本号

### 4.1 值域：`'draft'` / `'1'..'n'`

- 草稿用 `'draft'` 而非空串（空串在 SQL 里和 NULL 一样容易看漏，`'draft'` 自描述）。
- 版本用纯数字字符串，CHECK `version ~ '^\d+$'` 保底；不存 `'v1'` 前缀（前端展示时拼）。
- **排序必须 `ORDER BY CAST(version AS INTEGER)`**（字典序 `'10' < '2'`）。两个排序点：
  版本历史列表、`nextVersionNo` 的 `MAX`（**MAX 必须含软删行**）。
- 值域**不扩大到任意字符串**：`'beta'` / `'v2'` 会让 `CAST` 报错，排序、续号、谜题引用
  三处同时炸。

### 4.2 方案二：发布时默认提供、用户可修改、记录所填值

| 环节 | 行为 |
|---|---|
| 打开弹窗 | 预填血统内 `MAX(CAST(version AS int)) + 1`（含软删行），与 `nextVersionNo` 同源 |
| 用户修改 | 任意**正整数**（不必连续，可填空洞号） |
| 发布 | 以输入值为准 INSERT；没改就是默认值，行为与全自动版一致 |
| 冲突 | 血统内已有该号（活行或软删行）→ 400「版本号 v{n} 已存在于该地图血统中，请换一个」 |

这是对 v0.5.8 §12「弹窗只留二次确认文本」的**修订而非推翻**（确认文本保留，旁边多一个
带默认值的输入框）。配套：`publishSchema` 从 `z.object({}).strict()` 改为允许可选
`version`（`.strict()` 保留，仍拒绝 `notes`）；`versionsApi.publish(id, version?)`、
`useMutation<PublishResult, unknown, number | undefined>`；前端失焦即用已在手的
`versions` 查重、服务端兜底；确认文本预告的版本号改成输入框当前值。

### 4.3 名称可重复与版本号唯一是两个维度

`maps.name` **DB 层无唯一约束**，只有应用层 `existsByName`——所以准确说法是「工作条目
之间不可重名，版本条目原本没有名字」。唯一的约束是 `(root_id, version)`，**不含
`name`**：同血统两个版本可以同名（各自存快照），但版本号不能重（`puzzles` 靠「血统 +
版本号」定位版本）。自定义版本号只受后者约束。

## 5. 合并后的行为

| 行为 | 现状 | 合并后 |
|---|---|---|
| 列表并集 | 两表查询 | 一查询：血统活行，`kind = version='draft' ? 'draft' : 'version'` |
| 读草稿 | `maps.draft_data` | `data WHERE version='draft'`（`NULL` = 未初始化，语义不变） |
| 发布 | INSERT `map_versions` | INSERT 新 `maps` 行：`data` = 草稿深拷贝、`version` = 用户填的号、`name/description/cover` = 工作条目当时值、`root_id` 继承；工作条目行不动 |
| 删版本 | DELETE 行 | `UPDATE … SET deleted_at = now`（界面不展示，号仍占用） |
| 删工作条目 | CASCADE 删版本 + 删行 | 只硬删草稿行，版本行全部保留；**确认文案不改**（§11 第 7 条） |
| fork | INSERT maps + 拷版本 data | 同左；源版本被软删也能 fork（数据还在） |
| 未初始化发布 | 400 | 400（判 `data IS NULL`，不变） |
| 谜题选版本 | `GET /api/projects/versions` | 同 URL，内部查 `version<>'draft' AND deleted_at IS NULL` |

**软删对用户完全不可见**：点删除即界面消失，感知同硬删；DB 保留只为号不回收 + 误删可
救 + 引用可查。四个查询面必须带 `deleted_at IS NULL`，漏一个的症状是「删掉的版本又冒
出来」：`listMapEntries`（/maps）、`listPublishedVersions`（创建谜题选版本）、
`versionRepository` 列表（版本历史面板）、fork 源。版本详情对软删行直接 404（「不可见」
包含直达入口）。唯二不过滤：`MAX(version)` 与 down 迁移。

**附带收益**：版本条目从此有自己的 name / description / cover 快照。**版本条目的「编辑
信息」动作取消**（快照不可变、草稿行可能已被硬删），v0.5.8 §11.6 末的已知不一致至此消失。
版本历史面板**不展示**「当时的名字」（用户裁定 2026-10-18：快照名只用于数据完整性，不给
用户看两套名字）。

### 5.1 服务端护栏：版本行也是合法 `maps` 行

合并后版本行 id 就是合法 maps id，全部写入口都能直达——合并前它在另一张表，天然免疫。

| 操作 | 对版本行 |
|---|---|
| `GET /api/projects/:id` / canvas GET | 允许（详情 / 只读渲染照常） |
| `PATCH` 改名描述 / canvas PUT / `grid-size` / 封面上传删除 | 400「已发布的版本不可修改」 |
| `DELETE` | 分流：`'draft'` → 硬删；数字 → 软删 |
| `POST …/publish` | 只接受草稿行 id，否则 400 |
| `POST …/versions/:versionNo/fork` | 读取**不过滤** `deleted_at`（过滤管可见性，不管直达读取） |
| `duplicate` | 仅草稿行可达（版本条目已无复制动作），版本行 id → 400 |

### 5.2 查重：先限定草稿行，后整体放开（v0.5.8 第六阶段）

设计时 `existsByName`（create / update / `uniqueCopyName`）查全表。合并后版本行进 `maps`，
而版本名是发布时的快照，**同名是常态**（不改名连发十个都同名）。不限定 `version='draft'`
的后果：新建图撞上某个历史版本名 → 「地图名称已存在」；fork 草稿沿用 owner 名 → 挡住
之后所有创建 / 改名。因此实施时先按「所有查重加 `AND version = 'draft'`」落地。

**其后的裁定（第六阶段）**：用户要求彻底放开——地图可以重名。于是 create / update 的
查重**整段删除**，`existsByName` 只剩 `uniqueCopyName` / `uniqueName` 在用（复制与 fork
的自动取名避重，「副本」「副本 2」），并保留 `version='draft'` 条件：拿版本快照名占位
会让副本序列莫名跳号。DB 侧本来就没有 `name` 唯一约束（`maps` 上只有 pkey、
`root_id` 索引与 `uq_maps_root_version`），故无需迁移。

## 6. 数据迁移

up（新文件 `…_v058_merge_map_versions.ts`，单事务）：

1. `ALTER TABLE maps RENAME COLUMN draft_data TO data`；加列 `version text NOT NULL
   DEFAULT 'draft'`、`deleted_at timestamptz NULL`。
2. 搬运版本行（**保留 id**，先跑冲突预检 `SELECT count(*) FROM maps m JOIN
   map_versions v ON m.id = v.id`，非 0 让迁移失败——实测 0 撞）：
   ```sql
   INSERT INTO maps (id, root_id, name, description, cover_path, data,
                     version, deleted_at, draft_updated_at, created_at, updated_at)
   SELECT v.id, p.root_id, p.name, p.description, p.cover_path, v.data,
          v.version_no::text, NULL,
          v.snapshot_created_at, v.snapshot_created_at, v.snapshot_created_at
   FROM map_versions v JOIN maps p ON p.id = v.project_id;
   ```
3. `setval` 把 `map_projects_id_seq` 推到 `max(maps.id, map_versions.id)` 之上，否则后续
   插入撞 PK。
4. 建约束：部分唯一索引 `(root_id, version) WHERE version<>'draft' AND deleted_at IS NULL`、
   两个 CHECK（`version` 值域 + `version='draft' OR data IS NOT NULL`）、列表排序索引
   `(deleted_at, created_at)`；`root_id` 索引已有。其余两个索引等真实行数（§15 P1-4）。
5. 删列 `status` / `current_version_no`；`DROP TABLE map_versions`（索引随之消失，
   `map_versions_id_seq` 需顺手 `DROP SEQUENCE IF EXISTS`——PG 不随 DROP TABLE 清序列）。

down（**结构可逆、归属近似**）：重建 `map_versions` → 从 `maps WHERE version<>'draft'`
回填，`project_id` 只能填该血统下**任一**活草稿行 id（通常唯一，fork 过就取最早创建的）
→ 删 `version`/`deleted_at`、`data` 改名回 `draft_data`、`status`/`current_version_no`
加回并推导回填 → `setval` 回调。

**迁移前后 API 响应不变**（字段名保留、值推导），不需要前后端同时发版。

## 7. 代码影响面

| 层 | 文件 | 改动 |
|---|---|---|
| server repo | `mapRepository.ts` | `draft_data` → `data`；`parseDraft` 列名 |
| server repo | `projectRepository.ts` | 删 `status`/`current_version_no` 读写；列表改单表；删工作条目不再级联版本 |
| server repo | `versionRepository.ts` | **整个改写**：`db('map_versions')` → `db('maps')`；`version_no` → `version`（string↔number）；默认查询加 `deleted_at IS NULL`；`summarizeData` 读 name/desc/cover 快照；删除改 UPDATE |
| shared schema | `schemas/mapDraft.ts` | `publishSchema` 允许可选 `version`（§4.2） |
| server service | `projectService.ts` | `existsByName` 三个调用点加 `version='draft'`；`duplicateProject` 只接受草稿行 id |
| server service | `versionService.ts` | 发布 = INSERT maps 行；`nextVersionNo` 含软删行；`publishProject(id, versionNo?)` + 血统内唯一校验 400 |
| server controller | `versionController.ts` | 出参 `Number(row.version)`；透传 `body.version` |
| shared types | `types/db.ts` / `types/domain.ts` | `ProjectRow` 换列；`MapVersionRow` 删除（并入 `MapProjectRow`）；`MapVersionSummary` 加 name/desc/coverPath（只增不删） |
| web | `useVersions.ts` / `useEditorPublish.ts` / `EditorPage.tsx` | 发布弹窗加版本号输入框（默认 `nextVersionNo`、失焦查重）；`publish(id, version?)`；其余零改动 |
| web | `VersionHistoryDialog.tsx` / 列表 / 卡片 | 版本条目的「编辑信息」隐藏（菜单项与列表行图标按 `kind` 条件渲染）；版本历史**不**展示快照名 |
| web | `MapVersionViewPage.tsx` | `:id` 按 `maps.id` 解析（§15 P0-1），`?v=` 退化为血统选择参数 |
| web | `MapsPage.tsx` | 列表分「草稿」「版本」两块（§17）；版本块恒为列表行，视图切换只管草稿块；删三态 `kind` 筛选与「按地图归组」开关 |
| 路由 | `router/projects.ts` | 合并本身**不改 URL**；`/api/projects*` → `/api/maps*` 已定但排在合并之后单独一步（§16），避免与结构迁移混在一批 |
| 测试 | `api.test.ts` / `puzzleMigration.test.ts` | 表名列名适配；新增自定义版本号 / 重号 400 / 软删占号三例 |
| 测试 | `EditorPage.publish.test.ts` / `schemas.test.ts` | 重锚（`publish(id, version?)` / 输入框 / strict 断言改版） |
| 测试 | `MapVersionViewPage` 相关 | `:id` = maps.id 与 `?v=` 的四种组合（版本行/草稿行 × 有/无 `?v=`） |

## 8. 收益与代价

**收益**：一张表讲完地图条目，两个 repository 的重复读写收敛；版本条目获得真正的
name/desc/cover 快照，「编辑信息跳工作条目」的不一致消失；删除语义更安全（版本永不丢、
号不回收、谜题引用始终有据）；`root_id` 一列管住血统。

**代价**：`maps` 行数 = 地图数 + 版本数（含软删），列表多两层过滤；字符串 `version` 的
cast 与 `Number()` 约 5 个转换点；每个版本查询都要记得 `deleted_at IS NULL`（漏一处就
「删掉的版本又冒出来」）；一次结构迁移（down 归属近似、`status` 推导值有损）。

## 9. 与谜题侧的边界

**裁定：改 `puzzles` 字段，引用正确 id。** 合并前 `puzzles.map_project_id` /
`games.project_id` 指向**工作条目**（版本在另一张表，FK 只能指向容器），这正是「删工作
条目被 RESTRICT 拦下」的根因。合并后版本行自己就是 maps 行：

| 列 | 合并前 | 合并后 |
|---|---|---|
| `puzzles.map_project_id` | 工作条目 id | **版本行 id** |
| `puzzles.map_version_no` | 版本号 | 不动（= `CAST(version AS int)`） |
| `games.project_id` | 工作条目 id | 版本行 id |
| `games.version_no` | 版本号 | 不动 |

- **删草稿行不再被 RESTRICT 拦**（谜题引用的是版本行），遗留 3 就此关闭——不用改 FK
  规则，是引用对象变正确了。
- 删被引用的版本行本会被 FK 拦，但版本是软删，不触发 FK。
- `listPublishedVersions` 返回的就是版本行，其 id 直接可存，创建谜题对话框零改动。
- down 迁移把 `map_project_id` 回填成原工作条目 id（近似）。

`games.grid_size` / `puzzles.grid_size` 仍是 v0.5.8 §10 第 1 条的已知不一致——用户裁定
**后面单独改、本次保留**，合并迁移不碰谜题与游戏的尺寸列。

## 10. 实施步骤（✅ 全部完成）

1. ✅ 迁移文件 + `db:migrate` / `db:rollback` 往返实测（重点验 down 的 `project_id` 回填与
   部分唯一索引）。
2. ✅ server repository / service / controller 改写，typecheck；**§5.1 护栏**、**§5.2 查重**、
   自定义版本号与唯一校验。
3. ✅ shared 类型与 zod（`publishSchema` 加 `version`）。
4. ✅ server 测试逐文件跑 + `api.test.ts` 适配；**新增软删可见性测试**（四个查询面 + 详情
   404 + 仍占号）与**自定义版本号测试**（空洞号成功 / 活行重号 400 / 软删行重号 400）。
5. ✅ web：发布弹窗输入框 + 三个 hook / api 改版；**版本条目的「编辑信息」隐藏**（`kind`
   条件渲染）；`MapVersionViewPage` 的 `:id` 改按 `maps.id` 解析。全量跑（点名两个测试
   文件重锚，其余零改动也要跑，证明没踩空）。
6. ✅ 同步 `docs/map-management-and-editor.md` 与 `docs/v0.5.8.md`（§12 按 §4.2 修订、§13
   指针改「已确认」）；AGENTS.md 不改。
7. ✅ 冒烟：建图 → 初始化 → 发 v1 → 发 v2 → fork → 填空洞号 7 → 重发 7 得 400 → 软删 v2
   （列表与可选列表都不见、详情 404、再发布默认给 3）→ 删工作条目（v1/v2/v7 仍在）→
   未初始化发布 400。

## 11. 裁定点状态（全部确认）

| # | 裁定点 | 结论 |
|---|---|---|
| 1 | 软删标记 | ✅ `deleted_at timestamptz` |
| 2 | `version` 值域与自定义 | ✅ 值域不变；发布默认 `MAX+1`、可改、记录所填值（§4.2）；名称可重复与版本号唯一互不影响（§4.3） |
| 3 | 删 `status` / `current_version_no` | ✅ 字段名在 API 保留、值改推导 |
| 4 | 保留 `map_versions.id` | ✅ down 结构可逆 |
| 5 | 版本行 name 快照 | ✅ 从发布时起记录（历史版本只拷当前名） |
| 6 | 恢复 UI | ✅ 不做，只加列 |
| 7 | 删工作条目确认文案 | ✅ **不补**（软删对用户不可见；过滤面见 §5） |
| 8 | `/maps/:id/views` 的 `:id` 语义（P0-1） | ✅ 一律指 **`maps.id`**：合并后版本行与草稿行都是 maps 行，URL 不再借「拥有它的工作条目」这一层（§15 P0-1） |
| 9 | 版本条目的「编辑信息」 | ✅ **取消**（合并后版本行虽有快照列，但不可改；菜单项与列表行图标按 `kind` 隐藏） |
| 10 | `data` 空值约束 | ✅ **加** CHECK `version='draft' OR data IS NOT NULL`（版本行必须有快照） |
| 11 | 索引范围 | ✅ 只建两个约束性的（唯一索引 + `(deleted_at, created_at)`），另两个等真实行数（§15 P1-4） |
| 12 | 三项「不做」 | ✅ 创建谜题对话框**不加**快照小字；版本历史**不展示**「当时的名字」；多草稿**不**按 `root_id` 分组 |

## 12. 场景走查（用户序列）

创建 A → 初始化 / 保存 / 发布 v1 → 续改 A → 复制 A 得 B → B 发布 v1 → 基于 Bv1 改存
→ 该草稿发布 → 删 B。记号 `R{id}({version}, root={root})`。

```
血统① root=1                        血统③ root=3（B，复制 = 独立血统）
R1(draft)  ← 初始化 → 保存
R2(v1, data=R1 快照, name=A 当时值)    R3(draft, name="A 副本")
R1 再改；R2 冻结 ✓                     R4(v1, data=R3 快照)
                                       R5(draft, data=R4 快照)  ← fork
                                       R6(v2)  ← 默认号 MAX+1=2，可改
删 B(R3)：硬删 R3，R4/R5/R6 不动 ✓
```

结论：发布（op2c）与再改（op3）与现状一致；复制产生独立血统、号从 1 重计 ✓；双草稿同时
打开发布框都会拿默认号，后发者 400 手改（单用户，报错明确即可接受）；删 B 后血统③残留
版本行 + 来路明确的 fork 草稿，是「版本不牵连」的必然视觉后果。走查逼出三条设计修订：
**§5.1 写操作护栏**、**§5.2 查重划界**、**版本条目复制移除**（原行为是点哪条都复制工作
条目当前草稿，既 bug 又无用）；以及 fork 入口缺口（§14 闭环）。

## 13. 遗留

| # | 事项 | 状态 |
|---|---|---|
| 1 | 版本条目「以此为底稿新建」 | ✅ 已实施（§14） |
| 2 | fork 草稿命名带来源 | ✅ 已实施（§14.2） |
| 3 | 删工作条目被 RESTRICT 拦 | ✅ 谜题引用改版本行 id（§9），随合并执行 |
| 4 | 版本条目去掉「复制」 | ✅ 已实现（`entry.kind !== 'version'` 条件渲染；`duplicateProject` 服务端保留给草稿行） |

## 14. 「以此为底稿新建」：fork 直达（已实施）

版本条目可进编辑页，**点保存时才生成草稿**。原因：只读预览留住了眼睛，但「基于旧版本
继续改」的路断了——fork 唯一入口在编辑器内的版本历史面板，得先进工作条目编辑器，而工作
条目可能已被删。

```
版本条目主点击 → /maps/{id}/edit?v={n}
  → useVersionDetail 拉快照，editor.init 本地装载（不写库）
  → 横幅「基于 v{n} · 保存后将生成新草稿（不会改动原版本）」→ 用户改画布
  → 点保存 → POST …/versions/:v/fork body={data: editor.toDraft()}
             → INSERT 新 maps 行 → markSaved → replace 到 /maps/{新id}/edit
  → 不保存离开 → 零写库
```

三个关键设计：① fork 延迟到保存（误点版本条目不产生草稿，同 v0.5.8 §4.1 的原则）；
② fork 带编辑器当前画布（不传 `data` 的老路径——版本历史面板「编辑此版本」——仍用快照）；
③ replace 换 URL（此后保存 / 发布 / 改尺寸必须落在新行 id 上；`publishMutation` 创建时
绑旧 id，闭包全过期，所以 fork 态点发布 = 先落盘 + toast「请再次点击发布」）。

**踩坑**：replace 前必须等 React 把 `dirty=false` flush 掉——`useBlocker` 读渲染闭包里的
dirty，同一 continuation 里 navigate 会拿旧值 true 把自己拦下。实现用 `setTimeout(…, 0)`。

### 14.2 命名带来源

新行叫「{owner.name} (自 v{n})」，`uniqueName` 兜底（base 不撞名即用，撞了走「副本 /
副本 2」）。血统内可同时存在多条草稿，不带来源列表里分不清谁是谁。

### 14.3 合并后的对应关系

这条路一行不用改：`forkFromVersion` 从「INSERT maps 行 + 读 `map_versions`」变成
「INSERT maps 行 + 读同表版本行」，路径与前端全不变（API 前缀改名另算，§16）。唯一差别是 fork 出的行与版本
行**真的同表并列**，§5.1 护栏此时才真正受力。

## 15. 单表设计的潜在问题（用户要求再分析）

P0 = 不处理会出错或数据不一致；P1 = 体验损点或实现坑；P2 = 记备。

**P0-1 URL 的 id 语义整体迁移**（用户裁定：`:id` **一律指 `maps.id`**）。「URL 形状不
变」只对了一半——id 指的东西变了：`/maps/:id/edit` 的 `:id` 从「工作条目 id」变成「草稿
行 id」（血统内可有多条）；`/maps/:id/views` 的 `:id` 也不再借「拥有它的工作条目」这一层，
直接是 **`maps.id`**。解析规则：

| 情形 | 行为 |
|---|---|
| `:id` 命中版本行，无 `?v=` | 直接展示该行（合并后版本行自带 `data`） |
| `:id` 命中版本行，`?v=` 另有值 | 以 `?v=` 为准，在同血统内另取（参数留着兼容旧链接） |
| `:id` 命中草稿行，无 `?v=` | 取该血统 `MAX(version)`（裸链接仍永远有效） |
| `:id` 不存在 / 软删 | 软删行仍按 `maps.id` 可解析（过滤只管列表可见性） |

好处：预览链接不再依赖「草稿行还在」这个偶然条件——旧的 `?v=` 链接在草稿被硬删后仍能
解析到版本。编辑器侧则是从稳定入口变一次性入口（草稿被删即失效），浏览器前进后退会撞
EditorErrorState——可接受（单用户工具，链接不外发），fork 态已用 `replace` 示范正确做法。

**P0-2 `Number('draft')` = NaN。** 排序、`nextVersionNo`、出参 `versionNo`、谜题引用约
5 处都要 cast，每处都是 NaN 入口：`CAST(version AS INTEGER)` 对 `'draft'` 直接**抛错**
→ 所有 version 相关 SQL 必须带 `WHERE version <> 'draft'` 前置条件，不能只靠 `ORDER BY`；
出参对草稿行必须**短路成 `null`**，不能 `Number()` 后再判 `isNaN`（NaN 会被
`z.coerce.number()` 拒掉，但错误信息是「expected number」而非「这是草稿行」，排查成本
高）。对策：转换收敛到 `versionToNo(row)` 与 `nextVersionNo(lineage)` 两个函数，禁止散点
cast；`api.test.ts` 加一条「草稿行出参 `versionNo === null`」。

**P0-3 谜题引用改版的两个边界。** 旧数据的（工作条目 id, version_no）→ 版本行 id
**100% 可译**：版本从不硬删，且合并前删工作条目会 CASCADE 删版本、而谜题 RESTRICT 挡着
——被引用的版本必然还在。down 反向翻译需从 `data` 反推，不可逆部分见 §6。另：可选地图
列表返回版本行后展示的是**发布时的名字快照**，用户改名后新旧谜题看到的名字会不同——这是
快照语义的正确表现——用户裁定**不加**任何提示（不解释、不加小字），列表按快照展示即可。

**P1-1 血统内多草稿的列表歧义**（用户裁定不处理）：命名带来源解决了「是谁 fork 的」，
列表按 `updated_at` 排序时两条草稿的位置仍会随保存跳动。按 `root_id` 分组能根治，但要
重做列表组织方式——不做，记备。

**P1-2 `draft_updated_at` 对版本行是死列**：版本行不可写，恒为插入时的值。留着不碍事
（PUT 对版本行 400，读不到），但**不要**用它给版本行算「更新于」——展示用 `created_at`。

**P1-3 软删行的 data 占用**：连 JSON（可能几十 KB）一起留着。单用户量级无意义，真要
几百个版本再考虑冷存。记备。

**P1-4 索引清单**（已裁定：只建前两个）：约束性的两个先建——`UNIQUE (root_id, version) WHERE version<>'draft'
AND deleted_at IS NULL`、`(deleted_at, created_at)`（列表默认排序）；可观察后再加的
两个——`(root_id, version) WHERE deleted_at IS NULL`（版本历史 + MAX）、
`(name) WHERE version='draft' AND deleted_at IS NULL`（查重）。`root_id` 旧索引
（`map_projects_root_id_index`）继续复用于血缘查询。

**P1-5 `publishedAt` 的来源**：合并后从版本行 `created_at` 派生（发布时间 = 行创建时间），
`updated_at` 对版本行同样恒不变。现有 `entry.publishedAt ?? entry.updatedAt` 写法天然正确，
零改动。

**P2-1 同列装两种 data**：`parseDraft` 的「不用 `emptyDraft()` 兜底」原则继续成立——
未初始化草稿是 `NULL`，版本行永远非 NULL，NULL 本身就是信号；**已裁定加上** CHECK
`version = 'draft' OR data IS NOT NULL`（§3），让这条语义由 DB 兜住。

**P2-2 fork 与发布并发争号**：单用户工具，双草稿同时打开发布框会都拿到默认 MAX+1，后发
者 400 手改。不加分布式锁。

**P2-3 恢复 UI**：`deleted_at IS NULL` 取反就是一个回收站页，数据不留遗憾，当前不做。

## 16. API 路由改名 `/api/projects*` → `/api/maps*`（已定，排在合并之后）

表早就叫 `maps`、卡片与页面也都叫「地图」，只有 API 还叫 `projects`——这是 v0.5.8 §10
第 3 条留下的已知不一致。**用户裁定：改。** 但**不与合并同批**：结构迁移本身已经够大，
把「表合并 + URL 全量改名」压进一次改动，出问题时分不清是哪边引起的。

范围（单批）：

- server：`router/projects.ts` → `router/maps.ts`，`/api/projects` → `/api/maps`
  （含 `/versions`、`/duplicate`、`/map`、`/cover`、`/grid-size`、`/import` 等全部子路径）。
  **不做兼容别名、不做重定向**（同 v0.5.4 `/games`→`/play`、v0.5.8 注销 `/editor` 的先例：
  本地工具，没有外部调用方）。
- web：`api/maps.ts` / `api/versions.ts` 里的路径常量、`useMap` / `useVersions` 等 hook
  的调用点。
- 测试：`api.test.ts` 全部 `api.get/post('/api/projects…')` 前缀、`staticSite.test.ts`
  若涉及；web 侧如有路径断言一并改。
- 文档：`docs/map-management-and-editor.md` 的接口表、`README.md`、`AGENTS.md` 里的命令
  示例（**只改命令与端点，不写需求规范**）。

`/api/games*` 保持不动（表名 `games` 与 URL 本来就一致）；`puzzles` / `items` /
`characters` 同理。

## 17. 列表组织：草稿与版本分两块，版本不做卡片（已实施）

用户 2026-10-18 20:06 追加两条：

1. **区分草稿和版本两块**
2. **版本不需要卡片展示**

**现状**（v0.5.8 已实现）：列表是单一并集，靠工具栏「三态 `kind` 筛选（全部 / 草稿 /
版本）」＋「按地图归组」开关在同屏切换；网格视图下版本条目也渲染成 `ProjectGridCard`，
只是徽标显示 `v{n}`。

**目标形态**

- 页面正文按 `kind` 分两块，标题「草稿」「版本」，各自独立排序与空态：
  - **草稿块**：`kind === 'draft'`，沿用后端序（`updated_at` 倒序）。**网格 / 列表视图
    切换只作用于这一块**。
  - **版本块**：`kind === 'version'`，**恒为列表行**（`ProjectListRow`），**不生成卡片**；
    ~~排序 `rootId asc, versionNo desc`（即现有「按地图归组」的顺序，同血统相邻、新号在上）~~
    —— v0.5.8 第九阶段改：**默认按时间倒序**（最新发布在上），并跟随顶部排序控件，
    「按地图归组」那层便利随之取消。
- **空块整块隐藏**（标题与容器都不渲染）；两块都空才出空状态文案（现有 `kindFilter`
  三分支合并成一句 + 新建按钮）。
- **删除「三态 `kind` 筛选」与「按地图归组」两个控件**：分块天然实现「只看草稿 / 只看
  版本」，归组被版本块的排序吸收。工具栏只剩关键词 / 排序 / 视图切换。
- **`localStorage['loredoku.maps.view']` 语义收窄**为「草稿块的视图」，版本块不受影响。
- ~~**徽标不动**：版本块内仍显示 `v{n}`（同块内认版本号），草稿块仍显示「草稿」~~
  —— v0.5.8 第五阶段改：**草稿块整格去掉**（卡片无徽标、列表无版本列），`v{n}` 只留版本块。

**分页口径（v0.5.8 第四阶段已改，原记「不做」被用户否掉）**：原方案是并集分页 —— 两块共享
同一页，前端只对当前页分组，副作用是版本密集时某页可能只出现版本块。用户 2026-10-18 21:13
直接否掉：「分页不要合在一起用，分成 2 部分」。

改成同端点带 `kind` 发两个请求：

- `GET /api/projects?kind=draft|version`：先按 `kind` 过滤再算 `total`，不传仍是并集口径
  （`listProjectsQuerySchema` 里新增可选枚举）。
- ~~**`kind='version'` 忽略 `sort` / `order`**，固定 `rootId` 升序 + 版本号降序~~
  —— v0.5.8 第九阶段改：版本块与草稿块一样跟随 `sort` / `order`（默认 `updatedAt` 倒序）。
  **排序仍必须在服务端**这一点没变：客户端只能重排当前页，跨页会乱。
- 前端两个页号 `draftPage` / `versionPage`，每块一条翻页条；块标题的数字是**总数**，块的
  出现与否也看 `total > 0`（原来用当前页条数，翻到越界页会整块消失）；单页时整条隐藏。

**落点**

- `shared/schemas/project.ts`：`listMapEntriesKindSchema` + `listProjectsQuerySchema.kind`。
- `server/repository/projectRepository.ts`：`ListProjectsParams.kind`；先按 kind 过滤，版本块
  走固定比较器。
- `web/pages/MapsPage.tsx`：两个 `useMaps`、两个页号、`renderPager()` 各块一条；删掉页脚的
  共用翻页条与 `params` 里那个 `page`。
- 测试：`server/test/api.test.ts` 新增 2 例（kind 过滤与 total / 跨页顺序）；`web` 的
  `MapsPage.entries.test.ts` 新增分页断言、版本排序断言移交服务端。

**实施记录**：已按本节形态落地（`pages/MapsPage.tsx` + `MapsPage.entries.test.ts` 重锚）。
`MapEntrySummary.kind` 未改动。

**与合并的关系**：两条**都不依赖表结构**——合并只是把 `kind` 的来源从「两表并集」换成
`version = 'draft'` 的判断，分组条件 `kind === 'draft'` 不变。所以 §10 七步**不含本节**。
（第四阶段的分页改动动了 `shared` schema 与 `projectRepository`，但仍与表结构无关。）

## 18. 实施记录与两处设计外补充（2026-10-18）

按 §10 七步全部落地。**迁移往返实测**：up → down → up 三轮，`maps` / `map_versions` /
`puzzles` / `games` 逐表逐字段比对，数据 100% 还原（唯一有损项是 down 里
`status` / `current_version_no` 的推导值，§6 已声明为近似 —— 且改成按
`map_versions.project_id` 逐行推导后，实测 0 差异）。

### 18.1 补充一：版本相关端点的 `:id` 用**血统解析**

设计 §15 P0-1 只规定了 `/maps/:id/views` 的解析规则，没管 `/api/projects/:id/versions*`。
实现时发现一个直接后果：列表里版本条目的 `projectId` 现在是**版本行自己的 id**，而
`/fork` `/delete` `/detail` 都拿它拼 URL —— 如果端点仍按「这一行拥有哪些版本」查，全部失效。

做法：`resolveRootId(id)` 先取该行的 `root_id`，再在血统内按版本号定位。于是：

- 传**工作条目 id**（旧链接、版本历史面板）能用；
- 传**版本行 id**（列表里的版本条目）也能用；
- 软删行照样能解析（`resolveRootId` 不过滤 `deleted_at`），符合 §5.1「fork 源读取不过滤」。

一处口径分裂必须记住：`getVersion` **过滤**软删（版本详情 API 对软删行 404，§5），
`findVersionRow` **不过滤**（fork 源 / 谜题 / 游戏读取，§5.1 与「谜题引用始终可查」）。
谜题 / 游戏侧因此全部改用后者，删版本不会让已部署的游戏打不开。

### 18.2 补充二：`MapVersionSummary` **没有**加 `name` / `description` / `coverPath`

§7 表里原计划「只增不删」地加这三个字段。实现时看清楚了消费者：

- 版本详情页要的标题来自 `MapVersionDetail.projectName` —— 合并后它天然就是**快照名**，
  一个字段够用；
- 列表条目的名称 / 描述 / 封面来自 `MapEntrySummary`，那是行上的列，不经过 summary。

加进去就是三个没有任何调用方的死字段，所以**不加**。版本行仍然有真正的快照列（DB 层
需求已满足），只是不往这个 DTO 上多开一个口子。

### 18.3 其他实施细节

- `versionToNo()` / `nextVersionNo()` 是唯一的两个 `version` string↔number 转换入口，
  §15 P0-2 的 NaN 陷阱靠这条纪律收口；草稿行的 `Project.versionNo` 直接短路成 `null`。
- `toProject()` 的 `status` / `currentVersionNo` 由**血统**推导（子查询随行一起取，
  零额外往返）。副作用：fork 出来的草稿行在血统发布过之后也显示「已发布 v{n}」，
  与合并前（该行自己的 `status`）略有差异，属于 §3 已声明的推导口径。
- 测试清理必须显式删版本行：删工作条目**不再级联删版本**，`api.test.ts` 的 `afterAll`
  因此先按记账的 id 删版本行、再按 `root_id` 扫一遍、最后删草稿行，否则 `/maps` 列表会
  随每次跑测试变长。
- CASCADE 之外还有一个老坑被这一次撞上：`puzzles.map_project_id` 是 RESTRICT，
  down 迁移必须先补「无主血统」的容器草稿行、再改谜题引用，最后才 `DELETE` 版本行。
