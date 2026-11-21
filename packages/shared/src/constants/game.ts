// 游戏：难度、结算、工具图标、部署清单。 按主题收拢游戏相关的常量：值、注释、次序稳定，「谁在用」相近的放在一起，改一处不必翻遍整个 `constants/`。 对外是同一组名字：`constants/index.ts` 全部再导出，`@loredoku/shared` 不变。

// ---- v0.4.0 games (docs/v0.4.0.md §5 / §7 / §10) ----
/** v0.4 的内置五档**名字**。 难度在库里存的是**数字档位**（`games.difficulty` 已经是 smallint），这五个名字只剩两处还在用：v0.8.1 之前的老路径里剥难度后缀（`GAME_DIFFICULTY_SLUGS`）， 以及 v0.8.6 那条迁移把旧值换成数字。 界面上一个都不会出现 —— 徽章上的字来自主题的 `difficultyLevels[].label`。 */
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
 * FEAT-O01 (docs/v0.5.4.md §2)：徽章是**淡色底**，所以封面与名字仍是最响的。值必须是 CSS 变量（浅 / 深色各一套，写死的浅色 hex 在深色界面会跳出亮补丁），且外面**必须补一层 `hsl(...)`** —— `index.css` 存的是 HSL **三元组**（`150 34% 92%`），直接展开不是合法颜色，整条会被浏览器丢弃、徽章只剩文字。这张表是**兜底**：没指定颜色的档按位置落在热力坡上。
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

/** 档位数字的取值区间。 数字**就是**顺序 —— 1 是最容易的一档，也是落进 `games.difficulty` 的值。上限 99 而不是 5：主题可以删档，删掉中间一档后后面那些不必重编号（重编号等于把已经在用的关卡集体搬走），留出空档才是对的。 */
export const GAME_DIFFICULTY_LEVEL_MIN = 1;
export const GAME_DIFFICULTY_LEVEL_MAX = 99;

/** 内置那条热力坡的**取色点**（浅色主题下的前景色 hex）。 主题没给某一档指定颜色时，徽章按这一档在分级里的位置落在这条坡上 —— 视觉与内置五档完全一致，存量主题不需要补数据。分级弹窗里的取色器也拿它当初始值， 于是「打开弹窗看到的那颗色」就是徽章此刻正在用的色。 */
export const GAME_DIFFICULTY_RAMP_HEX = [
  '#285d44',
  '#2f5c2d',
  '#714e19',
  '#7a3d1f',
  '#802b28',
] as const;

/** 主题自定义的难度色 —— 只收 `#rrggbb`（取色器给的就是这个）。 */
export const THEME_DIFFICULTY_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/** 一个主题最多定义几档难度 —— 超过一屏就没人读得完，也没人会做。 */
export const THEME_DIFFICULTY_TIER_MAX = 12;
/** 档位名是徽章上的字，太长会把徽章撑成一整行。 */
export const THEME_DIFFICULTY_LABEL_MAX_LENGTH = 12;

/** FEAT-G02: game name bounds (same width as a map name). */
export const GAME_NAME_MAX_LENGTH = 100;

/** 展示顺序的取值区间（`games.sort_weight`）。 有上下界不是洁癖：这一列是作者手填的整数，没有界的整数输入框意味着 `999999999` 也能提交，然后所有其他行都被这一行挤到后面去。±999 够排任何真实的关卡集，又短到能在输入框里一眼读完。 */
export const GAME_SORT_WEIGHT_MIN = -999;
export const GAME_SORT_WEIGHT_MAX = 999;
/** 没设过时的值；也是所有存量行的值 —— 于是它们按访问路径排。 */
export const GAME_SORT_WEIGHT_DEFAULT = 0;

/** FEAT-G02: covers are the widest artwork in the app, so they get their own cap. */
export const GAME_COVER_MAX_DIMENSION = 960;

/** v0.11.0（docs/v0.11.0.md §3）：导出包里关卡封面的统一长边。 上传时那份 960 是**展示**用的（工坊卡片、详情页）；下载包里的封面只在播放器列表卡片上画几百像素，搬原图进包只是让 zip 变大、多花一次流量。768 是「列表卡片 ×2 倍屏仍够」与「体积」之间的折中，导出时从原图现转 webp。 */
export const BUNDLE_COVER_MAX_DIMENSION = 768;

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
 * v0.9.2 §3：「长按清空全部」的阈值 —— **500 → 800ms**，比棋格的 500 更长。两者的后果不是一个量级：棋格放错撤销一步就回来，清空是**整盘一次抹掉**，该更难触发。棋格那边仍是 {@link GAME_LONG_PRESS_MS}，两个数别再合并回去。
 */
export const GAME_CLEAR_LONG_PRESS_MS = 800;

// ---- v0.9.3 submit check (docs/v0.9.3.md) ----
/**
 * 提交后**逐人校验**的节奏：`GAME_CHECK_RING_SWEEP_MS` 是那一圈从 0 扫到满（表示「正在核对这一位」），`GAME_CHECK_STEP_MS` 是到下一位的间隔（含扫完后那一小段停顿）。两段都是**给人看的**，扫太快读成闪了一下、停留太短颜色来不及被看见。
 */
export const GAME_CHECK_RING_SWEEP_MS = 360;
export const GAME_CHECK_STEP_MS = 480;

/** 校验**通过**之后，「定案 + 印章」在地图遮罩上停多久再弹结算卡。 用途是让那枚印落定：`.stamp-press` 的动效 420ms（从 1.7 倍 −18° 落到正位）， 停 1s 意味着动画跑完还留了半秒让玩家看见。短于动画时长就成了「弹窗盖着印在底下动」，那等于没做这个效果；太长会让玩家干等。 */
export const GAME_VERDICT_HOLD_MS = 1000;

/** 校验圈的两档颜色（主题里可改，这里是缺省）。 绿 = 通过、红 = 未通过 —— 是「对 / 错」的语义，不是股市那套涨跌色。地图是作者上传的照片，什么底色都有，所以这两个值刻意取深一档（600 而不是 500）：浅绿压在浅色地砖上会糊掉。 */
export const THEME_CHECK_PASS_COLOR = '#16A34A';
export const THEME_CHECK_FAIL_COLOR = '#DC2626';

/** 结算卡通过那一面的**内置图标与标题**（主题里可改，这里是缺省）。 标题取「解题成功」：定案说的是「已落槌」，而玩家刚做完的是一道题 —— 这一屏在夸的是解题这件事本身。 图标与标题分开配，所以这个 emoji **不写进** `THEME_VERDICT_TITLE_FALLBACK`。 */
export const THEME_VERDICT_ICON_FALLBACK = '🎉';
export const THEME_VERDICT_TITLE_FALLBACK = '解题成功';
/** 两项都可留空（= 用内置），所以只限上界：足够长，又不至于把一行撑断。 */
export const THEME_VERDICT_TEXT_MAX_LENGTH = 24;

/** 游戏列表页那两行字的内置模板（主题里可改，这里是缺省）。 模板里那个 `{n}` 是**关数**的占位符，界面渲染时换成数字 —— 给模板而不是给整句， 是因为同一个数字在这两行里说的事不一样（一共几关 / 已经过了几关），作者要改的是说法，不是那个数。 */
export const THEME_GAME_LIST_PLAYABLE_FALLBACK = '{n} 关可玩';
export const THEME_GAME_LIST_PASSED_FALLBACK = '已通过 {n} 关';
/** 模板里的占位符。schema 会要求文案里至少出现一次，否则数字没地方落。 */
export const THEME_GAME_LIST_COUNT_TOKEN = '{n}';
/** 与结算卡同一档上界：一句列表说明，超过这个长度会把这行挤成两行。 */
export const THEME_GAME_LIST_TEXT_MAX_LENGTH = 24;

/**
 * 长按进度环的**出场延迟**：环 160ms 之后才挂载 —— 单点根本不会长按（多数点击在 120ms 内抬手），第一帧就画会闪一下「一件不会发生的事」。所以环只画**剩下的** `GAME_LONG_PRESS_MS - GAME_PRESS_RING_DELAY_MS`，画满那一帧仍是动作发生的那一帧；清除按钮用同一延迟，总长换成 `GAME_CLEAR_LONG_PRESS_MS`。
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

/** OPT-W04 §4.3: difficulty → URL segment (never leak `veryEasy` camelCase). 难度不进新路径，这张表只剩一个用途：剥掉老路径尾部的难度后缀。 */
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
 * v0.6.4 (docs/v0.6.4.md §3): how much the touched / clicked participant's avatar is magnified on the board, so the player can see where that participant sits. A modest scale keeps it a hint, not a zoom.
 */
export const GAME_ACTIVE_PARTICIPANT_AVATAR_SCALE = 1.3;
/** v0.6.4 §3: the same magnification for that participant's 编号 glyphs. Only the active participant's own numbers grow — a cell shared with other participants keeps their glyphs at the normal size. */
export const GAME_ACTIVE_PARTICIPANT_NUMBER_SCALE = 1.5;

// ---- v0.8.7 §7：游戏页工具按钮的图标（docs/v0.8.7.md §7） ----
/** 游戏页右列那三枚**动作按钮**：清除、撤回、提交。 它们和标记是两件事：标记是玩家画在格子里的**符号**（放置层 / 提示层 / 工具栏三处同图），而这三枚只是按钮上的画。所以存储也分开（`toolIcons` 与 `mark` 各一个键），解析顺序却相同：谜题自己的 → 主题的 → 内置图标。 这四样（标记 + 三枚按钮）在配置页里是**同一个模块**：作者改的是「这一套操作长什么样」，分两处会让人以为它们无关。 */
export const GAME_TOOL_ICON_KINDS = ['clear', 'undo', 'submit'] as const;
export type GameToolIconKind = (typeof GAME_TOOL_ICON_KINDS)[number];

/** 三枚按钮的中文名。放在 shared 而不是 `web`：服务端导出资源包时也要用它们报「图标（撤回）的图不在了」，两处各写一份迟早会有一处写成「撤销」。 */
export const GAME_TOOL_ICON_LABELS: Record<GameToolIconKind, string> = {
  clear: '清除',
  undo: '撤回',
  submit: '提交',
};
