import Router from '@koa/router';
import * as controller from '../controller/projectController';
import * as mapController from '../controller/mapController';
import * as versionController from '../controller/versionController';
import * as gameController from '../controller/gameController';
import { projectCoverUpload } from '../middleware/upload';

export const projectsRouter = new Router();

projectsRouter.get('/', controller.list);
projectsRouter.post('/', controller.create);
projectsRouter.get('/:id', controller.detail);
projectsRouter.patch('/:id', controller.update);
projectsRouter.delete('/:id', controller.remove);
projectsRouter.post('/:id/duplicate', controller.duplicate);

// FEAT-G02 (docs/v0.4.0.md §5.4): deploy this map's work as a game.
projectsRouter.post('/:id/games', gameController.deploy);

projectsRouter.get('/:id/map', mapController.getMap);
projectsRouter.put('/:id/map', mapController.saveMap);
projectsRouter.patch('/:id/grid-size', mapController.updateGridSize);
projectsRouter.get('/:id/map/export', mapController.exportMap);
projectsRouter.post('/:id/map/import', mapController.importMap);

// FEAT-H03 (docs/v0.4.2.md §3.2c): the map cover has its own write path —
// create / update stay JSON, the artwork travels as multipart.
projectsRouter.post('/:id/cover', projectCoverUpload.single('file'), controller.uploadCover);
projectsRouter.delete('/:id/cover', controller.removeCover);

projectsRouter.get('/:id/regions', mapController.listRegions);
projectsRouter.post('/:id/regions', mapController.createRegion);
projectsRouter.patch('/:id/regions/:regionId', mapController.updateRegion);
projectsRouter.delete('/:id/regions/:regionId', mapController.deleteRegion);

projectsRouter.post('/:id/versions', versionController.publish);
projectsRouter.get('/:id/versions', versionController.list);
projectsRouter.get('/:id/versions/:versionNo', versionController.detail);
projectsRouter.post('/:id/versions/:versionNo/draft', versionController.createDraft);
projectsRouter.delete('/:id/versions/:versionNo', versionController.remove);
