import Router from '@koa/router';
import * as regionController from '../controller/regionController';

export const regionsRouter = new Router();

regionsRouter.patch('/:regionId', regionController.update);
regionsRouter.delete('/:regionId', regionController.remove);
