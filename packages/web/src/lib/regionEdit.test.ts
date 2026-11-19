import { describe, expect, it } from 'vitest';
import type { DraftRegion } from '@loredoku/shared';

import {
  regionCellEditCells,
  regionCellEditDelta,
  regionCellEditProblem,
  seedRegionCellEdit,
  strokeRegionCellEdit,
} from './regionEdit';

/** 一块 2×2 的区域，用来验「加一格 / 减一格」。 */
function region(cells: Array<[number, number]>, id = 'rg_a'): DraftRegion {
  return { id, name: '甲区', cells };
}

describe('seedRegionCellEdit — 会话从已提交的格子开始（v0.11.5）', () => {
  it('抄一份格子集，带上区域 id', () => {
    const edit = seedRegionCellEdit(region([[0, 0], [1, 0], [0, 1]]));
    expect(edit.regionId).toBe('rg_a');
    expect(Array.from(edit.cells).sort()).toEqual(['0,0', '0,1', '1,0']);
  });

  it('是副本：改草稿不会动到原区域', () => {
    const source = region([[0, 0]]);
    const edit = seedRegionCellEdit(source);
    const next = strokeRegionCellEdit(edit, ['9,9'], false);
    expect(source.cells).toEqual([[0, 0]]);
    expect(next.cells.has('9,9')).toBe(true);
    // 原草稿也不动：每次涂抹返回新的一份，React 才看得到变化。
    expect(edit.cells.has('9,9')).toBe(false);
  });
});

describe('strokeRegionCellEdit — 一笔只朝一个方向改（v0.11.5）', () => {
  it('加入：把这一笔的格子都塞进草稿', () => {
    const edit = seedRegionCellEdit(region([[0, 0]]));
    const next = strokeRegionCellEdit(edit, ['1,0', '2,0'], false);
    expect(regionCellEditCells(next)).toEqual([[0, 0], [1, 0], [2, 0]]);
  });

  it('移除：把这一笔的格子都移出草稿', () => {
    const edit = seedRegionCellEdit(region([[0, 0], [1, 0], [2, 0]]));
    const next = strokeRegionCellEdit(edit, ['1,0'], true);
    expect(regionCellEditCells(next)).toEqual([[0, 0], [2, 0]]);
  });

  it('空笔返回原对象（不用白造一份）', () => {
    const edit = seedRegionCellEdit(region([[0, 0]]));
    expect(strokeRegionCellEdit(edit, [], false)).toBe(edit);
  });

  it('重复加入同一格不会变多', () => {
    const edit = seedRegionCellEdit(region([[0, 0]]));
    const next = strokeRegionCellEdit(edit, ['1,1', '1,1'], false);
    expect(regionCellEditDelta(next, region([[0, 0]])).added).toBe(1);
  });

  it('不改入参的草稿', () => {
    const edit = seedRegionCellEdit(region([[0, 0]]));
    strokeRegionCellEdit(edit, ['1,0'], false);
    expect(Array.from(edit.cells)).toEqual(['0,0']);
  });
});

describe('regionCellEditCells — 稳定次序（v0.11.5）', () => {
  it('先按行再按列', () => {
    const edit = seedRegionCellEdit(region([[2, 1], [0, 1], [1, 0]]));
    expect(regionCellEditCells(edit)).toEqual([[1, 0], [0, 1], [2, 1]]);
  });
});

describe('regionCellEditDelta — 工具条上那三个数（v0.11.5）', () => {
  it('加一格：total 与 added 各 +1，removed 为 0', () => {
    const edit = strokeRegionCellEdit(
      seedRegionCellEdit(region([[0, 0], [1, 0]])),
      ['2,0'],
      false,
    );
    expect(regionCellEditDelta(edit, region([[0, 0], [1, 0]]))).toEqual({
      total: 3,
      added: 1,
      removed: 0,
    });
  });

  it('减一格：total −1，removed 为 1', () => {
    const edit = strokeRegionCellEdit(
      seedRegionCellEdit(region([[0, 0], [1, 0]])),
      ['1,0'],
      true,
    );
    expect(regionCellEditDelta(edit, region([[0, 0], [1, 0]]))).toEqual({
      total: 1,
      added: 0,
      removed: 1,
    });
  });

  it('一边加一边减：两个数各自算', () => {
    const edit = strokeRegionCellEdit(
      strokeRegionCellEdit(seedRegionCellEdit(region([[0, 0], [1, 0]])), ['1,0'], true),
      ['0,1', '1,1'],
      false,
    );
    expect(regionCellEditDelta(edit, region([[0, 0], [1, 0]]))).toEqual({
      total: 3,
      added: 2,
      removed: 1,
    });
  });
});

describe('regionCellEditProblem — 提交前的两条硬规矩（v0.11.5）', () => {
  it('还剩格子且连通就放行', () => {
    expect(regionCellEditProblem([[0, 0], [1, 0], [0, 1]])).toBeNull();
  });

  it('一格都不剩', () => {
    expect(regionCellEditProblem([])).toBe('区域至少要留一格');
  });

  it('把中间那格削掉、把区域切成两块 —— 必须拦下', () => {
    // 1×3 的横条，去掉中间那格 → 左右两段互不相邻。
    expect(regionCellEditProblem([[0, 0], [2, 0]])).toBe(
      '区域必须是连通的（四邻接），当前编辑把区域切成了几块',
    );
  });

  it('斜着相邻不算连通（四邻接）', () => {
    expect(regionCellEditProblem([[0, 0], [1, 1]])).not.toBeNull();
  });
});
