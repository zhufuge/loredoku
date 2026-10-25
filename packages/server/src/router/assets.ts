import Router from '@koa/router';
import { assetImageUpload } from '../middleware/upload';
import * as controller from '../controller/assetController';
import * as variantController from '../controller/assetVariantController';

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
 * v0.6.1: the look belongs to a variant, so the old asset-level `/:id/image` pair
 * became these variant-scoped routes (docs/v0.6.1.md §5.3). v0.7.6: renamed
 * `forms` → `variants`; the footprint left both the payload and the table.
 */
assetsRouter.get('/:id/variants', variantController.list);
assetsRouter.post('/:id/variants', variantController.create);
assetsRouter.patch('/:id/variants/:variantId', variantController.update);
assetsRouter.delete('/:id/variants/:variantId', variantController.remove);
assetsRouter.get('/:id/variants/:variantId/usages', variantController.usages);
assetsRouter.post(
  '/:id/variants/:variantId/image',
  assetImageUpload.single('file'),
  variantController.uploadImage,
);
assetsRouter.delete('/:id/variants/:variantId/image', variantController.deleteImage);
