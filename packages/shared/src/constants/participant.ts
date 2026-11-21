// 参与者区与名册布局。
// 对外仍是同一组名字：`constants/index.ts` 全部再导出，`@loredoku/shared` 不变。

// ---- OPT-B06 参与者区（docs/v0.3.6.md §6） ----
/** Minimum participant cell width; the height stays at the v0.3.5 value. */
export const PARTICIPANT_MIN_WIDTH = 110;
/** Participant title bar height, kept in sync with the asset panel header. */
export const PARTICIPANT_HEADER_HEIGHT = 40;
/** Participant cell minimum height. */
export const PARTICIPANT_MIN_HEIGHT = 104;
/** Clue display area under the avatar (3 lines). */
export const PARTICIPANT_CLUE_HEIGHT = 72;
/** FEAT-O12 (docs/v0.5.4.md §6.1): height of the character name row between avatar and clue. */
export const PARTICIPANT_NAME_HEIGHT = 20;
/** Gap between participant cells. */
export const PARTICIPANT_CELL_GAP = 14;
/** Minimum avatar diameter. */
export const PARTICIPANT_AVATAR_MIN = 56;
/** The slot card's corner radius. The sequence badge rounds its top-left with it. */
export const PARTICIPANT_SLOT_RADIUS = 6;
/** OPT-B06 §6.3 + FEAT-O13 (docs/v0.5.4.md §6.2): sequence badge in the top-left corner, enlarged. */
export const PARTICIPANT_SEQ_SIZE = 20;
export const PARTICIPANT_SEQ_FONT_SIZE = 14;
export const PARTICIPANT_SEQ_COLOR = '#374151';
/** Translucent white so the badge stays readable on any theme colour. */
export const PARTICIPANT_SEQ_BACKGROUND = 'rgba(255,255,255,0.85)';
export const PARTICIPANT_SEQ_BORDER = '1px solid rgba(0,0,0,0.1)';
/** FEAT-O13: TL corner is `卡片半径 − 描边`（6 − 1），不是卡片半径本身 —— 徽标贴在 padding box 角上，用外圆角会露出一道月牙形卡纸；只有 BR 另有圆角。 */
export const PARTICIPANT_SEQ_BORDER_RADIUS = `${PARTICIPANT_SLOT_RADIUS - 1}px 0 6px 0`;
/** Kept for the callers that still inset the badge (0 = corner, see §6.2). */
export const PARTICIPANT_SEQ_INSET = 0;
/** v0.6.4 (docs/v0.6.4.md §2): max length of a participant's configured 编号展示 text. The badge grows around its text, so the bound keeps a long label from taking over the slot's corner. */
export const PARTICIPANT_DISPLAY_NUMBER_MAX = 6;
/** v0.7.13 (docs/v0.7.13.md §11): 编号 default; same bound as {@link PARTICIPANT_DISPLAY_NUMBER_MAX} — 同一枚徽标，两者分叉会让已存默认值过不了保存校验。 */
export const CHARACTER_DISPLAY_NAME_MAX = PARTICIPANT_DISPLAY_NUMBER_MAX;

// ---- v0.6.3 参与者布局（docs/v0.6.3.md §3） ----
/** 面板宽度按列数推算，这份 padding 是算式的一部分；Tailwind 类一旦漂移，面板会比自身内容窄 8px。 */
export const ROSTER_PANEL_PADDING = 8;
/** aside 是 `border-box`，这 1px 要从算式算出的宽度里扣；漏掉它内容盒就窄 1px，够把横向滚动条带回来。 */
export const ROSTER_PANEL_BORDER_WIDTH = 1;
/** The panel never goes below the width it had before it became resizable. */
export const ROSTER_PANEL_MIN_WIDTH = 256;
/** Past ROSTER_COLS_MAX the panel stops growing here and scrolls instead. */
export const ROSTER_PANEL_MAX_WIDTH = 512;
/** 基本信息 可填的最大列数，也是面板不出现横向滚动条的最宽值；超出的存量值按上限渲染并滚动，不挤走画布。 */
export const ROSTER_COLS_MAX = 6;
