import multer from '@koa/multer';
import { UPLOAD_MAX_SIZE } from '@loredoku/shared';

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_SIZE, files: 1 },
});

export const assetImageUpload = imageUpload;
export const characterAvatarUpload = imageUpload;
export const gameCoverUpload = imageUpload;
/** FEAT-H03 (docs/v0.4.2.md §3.2c): the map cover rides the same reader. */
export const mapCoverUpload = imageUpload;
/** v0.7.1 §7.5: the puzzle cover rides the same reader. */
export const puzzleCoverUpload = imageUpload;
/** v0.8.6 §4；v0.9.5 更名：**符号小图** —— 标记 / 工具图标 / 圆环共用同一个 reader。 */
export const symbolImageUpload = imageUpload;
