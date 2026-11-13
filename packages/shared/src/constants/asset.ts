// // 资源库：背景 / 物品两类图案。
// v0.10.4：从 `constants.ts`（1324 行、287 个导出）按主题拆开。值、注释、次序一律
// 照搬 —— 只是把「谁在用」相近的那些放在一个文件里，改一处不必在一千行里翻。
// 对外仍是同一组名字：`constants/index.ts` 全部再导出，`@loredoku/shared` 不变。

// ---- Asset（资源库：背景 / 物品两类图案） ----
// v0.6.0: 「物品」这个词让给了画布上的物件层，资源库改叫 assets；原来的
// `category` 换成 `type`，取值 `object` 改为 `item`。
export const ASSET_NAME_MAX_LENGTH = 100;
export const ASSET_CODE_MAX_LENGTH = 64;
export const ASSET_CODE_PATTERN = /^[A-Za-z0-9_]+$/;
export const ASSET_TYPES = ['background', 'item'] as const;
export const DEFAULT_ASSET_TYPE = 'item';
export const ASSET_TYPE_LABELS: Record<(typeof ASSET_TYPES)[number], string> = {
  background: '背景',
  item: '物品',
};
export const ASSET_FIT_MODES = ['cover', 'contain'] as const;
export const DEFAULT_ASSET_FIT_MODE = 'cover';
// v0.6.1: 形态（asset_variants，当时叫 asset_forms）—— 一个资源的多种「样子」。
// v0.7.6: 占格搬到「每次放置」上（恒 1 格），形态只管长相。
// v0.10.6: 占格又回到形态上（`w` / `h`，缺省 1×1）—— 一张床横跨 2 格，尺寸属于
// 「这个形态长什么样」，而不是「这一次放哪儿」。上限跟画布最大格数一致。
export const ASSET_VARIANT_NAME_MAX_LENGTH = 32;
export const DEFAULT_ASSET_VARIANT_NAME = '默认';
export const ASSET_VARIANT_FOOTPRINT_MIN = 1;
export const ASSET_VARIANT_FOOTPRINT_MAX = 24;
export const ASSET_VARIANT_FOOTPRINT_DEFAULT = 1;
