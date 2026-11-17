import type { Asset, Character } from '@loredoku/shared';
import type { MarkRender } from '@/lib/mark';
import type { ToolIconsRender } from '@/lib/toolIcons';

/**
 * v0.11.2：**这一页会画到的图**清单 —— 交给 `useImagePreload` 去等。
 *
 * 只收「画布 / 名册真的会画」的那些，不收上传原图：图层里取的一直是
 * `imageThumbUrl ?? imageUrl`（见 `components/map/MapAssetLayers.tsx`），
 * 预加载的也应当是同一张，否则等完缩略图、画的时候还要再等一次原图。
 *
 * 各处口径：
 * - 资源：每个形态（variant）各一张 —— 一关用哪个形态要到画的时候才知道。
 * - 角色：头像缩略图优先，没有就取原图。
 * - 标记 / 工具图标 / 校验圈：各一张。
 */
export function boardImageUrls(input: {
  assets?: Asset[] | null;
  characters?: Character[] | null;
  mark?: MarkRender | null;
  toolIcons?: ToolIconsRender | null;
  ringImage?: string | null;
}): string[] {
  const urls: string[] = [];
  const push = (url: string | null | undefined): void => {
    if (!url || urls.includes(url)) return;
    urls.push(url);
  };

  for (const asset of input.assets ?? []) {
    for (const variant of asset.variants) {
      push(variant.imageThumbUrl ?? variant.imageUrl);
    }
  }
  for (const character of input.characters ?? []) {
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