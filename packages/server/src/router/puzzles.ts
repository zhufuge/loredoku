import Router from '@koa/router';
import * as controller from '../controller/puzzleController';
import * as versionController from '../controller/puzzleVersionController';
import * as gameController from '../controller/gameController';
import { forbiddenSymbolUpload, puzzleCoverUpload } from '../middleware/upload';

/**
 * 谜题模块（v0.7.1 §5 / §6.3）：谜题、它的版本，以及「部署为游戏」——
 * 部署挂在谜题版本上，因为一个 game 行就是一个谜题版本行。
 */
export const puzzlesRouter = new Router();

puzzlesRouter.get('/', controller.list);
puzzlesRouter.post('/', controller.create);
puzzlesRouter.get('/:id', controller.detail);
/** §5.3: 谜题自带底图画布，只读。 */
puzzlesRouter.get('/:id/map', controller.mapContext);
puzzlesRouter.put('/:id', controller.save);
puzzlesRouter.patch('/:id', controller.update);
puzzlesRouter.delete('/:id', controller.remove);
puzzlesRouter.post('/:id/duplicate', controller.duplicate);

// §7.5: 封面是二进制、创建 / 改名是 JSON，各走各的。
puzzlesRouter.post('/:id/cover', puzzleCoverUpload.single('file'), controller.uploadCover);
puzzlesRouter.delete('/:id/cover', controller.removeCover);

/**
 * v0.8.6 §4：禁止符号是**上传图**，只写文件、不写库 —— 草稿里那个 `path` 由
 * 随后的保存请求带回来。所以这里也允许版本行 id（编辑器 `?v=` 的 fork 态）。
 */
puzzlesRouter.post(
  '/:id/forbidden-symbol',
  forbiddenSymbolUpload.single('file'),
  controller.uploadForbiddenSymbol,
);

// §5.5: 发布 / 版本历史 / 版本详情 / fork / 删版本。
puzzlesRouter.post('/:id/versions', versionController.publish);
puzzlesRouter.get('/:id/versions', versionController.list);
puzzlesRouter.get('/:id/versions/:versionNo', versionController.detail);
puzzlesRouter.post('/:id/versions/:versionNo/fork', versionController.fork);
puzzlesRouter.delete('/:id/versions/:versionNo', versionController.remove);

// §7.1: 只有版本行能部署（草稿行 400）。
puzzlesRouter.post('/:id/games', gameController.deploy);
