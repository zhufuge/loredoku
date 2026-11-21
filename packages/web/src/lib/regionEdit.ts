import type { DraftRegion } from '@loredoku/shared';
import { coordKey, isConnected, type Coord } from '@/lib/region';

/** 已有区域的**格子编辑**会话。 创建区域是一条路（涂抹选区 → 对话框 → `createRegion`），改已有区域的格子 在此之前只有一条没公开的捷径 —— 选中区域后 `Shift + 点击` 立刻增删一格 （`toggleRegionCell`）。 它有两个毛病： 1. **不可发现**：没有任何界面提示，作者只能被告知； 草稿用完整集合而不是「新增 / 移除」两个集合，是因为区域本身就不允许重叠 （`findOverlap`），最终要的也正是一份格子列表 —— 两个增量集还要在提交时 合并一次，反而多一层可能对不上的状态。 */
export interface RegionCellEdit {
  regionId: string;
  /** 编辑**之后**这一块区域的全部格子（`x,y` 形式的键）。 */
  cells: Set<string>;
}

export function seedRegionCellEdit(region: DraftRegion): RegionCellEdit {
  return {
    regionId: region.id,
    cells: new Set(region.cells.map(([x, y]) => coordKey(x, y))),
  };
}

/** 一笔涂抹的结果：`erase` 为真则把这些格子移出草稿，否则加入。 一笔之内方向固定（与区域笔刷 `brushStrokeErases` 同一条规则），所以画到一半不会反过来把刚加上的又擦掉。 */
export function strokeRegionCellEdit(
  edit: RegionCellEdit,
  keys: readonly string[],
  erase: boolean,
): RegionCellEdit {
  if (keys.length === 0) return edit;
  const cells = new Set(edit.cells);
  for (const key of keys) {
    if (erase) cells.delete(key);
    else cells.add(key);
  }
  return { regionId: edit.regionId, cells };
}

/** 草稿格子集 → 有序的 `Coord[]`（先按行、再按列，便于对账与稳定写入）。 */
export function regionCellEditCells(edit: RegionCellEdit): Coord[] {
  return Array.from(edit.cells)
    .map((key) => key.split(',').map(Number) as Coord)
    .sort((a, b) => (a[1] === b[1] ? a[0] - b[0] : a[1] - b[1]));
}

export interface RegionCellEditDelta {
  /** 编辑之后的总格数。 */
  total: number;
  /** 比原来多出来的格数。 */
  added: number;
  /** 比原来少掉的格数。 */
  removed: number;
}

export function regionCellEditDelta(
  edit: RegionCellEdit,
  region: DraftRegion,
): RegionCellEditDelta {
  const before = new Set(region.cells.map(([x, y]) => coordKey(x, y)));
  let added = 0;
  for (const key of edit.cells) if (!before.has(key)) added += 1;
  let removed = 0;
  for (const key of before) if (!edit.cells.has(key)) removed += 1;
  return { total: edit.cells.size, added, removed };
}

/** 提交前的校验。返回 `null` 表示可以写，否则是给作者看的一句话。 两条规则与创建时一致（`RegionDialog` 的 `handleSubmit`）： 至少一格；四邻接连通。**去掉格子也可能把区域切两半**，所以这条不能只在创建时查 —— 那正是这次编辑最容易踩到的坑。 */
export function regionCellEditProblem(cells: readonly Coord[]): string | null {
  if (cells.length === 0) return '区域至少要留一格';
  if (!isConnected([...cells])) return '区域必须是连通的（四邻接），当前编辑把区域切成了几块';
  return null;
}
