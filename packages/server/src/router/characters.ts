import Router from '@koa/router';
import { characterAvatarUpload } from '../middleware/upload';
import * as controller from '../controller/characterController';

export const charactersRouter = new Router();

charactersRouter.get('/', controller.list);
charactersRouter.post('/', controller.create);
charactersRouter.get('/:id', controller.detail);
charactersRouter.patch('/:id', controller.update);
charactersRouter.delete('/:id', controller.remove);
charactersRouter.get('/:id/usages', controller.usages);
charactersRouter.post('/:id/avatar', characterAvatarUpload.single('file'), controller.uploadAvatar);
charactersRouter.delete('/:id/avatar', controller.deleteAvatar);
