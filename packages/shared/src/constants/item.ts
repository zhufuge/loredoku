// // 物品层：内边距、悬停、名称提示、展示变换。
// v0.10.4：从 `constants.ts`（1324 行、287 个导出）按主题拆开。值、注释、次序一律
// 照搬 —— 只是把「谁在用」相近的那些放在一个文件里，改一处不必在一千行里翻。
// 对外仍是同一组名字：`constants/index.ts` 全部再导出，`@loredoku/shared` 不变。

// ---- OPT-C06 物品层内边距 ----
/** OPT-C06 (docs/v0.3.7.md §OPT-C06): item artwork is inset so it never touches the grid lines. */
export const ITEM_PADDING_BASE = 4;
export const ITEM_PADDING_MIN = 2;
export const ITEM_PADDING_MAX = 12;

// ---- OPT-902 §2.3 物品悬停 ----
/** The item image stretches upward by this many pixels while hovered. */
export const ITEM_HOVER_LIFT_PX = 4;
export const ITEM_HOVER_TRANSITION_MS = 120;

// ---- v0.7.13 物品名称提示（docs/v0.7.13.md §2 / v0.8.7 §8） ----
/**
 * 悬停多久之后报出物品名称。
 *
 * v0.7.13 定的是 1s，理由是「墙面上的物品按格密排，320ms 会变成提示雨」。v0.8.7 §8
 * 把提示改成**跟着光标走**之后，那个顾虑的一半就不成立了：一块跟着指头的纸片是
 * 「我在看这个」，不是「路上冒出来一张卡片」。于是对齐全站 Tooltip 的 320ms ——
 * 同一块屏上不该有两套「多久算停下来」。路过仍然不会触发：320ms 内划过去，计时器
 * 连开都来不及。
 */
export const ITEM_NAME_TIP_DELAY_MS = 320;

// ---- v0.7.5 物品展示变换（docs/v0.7.5.md §3） ----
/**
 * 已放置物品的**展示**变换：等比例缩放 + 按格偏移。
 *
 * 只影响画出来的那一块，不动脚位（`w` × `h`）—— 脚位是占格 / 擦除 / 碰撞的依据，
 * 展示是「这张图看起来多大、歪到哪儿」。两者分开，作者可以放大一幅装饰树而不
 * 让它变成 3×3 的占格物。
 *
 * 单位是**格**而不是像素：地图的 `cellSize` 可调，像素偏移换个格子大小就错位了。
 */
export const ITEM_SCALE_MIN = 0.25;
export const ITEM_SCALE_MAX = 4;
export const ITEM_SCALE_STEP = 0.05;
export const ITEM_OFFSET_MIN = -4;
export const ITEM_OFFSET_MAX = 4;
export const ITEM_OFFSET_STEP = 0.05;
export const DEFAULT_ITEM_SCALE = 1;
export const DEFAULT_ITEM_OFFSET = 0;

export interface ItemTransform {
  /** 相对脚位的等比例倍数，1 = 填满脚位。 */
  scale: number;
  /** 以格为单位的水平偏移，正数向右；可超出脚位。 */
  offsetX: number;
  /** 以格为单位的垂直偏移，正数向下。 */
  offsetY: number;
}

/** 变换的存储形状：与默认值相同的字段不写，缺键即默认。 */
export interface ItemTransformOverride {
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

const clampRound = (value: number | undefined, min: number, max: number, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  // 两位小数：`0.05` 的步长存成 `0.30000000000000004` 只会让草稿难读。
  return Math.round(clamped * 100) / 100;
};

/**
 * 缺键 / 手改 JSON / 老草稿的唯一收口：把三个字段夹到合法区间，缺省给默认值。
 *
 * 渲染与 store 都走这里，所以「画布上看到的」和「写回草稿的」永远是同一个数。
 */
export function resolveItemTransform(item?: ItemTransformOverride | null): ItemTransform {
  return {
    scale: clampRound(item?.scale, ITEM_SCALE_MIN, ITEM_SCALE_MAX, DEFAULT_ITEM_SCALE),
    offsetX: clampRound(item?.offsetX, ITEM_OFFSET_MIN, ITEM_OFFSET_MAX, DEFAULT_ITEM_OFFSET),
    offsetY: clampRound(item?.offsetY, ITEM_OFFSET_MIN, ITEM_OFFSET_MAX, DEFAULT_ITEM_OFFSET),
  };
}

/** 这个变换是不是恒等（`scale=1` 且不偏移）：是就不必写进草稿。 */
export function isIdentityItemTransform(transform: ItemTransform): boolean {
  return (
    transform.scale === DEFAULT_ITEM_SCALE &&
    transform.offsetX === DEFAULT_ITEM_OFFSET &&
    transform.offsetY === DEFAULT_ITEM_OFFSET
  );
}
