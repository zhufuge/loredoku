import Router from '@koa/router';
import { assetImageUpload } from '../middleware/upload';
import * as controller from '../controller/assetController';

export const assetsRouter = new Router();

assetsRouter.get('/', controller.list);
assetsRouter.post('/', controller.create);
assetsRouter.get('/:id', controller.detail);
assetsRouter.patch('/:id', controller.update);
assetsRouter.delete('/:id', controller.remove);
assetsRouter.post('/:id/enable', controller.enable);
assetsRouter.post('/:id/disable', controller.disable);
assetsRouter.get('/:id/usages', controller.usages);
// v0.5.2 FEAT-M03: the `PUT /:id/triggers` route was removed with the table.
assetsRouter.post('/:id/image', assetImageUpload.single('file'), controller.uploadImage);
assetsRouter.delete('/:id/image', controller.deleteImage);
