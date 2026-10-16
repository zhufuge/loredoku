import Router from '@koa/router';
import * as controller from '../controller/projectController';
import * as mapController from '../controller/mapController';
import * as versionController from '../controller/versionController';
import { projectCoverUpload } from '../middleware/upload';

export const projectsRouter = new Router();

projectsRouter.get('/', controller.list);
projectsRouter.post('/', controller.create);

/**
 * FEAT-K03 (docs/v0.5.0.md §2.4): every published map version, for the puzzle
 * creation picker. Declared **before** `/:id` — otherwise 「versions」 would be
 * matched as an id and rejected.
 */
projectsRouter.get('/versions', controller.listPublishedVersions);

projectsRouter.get('/:id', controller.detail);
projectsRouter.patch('/:id', controller.update);
projectsRouter.delete('/:id', controller.remove);
projectsRouter.post('/:id/duplicate', controller.duplicate);

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
// SPEC-K13 §7.4: the 版本历史 panel lists the whole blood lineage.
projectsRouter.get('/:id/versions', versionController.list);
projectsRouter.get('/:id/versions/:versionNo', versionController.detail);
// SPEC-K11 §7.3: 「编辑此版本」 → a new work entry in the same lineage.
projectsRouter.post('/:id/versions/:versionNo/fork', versionController.fork);
// @deprecated v0.5.0 Q9 — kept for historical callers; no UI entry point.
projectsRouter.post('/:id/versions/:versionNo/draft', versionController.createDraft);
projectsRouter.delete('/:id/versions/:versionNo', versionController.remove);
