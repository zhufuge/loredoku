import multer from '@koa/multer';
import { UPLOAD_MAX_SIZE } from '@murdoku/shared';

export const cardImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_SIZE, files: 1 },
});
