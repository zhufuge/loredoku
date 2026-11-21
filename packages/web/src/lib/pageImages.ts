import {
  resolveAssetVariant,
  type Asset,
  type Character,
  type CharacterSlotEntry,
} from '@loredoku/shared';
import type { CellMap } from '@/lib/canvasLayers';
import type { MarkRender } from '@/lib/mark';
import type { ToolIconsRender } from '@/lib/toolIcons';

/** **这一页会画到的图**清单 —— 交给 `useImagePreload` 去等。 只收「画布 / 名册真的会画」的那些，不收上传原图：图层里取的一直是 `imageThumbUrl ?? imageUrl`（见 `components/map/MapAssetLayers.tsx`）， 预加载的也应当是同一张，否则等完缩略图、画的时候还要再等一次原图。 各处口径：；资源：**只看这一关的画布**（`cells` 里每个格子的背景 / 装饰 / 物品）， 每个锚点按 `resolveAssetVariant` 取到的那一个形态一张 —— 与图层画的是 同一张。；标记 / 工具图标 / 校验圈：各一张。 */
export function boardImageUrls(input: {
  cells?: CellMap | null;
  assetsById?: Map<number, Asset> | null;
  slots?: Array<CharacterSlotEntry | null> | null;
  charactersById?: Map<number, Character> | null;
  mark?: MarkRender | null;
  toolIcons?: ToolIconsRender | null;
  ringImage?: string | null;
}): string[] {
  const urls: string[] = [];
  const push = (url: string | null | undefined): void => {
    if (!url || urls.includes(url)) return;
    urls.push(url);
  };

  /* 画布上的资源：只认 `cells` 里真正落过的那几个锚点。兜底规则必须与图层一致 —— 那里也是 `resolveAssetVariant(asset, variantId)`（`variantId` 缺失或悬空时退回第一个形态），否则「等的图」与「画的图」会错开。 */
  const pushAsset = (assetId: number, variantId?: number | null): void => {
    const asset = input.assetsById?.get(assetId);
    if (!asset) return;
    const variant = resolveAssetVariant(asset, variantId);
    push(variant?.imageThumbUrl ?? variant?.imageUrl);
  };
  for (const cell of input.cells?.values() ?? []) {
    if (cell.background) pushAsset(cell.background.assetId, cell.background.variantId);
    if (cell.decoration) pushAsset(cell.decoration.assetId, cell.decoration.variantId);
    if (cell.item) pushAsset(cell.item.assetId, cell.item.variantId);
  }

  for (const slot of input.slots ?? []) {
    if (!slot) continue;
    const character = input.charactersById?.get(slot.characterId);
    if (!character) continue;
    push(character.avatarThumbUrl ?? character.avatarUrl);
  }

  push(input.mark?.imageUrl);
  for (const icon of Object.values(input.toolIcons ?? {})) {
    push(icon?.imageUrl);
  }
  push(input.ringImage);

  return urls;
}

/** 列表页的图就是每张卡的封面。 */
export function gameCoverUrls(games: { coverUrl: string | null }[]): string[] {
  const urls: string[] = [];
  for (const game of games) {
    if (game.coverUrl && !urls.includes(game.coverUrl)) urls.push(game.coverUrl);
  }
  return urls;
}
