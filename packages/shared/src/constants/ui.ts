// // 界面：分页、路由、层叠、错误码、主题。
// v0.10.4：从 `constants.ts`（1324 行、287 个导出）按主题拆开。值、注释、次序一律
// 照搬 —— 只是把「谁在用」相近的那些放在一个文件里，改一处不必在一千行里翻。
// 对外仍是同一组名字：`constants/index.ts` 全部再导出，`@loredoku/shared` 不变。

// ---- Pagination ----
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 100;

// ---- Routing ----
export const API_PREFIX = '/api';
export const FILES_ROUTE_PREFIX = `${API_PREFIX}/files`;

// ---- v0.5.3 FIX-N01 提示位置 / FIX-N11 UI 层叠 ----
/**
 * FIX-N01 (docs/v0.5.3.md §1): the toast stack's distance from the top edge. The
 * header bar is `h-14` (56px), so 64px drops the first toast **below** it while
 * staying on the right — the side with the fewest controls.
 */
export const TOAST_OFFSET = 64;

/**
 * FIX-N11 (docs/v0.5.3.md §6.4): the editor's overlay stacking order, in one
 * place — the strips hard-coded `z-30` while the drawer hard-coded `z-20`, so the
 * ruler painted over it. Sparse (10 / 20 / 30) so a future layer can slot in.
 */
export const UI_Z = {
  /** 标尺条带 — always under every drawer. */
  ruler: 10,
  /** 方格信息框 / 谜题基本信息抽屉。 */
  infoDrawer: 20,
  /** 参与者信息框 — the top-most panel. */
  drawer: 30,
  /** 保存中蒙版 — covers every panel while the save request flies. */
  saveMask: 40,
} as const;

// ---- Error codes (see docs/feature-1.0.md §4.5, docs/feature-0.2.md §5) ----
export const ErrorCode = {
  OK: 0,
  VALIDATION_FAILED: 40001,
  NOT_FOUND: 40004,
  CONFLICT: 40901,
  DRAFT_CONFLICT: 40902,
  REGION_OVERLAP: 40903,
  PUBLISH_VALIDATION_FAILED: 42201,
  FILE_TOO_LARGE: 41301,
  UNSUPPORTED_MEDIA_TYPE: 41501,
  INTERNAL_ERROR: 50000,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export const HTTP_STATUS_BY_ERROR_CODE: Record<ErrorCodeValue, number> = {
  [ErrorCode.OK]: 200,
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.DRAFT_CONFLICT]: 409,
  [ErrorCode.REGION_OVERLAP]: 409,
  [ErrorCode.PUBLISH_VALIDATION_FAILED]: 422,
  [ErrorCode.FILE_TOO_LARGE]: 413,
  [ErrorCode.UNSUPPORTED_MEDIA_TYPE]: 415,
  [ErrorCode.INTERNAL_ERROR]: 500,
};

// ---- 主题（v0.8.0，docs/v0.8.0.md §4） ----
/**
 * `themes.code` 是**稳定标识**：进 URL、进资源包 manifest、将来导入时对账。
 * 与地图 / 谜题的 slug 同理 —— 显示名可以改，`code` 不能。
 */
export const THEME_CODE_MAX_LENGTH = 64;
export const THEME_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
export const THEME_NAME_MAX_LENGTH = 100;
export const THEME_DESCRIPTION_MAX_LENGTH = 500;
/** `themes.data` 的形状版本；缺键按 `DEFAULT_MAP_STYLE` 补齐，所以只在结构变化时 +1。 */
export const THEME_DATA_VERSION = 1;
/** 恰好一个默认主题，`code` 固定。迁移里写死这两条（§12）。 */
export const DEFAULT_THEME_CODE = 'default';
export const DEFAULT_THEME_NAME = '默认';
/**
 * v0.8.0 §9：`/play/theme/:slug` 与 `/play/:slug` 是两个命名空间，但 `theme`
 * 这一段被路由占了。slug 允许它（`GAME_SLUG_PATTERN` 只认字符集），所以必须
 * 在 `slugError` 里显式拦 —— 否则某个作者把自己那关命名成 `theme` 就撞了。
 */
export const GAME_SLUG_RESERVED: readonly string[] = ['theme'];
/**
 * v0.8.0 §18：主题编码成了 URL 的**第一段**（`/hlm/maps`），于是顶层那些静态路径
 * 都成了保留字 —— 一个叫 `settings` 的主题，自己的工作台永远打不开（前端会先
 * 匹配到系统配置）。列在创建时拦下，比事后让作者对着 404 猜要好。
 */
export const THEME_CODE_RESERVED: readonly string[] = [
  'settings',
  'play',
  'themes',
  'assets',
  'maps',
  'characters',
  'puzzles',
  'deployments',
];

/** 资源包（docs/v0.8.0.md §11.4）：外壳标识，与 `formatVersion` 一起做兼容判断。 */
export const BUNDLE_FORMAT = 'loredoku-theme';
export const BUNDLE_FORMAT_VERSION = 1;
