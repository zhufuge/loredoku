import Router from '@koa/router';
import * as controller from '../controller/themeController';
import { forbiddenSymbolUpload } from '../middleware/upload';

/**
 * v0.8.0（docs/v0.8.0.md §7 / §19）—— `/api/themes` 只负责「边界」本身与它的缺省
 * 风格，内容仍然住在各自的接口下（带 `?themeCode=`）。
 *
 * **`:code` 而不是 `:id`**：主题在前端地址（`/hlm/maps`）、资源包 manifest、将来的
 * 导入对账里都是编码，接口再收数字主键就得多一层「这不是同一个东西」的解释。
 *
 * 没有 `PUT /:code/move` 之类的入口，也不会有：`theme_id` 建行后不可改（§8 护栏 2），
 * 「换个主题」只能新建。
 */
export const themesRouter = new Router();

themesRouter.get('/', controller.list);
themesRouter.post('/', controller.create);
themesRouter.get('/:code', controller.detail);
themesRouter.patch('/:code', controller.update);
themesRouter.delete('/:code', controller.remove);

/**
 * v0.8.6 §4：主题级的「禁止符号缺省」。它和 `style` / `linkageColors` 一样是
 * 缺省，不是内容：改即时生效，但只影响**之后新建**的谜题。
 */
themesRouter.post(
  '/:code/forbidden-symbol',
  forbiddenSymbolUpload.single('file'),
  controller.uploadForbiddenSymbol,
);
themesRouter.delete('/:code/forbidden-symbol', controller.removeForbiddenSymbol);

/**
 * v0.8.7 §7：工具按钮图标（清除 / 撤回 / 提交）。与禁止符号同一种「读取时兜底」，
 * 一次一枚 —— `:icon` 是 `GAME_TOOL_ICON_KINDS` 里的一个。
 */
themesRouter.post(
  '/:code/tool-icons/:icon',
  forbiddenSymbolUpload.single('file'),
  controller.uploadToolIcon,
);
themesRouter.delete('/:code/tool-icons/:icon', controller.removeToolIcon);

/**
 * v0.9.2 §2：长按放置参与者时的计时环 —— 一张图，主题级。与禁止符号同一种
 * 「读取时兜底」：不配就画内置白弧，配了则所有关卡都换（含已发布的）。
 */
themesRouter.post('/:code/press-ring', forbiddenSymbolUpload.single('file'), controller.uploadPressRing);
themesRouter.delete('/:code/press-ring', controller.removePressRing);

/** 导出资源包（§11）：本版只打包，不解包、不导入、不托管。 */
themesRouter.get('/:code/bundle', controller.bundle);
