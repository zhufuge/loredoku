// // 参与者区与名册布局。
// v0.10.4：从 `constants.ts`（1324 行、287 个导出）按主题拆开。值、注释、次序一律
// 照搬 —— 只是把「谁在用」相近的那些放在一个文件里，改一处不必在一千行里翻。
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
/**
 * FEAT-O13: no top / left edge of its own — the card's frame is those two
 * lines; only BR rounds. The top-left rounds with the **card's inner** radius:
 * the badge sits flush in the corner (inset 0), so a square corner there would
 * poke past the card's rounded frame.
 *
 * v0.7.14：TL 是 `卡片半径 − 描边`（6 − 1 = 5），不是卡片半径本身。
 * 徽标贴在**padding box** 的角上（`position:absolute; top/left: 0`，也就是描边
 * 内侧 1px），那一圈内圆角的半径比外圆角小 1px。徽标用外圆角时弧比内弧「切得
 * 更深」，两者之间露出一道月牙形的卡纸 —— 选中时徽标是主色、描边也是主色，
 * 中间那道纸白就像「高亮环和序号之间漏了缝」。
 */
export const PARTICIPANT_SEQ_BORDER_RADIUS = `${PARTICIPANT_SLOT_RADIUS - 1}px 0 6px 0`;
/** Kept for the callers that still inset the badge (0 = corner, see §6.2). */
export const PARTICIPANT_SEQ_INSET = 0;
/**
 * v0.6.4 (docs/v0.6.4.md §2): max length of a participant's configured 编号展示
 * text. The badge grows around its text, so the bound keeps a long label from
 * taking over the slot's corner.
 */
export const PARTICIPANT_DISPLAY_NUMBER_MAX = 6;
/**
 * v0.7.13 (docs/v0.7.13.md §11): `characters.display_name` — the 编号 a
 * character brings into a roster slot. Same bound as
 * {@link PARTICIPANT_DISPLAY_NUMBER_MAX} because it lands on the same badge;
 * the two must never drift apart or a saved default would be rejected on save.
 */
export const CHARACTER_DISPLAY_NAME_MAX = PARTICIPANT_DISPLAY_NUMBER_MAX;

// ---- v0.6.3 参与者布局（docs/v0.6.3.md §3） ----
/**
 * The horizontal padding around the slot matrix. It is a constant because the
 * panel's width is derived from the column count, so the padding has to be
 * part of the arithmetic — a Tailwind class drifting away from it would make
 * the panel 8px too narrow for its own content.
 */
export const ROSTER_PANEL_PADDING = 8;
/**
 * The width of the panel aside's own right border (the separator against the
 * canvas). The aside is `border-box`, so that 1px comes out of the width the
 * arithmetic computes — leaving it out makes the scroll container's content
 * box 1px narrower than the matrix, and a 1px overflow is enough to bring the
 * horizontal scrollbar back.
 */
export const ROSTER_PANEL_BORDER_WIDTH = 1;
/** The panel never goes below the width it had before it became resizable. */
export const ROSTER_PANEL_MIN_WIDTH = 256;
/** Past ROSTER_COLS_MAX the panel stops growing here and scrolls instead. */
export const ROSTER_PANEL_MAX_WIDTH = 512;
/**
 * v0.6.3: the widest column count the 基本信息 field accepts — and, at the
 * same time, the widest the panel still fits without a horizontal scrollbar.
 * A stored count above it (an import, or a puzzle authored before the cap)
 * keeps the capped-and-scrolling layout instead of pushing the canvas away.
 */
export const ROSTER_COLS_MAX = 6;
