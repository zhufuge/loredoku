import Router from '@koa/router';
import { assetImageUpload } from '../middleware/upload';
import * as controller from '../controller/assetController';
import * as formController from '../controller/assetFormController';

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

/**
 * v0.6.1: the look and the footprint belong to a form, so the old asset-level
 * `/:id/image` pair became these form-scoped routes (docs/v0.6.1.md §5.3).
 */
assetsRouter.get('/:id/forms', formController.list);
assetsRouter.post('/:id/forms', formController.create);
assetsRouter.patch('/:id/forms/:formId', formController.update);
assetsRouter.delete('/:id/forms/:formId', formController.remove);
assetsRouter.get('/:id/forms/:formId/usages', formController.usages);
assetsRouter.post(
  '/:id/forms/:formId/image',
  assetImageUpload.single('file'),
  formController.uploadImage,
);
assetsRouter.delete('/:id/forms/:formId/image', formController.deleteImage);
