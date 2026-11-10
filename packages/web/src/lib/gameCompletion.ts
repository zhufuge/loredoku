/**
 * v0.9.5：**已完成的谜题**。玩家通过一关之后，把「用时 + 完成时刻 + 那枚印」
 * 记到 localStorage，列表页据此在卡片上盖印并写出完成用时。
 *
 * 为什么是 localStorage 而不是服务端：玩家没有账号（v0.6.2 的摆放存档、v0.7.11
 * 的计时都是这条理由）。进度只对这台浏览器有意义，通过记录也是进度的一部分。
 *
 * 键按存档键（`storageId`）分：
 *
 * | 入口 | 存档键 |
 * |---|---|
 * | 线上 / 工坊（api） | 游戏 slug（原样） |
 * | 播放器（bundle） | `bundle:<主题code>:<key>` |
 *
 * 两套键**刻意不通**（v0.8.0 §11.6）：离线包里通了关，不该让线上那一关也变成
 * 「已完成」。
 *
 * 存档带**指纹**（只带 `gridSize`）：同一存档键重新部署后网格可能变了，那就是
 * 另一道题了，旧记录整条作废。`participantCount` 不进指纹 —— 列表页的两份数据
 * （`MapGameSummary` / 播放器卡片）都只有 `gridSize` 可对，多存一个对不上的字段
 * 只会让「读得回来吗」多一个不确定的分支。
 */

/** 存档结构变了就 +1；旧记录一律丢弃（宁可没盖印，不可错盖）。 */
export const GAME_COMPLETION_VERSION = 1;
export const GAME_COMPLETION_PREFIX = 'loredoku.game.completed.';

/** 通过记录要对的那一份指纹。 */
export interface GameCompletionMeta {
  gridSize: number;
}

export interface GameCompletion {
  /** 这一局的用时（毫秒）—— 列表页写的就是它，`formatElapsed` 转成 `03:07`。 */
  elapsedMs: number;
  /** 通关那一刻的墙钟（ISO），只进 `title`，不占卡片版面。 */
  completedAt: string;
  /**
   * 通过时定案卡上盖的那枚印（作者给「提交」配的图）的地址。
   *
   * **存地址而不是「那一刻再去查」**：列表页拿不到谜题级的工具图标（api 侧的
   * `MapGameSummary` 只有卡面那几项，播放器的 manifest 也只装清单），为了盖一枚
   * 印去逐关打开关卡 JSON 不划算；而通过那一刻游戏页手里正好有解析好的最终地址
   * （谜题 → 主题 → 内置，`lib/toolIcons.ts`）。没配图就是 `null` —— 那一档不盖印，
   * 只写完成用时。
   *
   * 代价：作者事后换掉那枚图，旧记录里的地址可能 404。卡片对加载失败的那张图
   * 静默不画（见 `GameCard`），不会留一个破图标。
   */
  stampUrl: string | null;
}

export interface StoredGameCompletion extends GameCompletionMeta, GameCompletion {
  v: number;
}

export function gameCompletionKey(storageId: string): string {
  return `${GAME_COMPLETION_PREFIX}${storageId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStampUrl(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseCompletedAt(value: unknown): string {
  if (typeof value !== 'string') return '';
  return Number.isNaN(new Date(value).getTime()) ? '' : value;
}

/**
 * 读到的 JSON → 通过记录，或 `null`（= 当作没通过）。
 *
 * 与 `parseStoredProgress` / `parseStoredTimer` 同一个形状：不碰 `window`，
 * 测试可以直接喂坏数据。
 */
export function parseStoredCompletion(
  value: unknown,
  meta: GameCompletionMeta,
): GameCompletion | null {
  if (!isRecord(value)) return null;
  if (value.v !== GAME_COMPLETION_VERSION) return null;
  if (value.gridSize !== meta.gridSize) return null;

  const elapsed = value.elapsedMs;
  if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < 0) return null;

  return {
    elapsedMs: Math.floor(elapsed),
    completedAt: parseCompletedAt(value.completedAt),
    stampUrl: parseStampUrl(value.stampUrl),
  };
}

export function readGameCompletion(
  storageId: string,
  meta: GameCompletionMeta,
): GameCompletion | null {
  if (typeof window === 'undefined' || storageId.length === 0) return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(gameCompletionKey(storageId));
  } catch {
    // 无痕模式 / 站点数据被禁：读不到就当没通过，卡片上什么也不盖。
    return null;
  }
  if (!raw) return null;
  try {
    return parseStoredCompletion(JSON.parse(raw), meta);
  } catch {
    return null;
  }
}

/**
 * 记下这一关通过了。返回**最终存着的那一条** —— 已经有一条有效记录时原样返回，
 * 不覆盖。
 *
 * 为什么首次为准而不是「取更快的一局」：这条记录在列表页读作「结案了」，
 * 卡片是**凭证**不是排行榜；数字随每次重玩来回跳，会把一枚印读成一个计时器。
 * 想刷新成绩就重新来（清掉站点的 localStorage），这条规矩与 v0.7.11「提交不落盘」
 * 同一种态度：界面不该记一个玩家没做过的状态，也不该替他改成绩。
 *
 * 指纹对不上（`gridSize <= 0`，画布还没算出来）时不写：写下去的每一条都必须
 * 能被 `readGameCompletion` 读回来，否则列表页永远看不见它。
 */
export function recordGameCompletion(
  storageId: string,
  meta: GameCompletionMeta,
  input: { elapsedMs: number; stampUrl: string | null },
): GameCompletion | null {
  if (typeof window === 'undefined' || storageId.length === 0) return null;
  if (!Number.isFinite(meta.gridSize) || meta.gridSize <= 0) return null;

  const existing = readGameCompletion(storageId, meta);
  if (existing) return existing;

  const completion: GameCompletion = {
    elapsedMs: Math.max(0, Math.floor(input.elapsedMs)),
    completedAt: new Date().toISOString(),
    stampUrl: parseStampUrl(input.stampUrl),
  };
  try {
    window.localStorage.setItem(
      gameCompletionKey(storageId),
      JSON.stringify({
        v: GAME_COMPLETION_VERSION,
        gridSize: meta.gridSize,
        ...completion,
      } satisfies StoredGameCompletion),
    );
  } catch {
    // 与摆放 / 计时两条存档同一套态度：存不下不打扰玩家。
  }
  return completion;
}

/** 重新开始一局**不**清这条记录 —— 通过是既成事实，重玩只是再来一局。 */
export function clearGameCompletion(storageId: string): void {
  if (typeof window === 'undefined' || storageId.length === 0) return;
  try {
    window.localStorage.removeItem(gameCompletionKey(storageId));
  } catch {
    // 见上。
  }
}
