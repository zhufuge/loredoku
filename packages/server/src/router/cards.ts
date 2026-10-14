import Router from '@koa/router';
import { cardImageUpload } from '../middleware/upload';
import * as controller from '../controller/cardController';

export const cardsRouter = new Router();

cardsRouter.get('/', controller.list);
cardsRouter.post('/', controller.create);
cardsRouter.get('/:id', controller.detail);
cardsRouter.patch('/:id', controller.update);
cardsRouter.delete('/:id', controller.remove);
cardsRouter.get('/:id/usages', controller.usages);
cardsRouter.put('/:id/triggers', controller.replaceTriggers);
cardsRouter.post('/:id/image', cardImageUpload.single('file'), controller.uploadImage);
cardsRouter.delete('/:id/image', controller.deleteImage);
