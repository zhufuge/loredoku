// // 游戏：难度、结算、工具图标、部署清单。
// v0.10.4：从 `constants.ts`（1324 行、287 个导出）按主题拆开。值、注释、次序一律
// 照搬 —— 只是把「谁在用」相近的那些放在一个文件里，改一处不必在一千行里翻。
// 对外仍是同一组名字：`constants/index.ts` 全部再导出，`@loredoku/shared` 不变。

// ---- v0.4.0 games (docs/v0.4.0.md §5 / §7 / §10) ----
/**
 * v0.4 的内置五档**名字**。
 *
 * v0.8.6 起难度在库里存的是**数字档位**（`games.difficulty` 已经是 smallint），
 * 这五个名字只剩两处还在用：v0.8.1 之前的老路径里剥难度后缀
 * （`GAME_DIFFICULTY_SLUGS`），以及 v0.8.6 那条迁移把旧值换成数字。
 * 界面上一个都不会出现 —— 徽章上的字来自主题的 `difficultyLevels[].label`。
 */
export const GAME_DIFFICULTY_LEVELS = ['veryEasy', 'easy', 'medium', 'hard', 'expert'] as const;

/** 内置五档的中文名 —— 主题没配分级时，默认那五档的 `label`。 */
export const GAME_DIFFICULTY_LABELS_ZH: Record<(typeof GAME_DIFFICULTY_LEVELS)[number], string> = {
  veryEasy: '极简',
  easy: '简单',
  medium: '中等',
  hard: '困难',
  expert: '专家',
};

/**
 * FEAT-O01 (docs/v0.5.4.md §2): the badge is a **tint**, so cover + name stay the loudest thing.
 *
 * v0.7.8：值从 5 个写死的浅色 hex 换成 CSS 变量。原来是浅色专用 —— 深色界面里
 * 会跳出 5 块亮色补丁。变量的两套取值定义在 `web/src/index.css`（竹青 → 芽绿 →
 * 赭黄 → 柿橙 → 绛，一根单向热力坡，不是五个分类色）。调用处是内联 style，
 * 所以这里只能是 `var(...)` 字符串，不参与任何服务端逻辑。
 *
 * v0.7.13：外面必须补一层 `hsl(...)`。`index.css` 里存的是 HSL **三元组**
 * （`150 34% 92%`，与 `--background` 等所有 token 同一约定），而内联
 * `background-color: var(--difficulty-*-bg)` 展开后是 `background-color: 150 34% 92%`
 * —— 不是合法颜色值，浏览器整条丢弃，徽章就只剩文字、没有底色。`hsl()` 写在
 * 这里而不是变量里，是为了不破坏「三元组供 `hsl(var(--x) / <alpha>)` 复用」的约定。
 *
 * v0.8.6：主题可以给每一档指定颜色了，这两张表退成**兜底** —— 没指定颜色的档
 * 仍按位置落在坡上，存量主题一个像素都不变。
 */
export const GAME_DIFFICULTY_COLORS: Record<(typeof GAME_DIFFICULTY_LEVELS)[number], string> = {
  veryEasy: 'hsl(var(--difficulty-very-easy-bg))',
  easy: 'hsl(var(--difficulty-easy-bg))',
  medium: 'hsl(var(--difficulty-medium-bg))',
  hard: 'hsl(var(--difficulty-hard-bg))',
  expert: 'hsl(var(--difficulty-expert-bg))',
};

/** FEAT-O01 §2.2: a tint needs a dark label — white on a tint was unreadable. */
export const GAME_DIFFICULTY_TEXT_COLORS: Record<
  (typeof GAME_DIFFICULTY_LEVELS)[number],
  string
> = {
  veryEasy: 'hsl(var(--difficulty-very-easy-fg))',
  easy: 'hsl(var(--difficulty-easy-fg))',
  medium: 'hsl(var(--difficulty-medium-fg))',
  hard: 'hsl(var(--difficulty-hard-fg))',
  expert: 'hsl(var(--difficulty-expert-fg))',
};

/** FEAT-G02: the default tier pre-selected in the deploy dialog —— 第 3 档（原 `medium`）。 */
export const GAME_DIFFICULTY_DEFAULT_LEVEL = 3;

/**
 * v0.8.6：档位数字的取值区间。
 *
 * 数字**就是**顺序 —— 1 是最容易的一档，也是落进 `games.difficulty` 的值。上限
 * 99 而不是 5：主题可以删档，删掉中间一档后后面那些不必重编号（重编号等于把
 * 已经在用的关卡集体搬走），留出空档才是对的。
 */
export const GAME_DIFFICULTY_LEVEL_MIN = 1;
export const GAME_DIFFICULTY_LEVEL_MAX = 99;

/**
 * v0.8.6：内置那条热力坡的**取色点**（浅色主题下的前景色 hex）。
 *
 * 主题没给某一档指定颜色时，徽章仍按这一档在分级里的位置落在这条坡上 —— 视觉与
 * v0.8.3 完全一致，存量主题不需要补数据。分级弹窗里的取色器也拿它当初始值，
 * 于是「打开弹窗看到的那颗色」就是徽章此刻正在用的色。
 */
export const GAME_DIFFICULTY_RAMP_HEX = [
  '#285d44',
  '#2f5c2d',
  '#714e19',
  '#7a3d1f',
  '#802b28',
] as const;

/** v0.8.6：主题自定义的难度色 —— 只收 `#rrggbb`（取色器给的就是这个）。 */
export const THEME_DIFFICULTY_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/** v0.8.3：一个主题最多定义几档难度 —— 超过一屏就没人读得完，也没人会做。 */
export const THEME_DIFFICULTY_TIER_MAX = 12;
/** v0.8.3：档位名是徽章上的字，太长会把徽章撑成一整行。 */
export const THEME_DIFFICULTY_LABEL_MAX_LENGTH = 12;

/** FEAT-G02: game name bounds (same width as a map name). */
export const GAME_NAME_MAX_LENGTH = 100;

/**
 * v0.8.3：展示顺序的取值区间（`games.sort_weight`）。
 *
 * 有上下界不是洁癖：这一列是作者手填的整数，没有界的整数输入框意味着
 * `999999999` 也能提交，然后所有其他行都被这一行挤到后面去。±999 够排任何
 * 真实的关卡集，又短到能在输入框里一眼读完。
 */
export const GAME_SORT_WEIGHT_MIN = -999;
export const GAME_SORT_WEIGHT_MAX = 999;
/** 没设过时的值；也是所有存量行的值 —— 于是它们按访问路径排。 */
export const GAME_SORT_WEIGHT_DEFAULT = 0;

/** FEAT-G02: covers are the widest artwork in the app, so they get their own cap. */
export const GAME_COVER_MAX_DIMENSION = 960;

/** FEAT-H03 / OPT-H04: map covers share the 16:10 frame with game covers. */
export const MAP_COVER_ASPECT = 16 / 10;
/** FEAT-H03: stored map covers are capped like game covers. */
export const MAP_COVER_MAX_DIMENSION = 960;

/** v0.7.1 §7.5: puzzle covers reuse the map's frame and cap. */
export const PUZZLE_COVER_MAX_DIMENSION = 960;

/** SPEC-G01: a cell holds a 3×3 grid of participant numbers; number font is `cellSize / 4`. */
export const GAME_NUMBER_GRID = 3;
export const GAME_NUMBER_GRID_CELLS = GAME_NUMBER_GRID * GAME_NUMBER_GRID;
export const GAME_NUMBER_FONT_RATIO = 0.25;
export const GAME_NUMBER_STROKE_RATIO = 0.08;

/** SPEC-G01 §7.1: the forbidden `×`, as a fraction of the cell size. */
export const GAME_FORBIDDEN_FONT_RATIO = 0.62;

/** SPEC-G02: the tool-hint `×` glyph — deep green with a black stroke. */
export const GAME_TOOL_HINT_FORBIDDEN_COLOR = '#15803D';
export const GAME_TOOL_HINT_ERASER_COLOR = '#374151';

/** SPEC-G04: long-pressing the clear button wipes the whole board. */
export const GAME_LONG_PRESS_MS = 500;

/**
 * v0.9.2 §3：「长按清空全部」的阈值 —— **500 → 800ms**，比棋格的 500 更长。
 *
 * 两个长按的后果不是一个量级：棋格长按是「把这一位放到这一格」，放错了撤销一步
 * 就回来了；清除按钮长按是把**整盘放置一次抹掉**，虽然也能回退，但那是全盘消失
 * 再回来，读起来像丢过东西。同一个 500ms 让这两件事的手感一样轻，而后者明显
 * 该更「难触发」一点。
 *
 * 只加长清除这一枚：棋格那边仍是 {@link GAME_LONG_PRESS_MS}。两个数各管一件事，
 * 别再合并回去 —— 合并那天一定会有人为了让清空更安全而顺带把放置也拖慢。
 */
export const GAME_CLEAR_LONG_PRESS_MS = 800;

// ---- v0.9.3 submit check (docs/v0.9.3.md) ----
/**
 * v0.9.3：提交后**逐人校验**的节奏。
 *
 * 一次提交要把所有参与者挨个圈一遍。两段时间分开：
 *   - `GAME_CHECK_RING_SWEEP_MS`：那一圈从 0 扫到满 —— 它表示「正在核对这一位」；
 *   - `GAME_CHECK_STEP_MS`：到下一位的间隔（含扫完后那一小段停顿）。
 *
 * 为什么是 480 而不是更快：这一步是**给人看的**，不是计算。扫得太快读成「闪了
 * 一下」；停留太短又会让前面几位的颜色来不及被看见。9 位参与者约 4.3s，是这段
 * 演出能接受的上限 —— 再长就该让玩家等得不耐烦了。
 */
export const GAME_CHECK_RING_SWEEP_MS = 360;
export const GAME_CHECK_STEP_MS = 480;

/**
 * v0.9.6：校验**通过**之后，「定案 + 印章」在地图遮罩上停多久再弹结算卡。
 *
 * 用途是让那枚印落定：`.stamp-press` 的动效 420ms（从 1.7 倍 −18° 落到正位），
 * 停 1s 意味着动画跑完还留了半秒让玩家看见。短于动画时长就成了「弹窗盖着印在
 * 底下动」，那等于没做这个效果；太长会让玩家干等。
 */
export const GAME_VERDICT_HOLD_MS = 1000;

/**
 * v0.9.3：校验圈的两档颜色（主题里可改，这里是缺省）。
 *
 * 绿 = 通过、红 = 未通过 —— 是「对 / 错」的语义，不是股市那套涨跌色。地图是作者
 * 上传的照片，什么底色都有，所以这两个值刻意取深一档（600 而不是 500）：浅绿
 * 压在浅色地砖上会糊掉。
 */
export const THEME_CHECK_PASS_COLOR = '#16A34A';
export const THEME_CHECK_FAIL_COLOR = '#DC2626';

/**
 * v0.7.11：长按进度环的**出场延迟**。
 *
 * 环此前在 pointerdown 的第一帧就画出来，于是「点一下放编号」也会闪一下环 ——
 * 单点根本不会长按，闪出来的环只是在说一件不会发生的事。延迟到 160ms 之后再
 * 挂载，单点（绝大多数点击都在 120ms 内抬手）就什么都看不见。
 *
 * 环因此只画**剩下的** `GAME_LONG_PRESS_MS - GAME_PRESS_RING_DELAY_MS`，
 * 画满的那一帧仍是动作发生的那一帧（见 `PressRing`）。清除按钮用的是同一个
 * 延迟，只是总长换成 `GAME_CLEAR_LONG_PRESS_MS`（v0.9.2 §3）。
 */
export const GAME_PRESS_RING_DELAY_MS = 160;
/** SPEC-G04: the undo stack keeps at most this many placement steps. */
export const GAME_PLACEMENT_HISTORY_MAX = 200;

/** SPEC-G03: the toolbar / participant-placement modes are mutually exclusive. */
export const GAME_TOOL_MODES = ['forbidden', 'clearing'] as const;

// ---- v0.4.1 games (docs/v0.4.1.md §4 / §5) ----
/** OPT-W04: the access path is `puzzle-` + slugified name + `-` + slugified difficulty. */
export const GAME_SLUG_PREFIX = 'puzzle';
export const GAME_SLUG_MIN_LENGTH = 3;
/** Doubles as the DB column width of `games.slug`. */
export const GAME_SLUG_MAX_LENGTH = 80;
/** Only lower-case letters, digits and single dashes — no unicode, no spaces. */
export const GAME_SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * OPT-W04 §4.3: difficulty → URL segment (never leak `veryEasy` camelCase).
 *
 * v0.8.6：难度不再落进新路径（v0.8.1 就去掉了后缀），这张表只剩「剥掉老路径
 * 尾部的难度后缀」一个用途。
 */
export const GAME_DIFFICULTY_SLUGS: Record<(typeof GAME_DIFFICULTY_LEVELS)[number], string> = {
  veryEasy: 'very-easy',
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
  expert: 'expert',
};

/** SPEC-G05 §5.3: an already-placed participant fades out in the read-only roster. */
export const GAME_PLACED_OPACITY = 0.45;

/**
 * v0.6.4 (docs/v0.6.4.md §3): how much the touched / clicked participant's
 * avatar is magnified by on the board, so the player can see where that
 * participant currently sits. A modest scale keeps the avatar inside its
 * neighbourhood — it is a hint, not a zoom.
 */
export const GAME_ACTIVE_PARTICIPANT_AVATAR_SCALE = 1.3;
/**
 * v0.6.4 §3: the same magnification for that participant's 编号 glyphs. Only
 * the active participant's own numbers grow — a cell shared with other
 * participants keeps their glyphs at the normal size.
 */
export const GAME_ACTIVE_PARTICIPANT_NUMBER_SCALE = 1.5;

// ---- v0.8.7 §7：游戏页工具按钮的图标（docs/v0.8.7.md §7） ----
/**
 * 游戏页右列那三枚**动作按钮**：清除、撤回、提交。
 *
 * 它们和标记是两件事：标记是玩家画在格子里的**符号**（放置层 / 提示层 /
 * 工具栏三处同图），而这三枚只是按钮上的画。所以存储也分开（`toolIcons` 与
 * `mark` 各一个键），解析顺序却相同：谜题自己的 → 主题的 → 内置图标。
 *
 * v0.9.5：这四样（标记 + 三枚按钮）在配置页里并进了**同一个模块**，
 * 因为作者改的是「这一套操作长什么样」，分两处会让人以为它们无关。
 */
export const GAME_TOOL_ICON_KINDS = ['clear', 'undo', 'submit'] as const;
export type GameToolIconKind = (typeof GAME_TOOL_ICON_KINDS)[number];

/**
 * 三枚按钮的中文名。放在 shared 而不是 `web`：服务端导出资源包时也要用它们报
 * 「图标（撤回）的图不在了」，两处各写一份迟早会有一处写成「撤销」。
 */
export const GAME_TOOL_ICON_LABELS: Record<GameToolIconKind, string> = {
  clear: '清除',
  undo: '撤回',
  submit: '提交',
};
