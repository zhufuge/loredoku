import Router from '@koa/router';
import * as controller from '../controller/mapController';
import * as mapCanvasController from '../controller/mapCanvasController';
import * as versionController from '../controller/versionController';
import { mapCoverUpload } from '../middleware/upload';

export const mapsRouter = new Router();

mapsRouter.get('/', controller.list);
mapsRouter.post('/', controller.create);

/**
 * FEAT-K03 (docs/v0.5.0.md §2.4): every published map version, for the puzzle
 * creation picker. Declared **before** `/:id` — otherwise 「versions」 would be
 * matched as an id and rejected.
 */
mapsRouter.get('/versions', controller.listPublishedVersions);

mapsRouter.get('/:id', controller.detail);
mapsRouter.patch('/:id', controller.update);
mapsRouter.delete('/:id', controller.remove);
mapsRouter.post('/:id/duplicate', controller.duplicate);

mapsRouter.get('/:id/map', mapCanvasController.getMap);
mapsRouter.put('/:id/map', mapCanvasController.saveMap);
mapsRouter.patch('/:id/grid-size', mapCanvasController.updateGridSize);
mapsRouter.get('/:id/map/export', mapCanvasController.exportMap);
mapsRouter.post('/:id/map/import', mapCanvasController.importMap);

// FEAT-H03 (docs/v0.4.2.md §3.2c): the map cover has its own write path —
// create / update stay JSON, the artwork travels as multipart.
mapsRouter.post('/:id/cover', mapCoverUpload.single('file'), controller.uploadCover);
mapsRouter.delete('/:id/cover', controller.removeCover);

mapsRouter.get('/:id/regions', mapCanvasController.listRegions);
mapsRouter.post('/:id/regions', mapCanvasController.createRegion);
mapsRouter.patch('/:id/regions/:regionId', mapCanvasController.updateRegion);
mapsRouter.delete('/:id/regions/:regionId', mapCanvasController.deleteRegion);

mapsRouter.post('/:id/versions', versionController.publish);
// SPEC-K13 §7.4: the 版本历史 panel lists the whole blood lineage.
mapsRouter.get('/:id/versions', versionController.list);
mapsRouter.get('/:id/versions/:versionNo', versionController.detail);
// SPEC-K11 §7.3: 「编辑此版本」 → a new work entry in the same lineage.
mapsRouter.post('/:id/versions/:versionNo/fork', versionController.fork);
// @deprecated v0.5.0 Q9 — kept for historical callers; no UI entry point.
mapsRouter.post('/:id/versions/:versionNo/draft', versionController.createDraft);
mapsRouter.delete('/:id/versions/:versionNo', versionController.remove);
