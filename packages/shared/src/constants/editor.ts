// // 编辑器工具与上传：图层、工具表、文件限制。
// v0.10.4：从 `constants.ts`（1324 行、287 个导出）按主题拆开。值、注释、次序一律
// 照搬 —— 只是把「谁在用」相近的那些放在一个文件里，改一处不必在一千行里翻。
// 对外仍是同一组名字：`constants/index.ts` 全部再导出，`@loredoku/shared` 不变。

// ---- 历史迁移兼容常量（仅 v0.6.0 之前的迁移文件引用，值冻结为当时语义）----
// v0.6.0 把 `category` 改名为 `type`、取值 `object` 改成 `item`。历史迁移
// `...000008` / `...000009` 描述的是当时的表结构（`items.category` 默认 `'object'`），
// 逻辑一个字都不能改，所以这里保留旧名、冻结旧值。业务代码一律用 ASSET_*。
export const DEFAULT_ITEM_CATEGORY = 'object' as const;
export const DEFAULT_ITEM_FIT_MODE = 'cover' as const;

// ---- Editor layers ----
/** v0.6.0: the canvas layers are `background` and `item` (was `object`). */
export const EDITOR_LAYERS = ['background', 'item'] as const;

// Deprecated (v1 rotation no longer used; kept for legacy migration typings).
export const CARD_ROTATIONS = [0, 90, 180, 270] as const;

// ---- Editor tools ----
export const EDITOR_TOOLS = ['select', 'region', 'character', 'eraser', 'pan'] as const;
export const MAX_HISTORY_STEPS = 50;

// ---- Uploads ----
export const UPLOAD_MAX_SIZE = 2 * 1024 * 1024; // 2 MB
export const UPLOAD_ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const;
export const THUMBNAIL_MAX_DIMENSION = 512;

/**
 * v0.8.6（docs/v0.8.6.md §4）：**符号级小图**的长边上限（像素）。
 *
 * v0.9.5 起这一类图不再只有「禁止符号」：标记、清除 / 回退 / 提交三枚按钮图标、
 * 长按计时环与校验圈都是同一种「作者上传的一张图」，尺寸档也相同 —— 它们最终都
 * 画在「一格」这个尺度上（最大是格子直径，实测 152px 上下），256 已经够 4K 屏。
 * 再大只是让一份谜题 JSON 从几 KB 变成几 MB（图是内联在数据里的，
 * 见 `UploadedImage`）。
 */
export const SYMBOL_IMAGE_MAX_DIMENSION = 256;

/** v0.8.6：`UploadedImage.path` 的长度上限（`storage/uploads` 下的相对路径）。 */
export const SYMBOL_IMAGE_PATH_MAX_LENGTH = 200;
