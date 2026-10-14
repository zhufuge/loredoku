import Router from '@koa/router';
import * as controller from '../controller/projectController';
import * as mapController from '../controller/mapController';
import * as regionController from '../controller/regionController';

export const projectsRouter = new Router();

projectsRouter.get('/', controller.list);
projectsRouter.post('/', controller.create);
projectsRouter.get('/:id/map', mapController.getMap);
projectsRouter.put('/:id/map', mapController.saveMap);
projectsRouter.get('/:id/regions', regionController.list);
projectsRouter.post('/:id/regions', regionController.create);
projectsRouter.get('/:id', controller.detail);
projectsRouter.patch('/:id', controller.update);
projectsRouter.delete('/:id', controller.remove);
projectsRouter.post('/:id/duplicate', controller.duplicate);
