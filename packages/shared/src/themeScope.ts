import type { MapDraft, PuzzleDraft } from './types/domain';

/**
 * v0.8.0 (docs/v0.8.0.md §8 护栏 1) —— 主题边界的**唯一判定点**。
 *
 * 服务端在 `mapService.save` / `puzzleService.save` / 发布校验里调它，前端在保存前
 * 也调一次（同一份判定，两处提示一致）。判定本身是纯函数：给一个「这条引用属于
 * 哪个主题」的查询回调，还你所有越界的引用。
 *
 * 为什么不在 shared 里抛 `AppError`：shared 不依赖任何运行时（AGENTS §1）。
 * 消息由调用方按自己的语言组装 —— 服务端要 400，前端要行内标记，两边说的话不一样。
 */

export type ThemeRefKind = 'asset' | 'variant' | 'character';

export interface ThemeRefTarget {
  kind: ThemeRefKind;
  id: number;
  /** 人读的出处（「单元格 3,5 的背景」），报错与行内标记都用它定位。 */
  where: string;
}

/**
 * 一张地图草稿里引用到的资源 / 形态。按「首次出现顺序」产出 —— 资源包的重编号
 * （§11.3）拿到的顺序因此是确定的，同一份输入永远得到同一份包。
 */
export function collectMapThemeRefs(draft: MapDraft | null | undefined): ThemeRefTarget[] {
  const refs: ThemeRefTarget[] = [];
  if (!draft) return refs;
  for (const [key, cell] of Object.entries(draft.cells ?? {})) {
    if (cell?.background) {
      refs.push({ kind: 'asset', id: cell.background.assetId, where: `单元格 ${key} 的背景` });
      if (cell.background.variantId != null) {
        refs.push({
          kind: 'variant',
          id: cell.background.variantId,
          where: `单元格 ${key} 的背景形态`,
        });
      }
    }
    if (cell?.item) {
      refs.push({ kind: 'asset', id: cell.item.assetId, where: `单元格 ${key} 的物品` });
      if (cell.item.variantId != null) {
        refs.push({
          kind: 'variant',
          id: cell.item.variantId,
          where: `单元格 ${key} 的物品形态`,
        });
      }
    }
  }
  return refs;
}

/** 谜题引用到的资源 / 角色：画布副本 + 名册 + 联动目标。 */
export function collectPuzzleThemeRefs(draft: PuzzleDraft | null | undefined): ThemeRefTarget[] {
  if (!draft) return [];
  const refs = collectMapThemeRefs(draft.map?.data);
  draft.characterSlots.forEach((slot, index) => {
    if (!slot) return;
    refs.push({ kind: 'character', id: slot.characterId, where: `参与者 ${index + 1}` });
    (slot.linkages ?? []).forEach((linkage) => {
      // 只有指向库里某一行的才算引用：`cell` 是坐标、`region` 是草稿内的区域 id，
      // 两者都跟着这一关走，不可能跨主题 —— 所以只收这两种（v0.8.0 修正：
      // 之前漏了 `character`，联动指向的角色既躲过越界检查，也躲过打包的引用闭包）。
      if (linkage.type === 'asset' || linkage.type === 'character') {
        refs.push({
          kind: linkage.type,
          id: linkage.id,
          where: `参与者 ${index + 1} 的联动目标`,
        });
      }
    });
  });
  return refs;
}

/** 同一条引用会被多个单元格指到；判定与报错都只该出现一次。 */
export function dedupeThemeRefs(refs: ReadonlyArray<ThemeRefTarget>): ThemeRefTarget[] {
  const seen = new Set<string>();
  const out: ThemeRefTarget[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/**
 * 越界 = 引用存在、但属于**另一个**主题。
 *
 * `resolveThemeId` 返回 `null` / `undefined` 表示「这一行不存在」—— 那不是越界，
 * 是悬空引用，由既有的 `collectReferenceIssues` / 发布校验负责。两件事分开，
 * 否则一条坏引用会同时得到两条自相矛盾的提示。
 */
export function findOutOfScopeRefs(
  refs: ReadonlyArray<ThemeRefTarget>,
  themeId: number,
  resolveThemeId: (ref: ThemeRefTarget) => number | null | undefined,
): ThemeRefTarget[] {
  const out: ThemeRefTarget[] = [];
  for (const ref of dedupeThemeRefs(refs)) {
    const owner = resolveThemeId(ref);
    if (owner == null) continue;
    if (owner !== themeId) out.push(ref);
  }
  return out;
}
