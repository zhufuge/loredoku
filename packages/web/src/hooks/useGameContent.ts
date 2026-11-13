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
 * 一关的**内容**：谜题行 + 地图 JSON，加上两处补全（资源 / 角色表），最后解成
 * 「画布与名册直接能画的东西」—— 格子表、图、主题给的环与校验色、名册宽。
 *
 * v0.10.4：从 `GamePage` 搬出来。这一整块是**纯派生**：只有 `detail` / `source` /
 * 两张表进来，没有任何 `setState`。留在一个三千行的页面里时，它是「读取这一关
 * 长什么样」和「这一局怎么玩」之间那条分界线上最容易被越过的部分 —— 现在它自己
 * 一个文件，谁都不该往这里写交互。
 *
 * 一切解析顺序与 v0.8.7 / v0.9.x 一致：**谜题自己配的 → 主题的 → 内置**。
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
  /**
   * v0.7.1 §7.3: 游戏直接读**谜题版本行**，不再有快照拷贝 —— 画布来自
   * `detail.map`（谜题自带的那份副本），名册与调色板来自 `detail.puzzle`。
   * 内容仍然是冻结的：版本行只读，作者改不动已在线的游戏。
   */
  const draft = detail?.map;
  const slots = useMemo<Array<CharacterSlotEntry | null>>(
    () => detail?.puzzle?.characterSlots ?? [],
    [detail],
  );
  const linkageColors = useMemo(() => detail?.puzzle?.linkageColors ?? [], [detail]);
  /**
   * v0.6.3 (docs/v0.6.3.md §3.4): the deployed game renders the roster the way
   * the puzzle was laid out. The column count lives in the puzzle row, and the
   * row is immutable once published — so only re-deploying a new version can
   * move a board that is already online.
   */
  const rosterCols = detail?.puzzle?.rosterCols ?? null;
  /**
   * v0.7.14（docs/v0.7.14.md §3）：题面的两段文字。
   *
   * **旧版本行没有这两个键** —— 已发布的游戏是一份冻住的 JSON，v0.7.14 之前
   * 发布的那批里既没有 `clues` 也没有 `ending`。所以这里一律按「没有」处理：
   * 绝不假设服务端补过默认值（`absorbLegacyPuzzleDraft` 只归一层级，不补字段）。
   */
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
   * v0.8.7 §4：这一局标记画什么 —— **谜题自己配的 → 主题的缺省 → `×`**。
   *
   * 主题那一份按**这一局的主题编码**查（§19）；`useWorkspace()` 在播放页是 `null`，
   * 所以走的是「主题列表摊成表」那条路，与难度分级同一个 hook 家族。
   * `null` 仍是两边都没有，两个游戏图层退回原来那枚 `×`（放置层黑字、提示层绿字）。
   *
   * v0.9.0 §2：查表的活儿挪进 `source` —— 播放器的包里每一关已经烤好了最终结果
   * （`bundleService` 把主题那张补进了关卡 JSON），所以那边一律返回 `null`。
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

  /**
   * v0.8.7 §7：工具栏三枚动作按钮（清除 / 撤回 / 提交）画什么 —— 同一套顺序：
   * **谜题自己的 → 主题的 → 内置图标**。主题那一份同样按这一局的主题编码查。
   */
  const toolIcons = useMemo(
    () =>
      resolveToolIcons(
        detail?.puzzle?.toolIcons,
        source.themeToolIcons(detail?.themeCode),
        source.fileUrl,
      ),
    [detail, source],
  );

  /**
   * v0.9.2 §2；v0.9.5 起长按计时环与提交校验圈**合并成一张** —— 所以这里只解析
   * 一次，两个图层共用。作者在主题里配了图就画那张，没配就是各自的内置细弧。
   * 只有主题一档：环属于「这个世界的操作手感」，不是某一关的内容。
   */
  const ringImage = useMemo(
    () => resolveRingImage(source.themeRing(detail?.themeCode), source.fileUrl),
    [detail, source],
  );

  /**
   * v0.9.3 §2；v0.9.5 起只剩两档颜色（圈图见上面的 `ringImage`）。主题没配过就是
   * 内置绿 / 红（见 `lib/checkStyle.ts`），所以这里拿到的永远是一份能直接用的样式。
   */
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
