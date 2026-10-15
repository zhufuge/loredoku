import Router from '@koa/router';
import * as versionController from '../controller/versionController';

/**
 * OPT-905 (docs/v0.3.4.md §5): the works table needs every published work
 * across all maps, independent of a single project.
 */
export const versionsRouter = new Router();

versionsRouter.get('/', versionController.listAll);
