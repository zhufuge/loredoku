import type { Context } from 'koa';
import {
  createThemeSchema,
  listThemesQuerySchema,
  themeCodeParamSchema,
  toolIconParamSchema,
  updateThemeCheckStyleSchema,
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
 * v0.8.6 §4；v0.9.5 更名：主题的**标记**缺省上传 / 清除。
 *
 * 回执是**更新后的主题**（而不是单独的 `path`）：作者改的是主题配置，前端拿到
 * 整份就能直接刷新那一屏。旧文件不删 —— 存量谜题可能还指着它。
 */
export async function uploadMark(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  const file = (ctx as Context & { file?: { buffer: Buffer } }).file;
  if (!file) {
    throw themeService.markRequired();
  }
  success(ctx, await themeService.uploadMark(code, file.buffer), '标记已保存');
}

export async function removeMark(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  success(ctx, await themeService.removeMark(code), '标记已清除');
}

/**
 * v0.8.7 §7：主题的工具按钮图标（清除 / 撤回 / 提交）。
 *
 * 地址里的 `:icon` 走枚举校验 —— 拼错的种类是 400，而不是「传上去了但哪儿也没变」。
 * 回执同样是**更新后的整份主题**：概览页那一屏直接换掉，不必自己拼。
 */
export async function uploadToolIcon(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  const { icon } = parseOrThrow(toolIconParamSchema, ctx.params);
  const file = (ctx as Context & { file?: { buffer: Buffer } }).file;
  if (!file) {
    throw themeService.toolIconRequired();
  }
  success(ctx, await themeService.uploadToolIcon(code, icon, file.buffer), '图标已保存');
}

export async function removeToolIcon(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  const { icon } = parseOrThrow(toolIconParamSchema, ctx.params);
  success(ctx, await themeService.removeToolIcon(code, icon), '图标已清除');
}

/**
 * v0.9.2 §2；v0.9.5 起与校验圈**合并成一张** —— 所以只有一个 `ring` 入口。
 *
 * 与标记 / 工具图标同一个形状：一次一张、即时保存、回执是更新后的整份主题。
 * 不配就是内置细弧，所以「移除」不是一个清空动作，而是**回到默认样式**。
 */
export async function uploadRing(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  const file = (ctx as Context & { file?: { buffer: Buffer } }).file;
  if (!file) {
    throw themeService.ringRequired();
  }
  success(ctx, await themeService.uploadRing(code, file.buffer), '圆环已保存');
}

export async function removeRing(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  success(ctx, await themeService.removeRing(code), '圆环已恢复默认');
}

/**
 * v0.9.3 §3：提交校验的两档颜色（主题级）。
 *
 * 单独一个端点而不是走 `PATCH /themes/:code`：那条是「整份 data 覆盖」，两个取色器
 * 每动一下就把整份主题提交一遍，很容易把别处的改动顺手覆盖掉。
 */
export async function updateCheckStyle(ctx: Context): Promise<void> {
  const { code } = parseOrThrow(themeCodeParamSchema, ctx.params);
  const patch = parseOrThrow(updateThemeCheckStyleSchema, ctx.request.body);
  success(ctx, await themeService.updateCheckStyle(code, patch), '校验颜色已保存');
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
