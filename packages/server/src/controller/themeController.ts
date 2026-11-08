import type { Context } from 'koa';
import {
  createThemeDeploymentSchema,
  createThemeSchema,
  idParamSchema,
  listThemesQuerySchema,
  themeCodeParamSchema,
  updateThemeDeploymentSchema,
  updateThemeSchema,
} from '@loredoku/shared';
import { success } from '../utils/response';
import { parseOrThrow } from '../utils/validate';
import * as bundleService from '../service/bundleService';
import * as themeService from '../service/themeService';

export async function list(ctx: Context): Promise<void> {
  const query = parseOrThrow(listThemesQuerySchema, ctx.query);
  success(ctx, await themeService.listThemes(query.light === true));
}

/**
 * v0.8.0 §19：主题一律**按编码寻址**（`/api/themes/hlm`）。路径段走和创建时同一套
 * `themeCodeSchema`，所以畸形编码在进服务前就 400。
 */
export async function detail(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  success(ctx, await themeService.getTheme(code));
}

export async function create(ctx: Context): Promise<void> {
  const body = parseOrThrow(createThemeSchema, ctx.request.body ?? {});
  success(ctx, await themeService.createTheme(body), '主题已创建');
}

export async function update(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  const body = parseOrThrow(updateThemeSchema, ctx.request.body ?? {});
  success(ctx, await themeService.updateTheme(code, body), '已保存');
}

export async function remove(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  await themeService.deleteTheme(code);
  success(ctx, null, '主题已删除');
}

/**
 * v0.8.6 §4：主题的「禁止符号缺省」上传 / 清除。
 *
 * 回执是**更新后的主题**（而不是单独的 `path`）：作者改的是主题配置，前端拿到
 * 整份就能直接刷新那一屏。两张图的旧文件都不删 —— 存量谜题可能还指着它们。
 */
export async function uploadForbiddenSymbol(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  const file = (ctx as Context & { file?: { buffer: Buffer } }).file;
  if (!file) {
    throw themeService.forbiddenSymbolRequired();
  }
  success(ctx, await themeService.uploadForbiddenSymbol(code, file.buffer), '禁止符号已保存');
}

export async function removeForbiddenSymbol(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  success(ctx, await themeService.removeForbiddenSymbol(code), '禁止符号已清除');
}

// ---- 合辑 ----

export async function listDeployments(ctx: Context): Promise<void> {
  success(ctx, await themeService.listDeployments());
}

export async function deploymentDetail(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  success(ctx, await themeService.getDeployment(id));
}

/** 玩家页用它：`/play/theme/:slug` 不经过工坊，只认 slug。 */
export async function deploymentBySlug(ctx: Context): Promise<void> {
  const slug = String(ctx.params.slug ?? '').trim();
  success(ctx, await themeService.getDeploymentBySlug(slug));
}

export async function deploy(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  const body = parseOrThrow(createThemeDeploymentSchema, ctx.request.body ?? {});
  success(ctx, await themeService.deployTheme(code, body), '主题已上线');
}

export async function updateDeployment(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  const body = parseOrThrow(updateThemeDeploymentSchema, ctx.request.body ?? {});
  success(ctx, await themeService.updateDeployment(id, body), '已保存');
}

export async function removeDeployment(ctx: Context): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, ctx.params);
  await themeService.removeDeployment(id);
  success(ctx, null, '合辑已下线');
}

/**
 * 导出资源包（§11.6）：`GET /api/themes/:code/bundle` → 流式返回一个 zip。
 *
 * **不落盘、不登记、不托管** —— 所以这一版没有 `bundles` 表，也没有下载地址可
 * 二次访问。体检在 `buildThemeBundle` 里先跑完；出错时这里根本还没碰响应体，
 * 于是得到一个正常的 JSON 错误，而不是一个半截的 zip。
 */
export async function bundle(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  const built = await bundleService.buildThemeBundle(code);
  ctx.set('Content-Type', 'application/zip');
  // 文件名是 ASCII（`code` 是 `[a-z0-9_-]`），所以不需要 `filename*` 那一套。
  ctx.set('Content-Disposition', `attachment; filename="${built.filename}"`);
  // 不给 Content-Length：压缩后的大小要等流走完才知道，先声明一个数是错的。
  // koa 会在流结束时用 `Transfer-Encoding: chunked` 收尾。
  ctx.body = bundleService.zipStream(built);
}
