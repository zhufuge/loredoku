import { useMemo } from 'react';
import {
  type Asset,
  type Character,
  type CharacterSlotEntry,
  type MapDraft,
  type MapLinkageColor,
  type MapGameDetail,
} from '@loredoku/shared';
import type { GameSource } from '@/lib/gameSource';
import type { CellMap } from '@/lib/canvasLayers';
import { resolveMapStyle } from '@/lib/mapStyle';
import { resolveMarkImage } from '@/lib/mark';
import { resolveToolIcons, type ToolIconsRender } from '@/lib/toolIcons';
import { resolveRingImage } from '@/lib/ring';
import { resolveCheckColors } from '@/lib/checkStyle';
import { rosterPanelWidthFor } from '@/lib/participantLayout';

/**
 * 一关的内容：谜题行 + 地图 JSON 补全资源 / 角色表，解成画布与名册直接能画的东西；纯派生（无 `setState`），解析顺序一律「谜题自己配的 → 主题的 → 内置」。
 */
export interface GameContent {
  draft: MapDraft | undefined;
  slots: Array<CharacterSlotEntry | null>;
  linkageColors: MapLinkageColor[];
  rosterCols: number | null;
  puzzleDescription: string;
  puzzleClues: string[];
  puzzleEnding: string;
  rosterWidth: number;
  assetsById: Map<number, Asset>;
  charactersById: Map<number, Character>;
  mark: ReturnType<typeof resolveMarkImage>;
  toolIcons: ToolIconsRender;
  ringImage: string | null;
  checkStyle: ReturnType<typeof resolveCheckColors>;
  cells: CellMap;
  regions: MapDraft['regions'];
  gridSize: number;
  style: ReturnType<typeof resolveMapStyle>;
}

export function useGameContent({
  detail,
  source,
  assets,
  characters,
}: {
  detail: MapGameDetail | null | undefined;
  source: GameSource;
  assets: Asset[] | null | undefined;
  characters: Character[] | null | undefined;
}): GameContent {
  /** 游戏直接读谜题版本行（`detail.map` / `detail.puzzle`），无快照拷贝；版本行只读。 */
  const draft = detail?.map;
  const slots = useMemo<Array<CharacterSlotEntry | null>>(
    () => detail?.puzzle?.characterSlots ?? [],
    [detail],
  );
  const linkageColors = useMemo(() => detail?.puzzle?.linkageColors ?? [], [detail]);
  /** 名册列数存在谜题行；发布后不可变，只有重新发布新版本才能挪动在线棋盘。 */
  const rosterCols = detail?.puzzle?.rosterCols ?? null;
  /** 题面两段文字：v0.7.14 前的版本行没有这两个键，一律按「没有」处理，不假设服务端补过。 */
  const puzzleDescription = detail?.puzzle?.description ?? '';
  const puzzleClues = useMemo(() => detail?.puzzle?.clues ?? [], [detail]);
  const puzzleEnding = (detail?.puzzle?.ending ?? '').trim();
  const rosterWidth = useMemo(
    () => rosterPanelWidthFor(rosterCols, slots.length),
    [rosterCols, slots.length],
  );

  const assetsById = useMemo(() => {
    const map = new Map<number, Asset>();
    for (const item of assets ?? []) map.set(item.id, item);
    return map;
  }, [assets]);

  /**
   * 这一局的标记：谜题自己配的 → 主题缺省（按主题编码查）→ `×`；`source` 负责播放器包已烤好的结果。
   */
  const mark = useMemo(
    () =>
      resolveMarkImage(
        detail?.puzzle?.mark,
        source.themeMark(detail?.themeCode),
        source.fileUrl,
      ),
    [detail, source],
  );

  /** 工具栏三枚按钮图标：谜题自己的 → 主题的 → 内置，主题按这一局编码查。 */
  const toolIcons = useMemo(
    () =>
      resolveToolIcons(
        detail?.puzzle?.toolIcons,
        source.themeToolIcons(detail?.themeCode),
        source.fileUrl,
      ),
    [detail, source],
  );

  /** 长按计时环与提交校验圈合并成一张（v0.9.5），只解析一次；只有主题一档。 */
  const ringImage = useMemo(
    () => resolveRingImage(source.themeRing(detail?.themeCode), source.fileUrl),
    [detail, source],
  );

  /** 校验色只剩两档颜色（v0.9.5），主题没配过就用内置绿 / 红，永远能直接用。 */
  const checkStyle = useMemo(
    () => resolveCheckColors(source.themeCheckColors(detail?.themeCode)),
    [detail, source],
  );

  const charactersById = useMemo(() => {
    const map = new Map<number, Character>();
    for (const character of characters ?? []) map.set(character.id, character);
    return map;
  }, [characters]);

  const cells = useMemo(() => {
    const map = new Map<string, MapDraft['cells'][string]>();
    for (const key of Object.keys(draft?.cells ?? {})) {
      const cell = draft?.cells[key];
      if (cell) map.set(key, cell);
    }
    return map;
  }, [draft]);

  const regions = useMemo(() => draft?.regions ?? [], [draft]);
  const gridSize = draft?.gridSize ?? 0;
  const style = useMemo(() => resolveMapStyle(draft?.style), [draft]);

  return {
    draft,
    slots,
    linkageColors,
    rosterCols,
    puzzleDescription,
    puzzleClues,
    puzzleEnding,
    rosterWidth,
    assetsById,
    charactersById,
    mark,
    toolIcons,
    ringImage,
    checkStyle,
    cells,
    regions,
    gridSize,
    style,
  };
}
