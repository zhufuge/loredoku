import multer from '@koa/multer';
import { UPLOAD_MAX_SIZE } from '@murdoku/shared';

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_SIZE, files: 1 },
});

export const cardImageUpload = imageUpload;
export const itemImageUpload = imageUpload;
export const characterAvatarUpload = imageUpload;
