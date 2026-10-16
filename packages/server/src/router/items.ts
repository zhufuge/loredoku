import Router from '@koa/router';
import { itemImageUpload } from '../middleware/upload';
import * as controller from '../controller/itemController';

export const itemsRouter = new Router();

itemsRouter.get('/', controller.list);
itemsRouter.post('/', controller.create);
itemsRouter.get('/:id', controller.detail);
itemsRouter.patch('/:id', controller.update);
itemsRouter.delete('/:id', controller.remove);
itemsRouter.post('/:id/enable', controller.enable);
itemsRouter.post('/:id/disable', controller.disable);
itemsRouter.get('/:id/usages', controller.usages);
// v0.5.2 FEAT-M03: the `PUT /:id/triggers` route was removed with the table.
itemsRouter.post('/:id/image', itemImageUpload.single('file'), controller.uploadImage);
itemsRouter.delete('/:id/image', controller.deleteImage);
