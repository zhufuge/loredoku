import { createContext, useContext, type ReactNode } from 'react';
import type {
  Asset,
  Character,
  UploadedImage,
  GameToolIcons,
  MapGameDetail,
  ThemeCheckColors,
  ThemeRing,
} from '@loredoku/shared';
import type { GameLevelRef } from './gameCatalog';

/**
 * v0.9.0（docs/v0.9.0.md §2）：游戏页的**数据来源**。
 *
 * 这一层是 v0.8.0 §11.6 写下的 `GameSource` 的落地版。那一份是「一个对象上挂三个
 * `loadXxx(): Promise`」，落到 React 里必须再包一层 loading / error —— 而 `GamePage`
 * 的 1500 行里，凡是碰数据的角落要的就是 query 的三件套。所以接口改成
 * **「返回 query 的 hook」**：形状与 `useQuery` 一致，渲染层不必改一行渲染逻辑。
 *
 * 两种实现：
 *
 * | | `api` | `bundle` |
 * |---|---|---|
 * | 谁提供 | `useApiGameSource()`（工坊 / 线上） | `player/PlayerBundleProvider` |
 * | 数据从哪来 | `/api/games/:slug` 等四个接口 | 一个导出包里的 JSON |
 * | 存档键 | 游戏 slug（原样） | `bundle:<主题code>:<key>` |
 *
 * **不把两种实现写在同一个文件里**：`api` 那份 import 了 axios（经 hooks → api 层），
 * 播放器不该为一根网线付这份体积 —— 所以 `bundle` 实现在 `src/player/` 下，只有
 * 播放器入口会引到它。
 *
 * 存档键分开是**有意的**（v0.8.0 §11.6）：离线包里的进度不该出现在线上，反之亦然。
 * 同一个浏览器里同时开着两者，互不干扰。
 */

/** `useQuery` 里渲染层真正用到的三件套。 */
export interface GameQuery<T> {
  data: T | null;
  isLoading: boolean;
  isError: boolean;
}

export interface GameSource {
  readonly kind: 'api' | 'bundle';
  /** 一关的全部数据（画布 + 谜题 + 摘要）。 */
  useGame(key: string | null): GameQuery<MapGameDetail>;
  /** 画布上画物品要用到的资源表 —— 两个来源都是全量。 */
  useAssets(): GameQuery<Asset[]>;
  /** 名册与联动要用到的角色表。 */
  useCharacters(): GameQuery<Character[]>;
  /** 主题级的**标记**（v0.8.7 §4）。包里已内联到每一关，所以 bundle 恒为 `null`。 */
  themeMark(themeCode: string | null | undefined): UploadedImage | null;
  /** 主题级的三枚工具按钮图标（v0.8.7 §7），同一条。 */
  themeToolIcons(themeCode: string | null | undefined): GameToolIcons | null;
  /**
   * 主题级的**那一圈**（v0.9.2 §2；v0.9.5 起长按计时环与校验圈合并成一张）。
   *
   * 与上面两项同一条「读取时兜底」：`null` = 没配，两个消费点各画内置细弧。
   * 包里那张已内联进 manifest，所以 bundle 也能给。
   */
  themeRing(themeCode: string | null | undefined): ThemeRing | null;
  /**
   * 主题级的**提交校验颜色**（v0.9.3 §3；v0.9.5 起只剩两档颜色，圈图并进 `ring`）。
   *
   * 同样「读取时兜底」：返回 `null` 表示这个主题没配过，由 `lib/checkStyle.ts`
   * 填内置绿 / 红。bundle 从 `manifest.theme.checkStyle` 取，api 从主题列表查。
   */
  themeCheckColors(themeCode: string | null | undefined): ThemeCheckColors | null;
  /**
   * 包内 / 库内相对路径 → 能塞进 `<img src>` 的地址。
   *
   * `api` 是 `/api/files/<path>`；`bundle` 是 `<包根><path>`（`files/assets/…`）。
   * 两种都返回**绝对路径**（以 `/` 开头或带 base），因为画布、名册、标记
   * 三处的 `<img>` 都在深层组件里，各自再拼一次前缀迟早会漏一处。
   */
  fileUrl(path: string): string;
  /**
   * 存档键里那段身份。`api` 原样返回游戏 slug（**线上已有进度的键不能变**）；
   * `bundle` 返回 `bundle:<主题code>:<key>`。
   */
  storageId(key: string): string;
  /**
   * 两个地址。v0.9.0 §3：两个入口的路由前缀不同（`/play` 与 `/loredoku/:code/play`），
   * 而「返回游戏列表」那个箭头在两个入口里都得指向对的地方 —— 与其让 `GamePage`
   * 里出现「如果是播放器就……」，不如把地址也交给 source。
   *
   * 返回值都是**路由内路径**（不带站点 base）：工坊挂 basename `/`，播放器挂
   * `/loredoku`，两者由各自的 router 补前缀。
   *
   * v0.9.2：`themeHref` 随合辑一起删了 —— `/play/theme/:slug` 那个「回到主题」的
   * 落点已经不存在，顶栏也不再显示主题名。
   */
  listHref(): string;
  gameHref(key: string): string;
  /**
   * v0.9.5：**这个列表里全部关卡**，按玩家在列表页看到的顺序。
   *
   * 定案卡上那枚「下一关」要回答「排在当前这一关之后、还没通过的第一关是哪一关」，
   * 而这个答案只有「整份清单」知道 —— 两个入口的清单来源不同（api 是 `/api/games`，
   * 播放器是 `manifest.games`），但两边都已经有一份按 `sortWeight, slug` 排好的
   * 列表，所以这里只是把它读出来，不再另存一个「关卡序号」。
   *
   * 三件必须同时成立的事（否则「下一关」会指到一个玩家没看见的角度）：
   *
   * - **顺序 = 列表顺序**：与卡片网格里那一排一致，作者排好的先后说了算；
   * - **`key` = 路由尾段 / 存档键中段**：线上是 slug、包里是 key，两套本来就
   *   各自对齐（`storageId` / `gameHref` 收的也是它）；
   * - **`gridSize` 在场**：列表页要拿它核对通过记录的指纹，卡片页脚已经写着它。
   *
   * `null` = 这份清单读不出来（接口失败 / 播放器没包）。那不是错误，只是这枚
   * 按钮不出现 —— 结案卡上少一个「下一关」，不该让玩家看一个打不开的按钮。
   */
  useCatalog(): GameQuery<GameLevelRef[]>;
}

const GameSourceContext = createContext<GameSource | null>(null);

export function GameSourceScope({
  source,
  children,
}: {
  source: GameSource;
  children: ReactNode;
}): JSX.Element {
  return <GameSourceContext.Provider value={source}>{children}</GameSourceContext.Provider>;
}

/**
 * 取当前的数据来源。**只在 `GameView` 里用** —— 它由 `GamePage` 保证一定在 scope
 * 里渲染（自己套一层 api 实现，或被播放器套一层 bundle 实现）。
 */
export function useGameSource(): GameSource {
  const source = useContext(GameSourceContext);
  if (!source) throw new Error('GamePage 必须在 GameSourceScope 里渲染');
  return source;
}

/** 「有没有人给我一个来源」—— `GamePage` 靠它决定自己走哪条分支。 */
export function useProvidedGameSource(): GameSource | null {
  return useContext(GameSourceContext);
}
