import Router from '@koa/router';
import * as controller from '../controller/puzzleController';
import * as gameController from '../controller/gameController';

/**
 * FEAT-K01 + CONS-K16 (docs/v0.5.0.md §2.2): the puzzle module, including
 * 「部署为游戏」 — deployment moved here because a puzzle is what owns the
 * participants a game plays with.
 */
export const puzzlesRouter = new Router();

puzzlesRouter.get('/', controller.list);
puzzlesRouter.post('/', controller.create);
puzzlesRouter.get('/:id', controller.detail);
/** §5.1: the referenced map version's canvas, read-only. */
puzzlesRouter.get('/:id/map', controller.mapContext);
puzzlesRouter.put('/:id', controller.save);
puzzlesRouter.patch('/:id', controller.update);
puzzlesRouter.delete('/:id', controller.remove);
puzzlesRouter.post('/:id/duplicate', controller.duplicate);
puzzlesRouter.post('/:id/games', gameController.deploy);
