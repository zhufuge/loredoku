import multer from '@koa/multer';
import { UPLOAD_MAX_SIZE } from '@loredoku/shared';

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_SIZE, files: 1 },
});

export const cardImageUpload = imageUpload;
export const itemImageUpload = imageUpload;
export const characterAvatarUpload = imageUpload;
export const gameCoverUpload = imageUpload;
/** FEAT-H03 (docs/v0.4.2.md §3.2c): the map cover rides the same reader. */
export const projectCoverUpload = imageUpload;
