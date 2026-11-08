import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STYLE, MAP_JSON_VERSION } from '@loredoku/shared';
import type { MapStyle } from '@loredoku/shared';
import { api } from './helpers';
import { purgeTheme } from './purge';
import { db } from '../src/db/knex';

/**
 * v0.8.0（docs/v0.8.0.md §5 的 S3 快照式 + §16.8）—— 主题风格只在**新建地图那一
 * 刻**被拷进草稿，之后不追溯。
 *
 * 这个文件钉三件在测试里能稳定复现的事：
 *
 * 1. 新建地图第一次定尺寸时，草稿的 `style` 就是主题的缺省风格（不用作者再调二十
 *    几个值 —— 那正是「同一主题地图重复配置」这个痛点）**但方格大小除外**：
 *    它随画布尺寸变，不是风格（v0.8.6 §1）；
 * 2. 主题没设过风格时不写 `style`，落 `DEFAULT_MAP_STYLE`（不发明值）；
 * 3. **已有的草稿不会被追溯改动**：改主题风格后再 resize，图还是自己那份。
 *
 * 第 3 条是这个设计最容易被「顺手优化」掉的一条 —— 它看着像「主题改了图不跟着变
 * 是个 bug」，其实是高压线：地图是可导出 / 可导入的独立作品（§5 理由 1）。
 */

/** 主题在测试里只以**编码**出现 —— 接口没有别的名字（v0.8.0 §19）。 */
const createdThemes: string[] = [];
const createdMaps: number[] = [];

function unique(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

/** 一份和缺省不同的风格：只改网格线宽与标签颜色，差异好认。 */
function themeStyle(): MapStyle {
  return {
    ...DEFAULT_MAP_STYLE,
    gridSeparator: { width: 2, color: '#2f2a24' },
    regionLabel: { ...DEFAULT_MAP_STYLE.regionLabel, color: '#7a5c3e' },
  };
}

async function createTheme(style?: MapStyle): Promise<string> {
  const code = unique('t').toLowerCase().replace(/_/g, '-');
  const res = await api.post('/api/themes').send({
    code,
    name: `主题 ${code}`,
    ...(style ? { data: { version: 1, style } } : {}),
  });
  expect(res.status).toBe(200);
  createdThemes.push(code);
  return code;
}

async function createMap(themeCode: string): Promise<number> {
  const res = await api.post('/api/maps').send({ name: `底图 ${unique('m')}`, themeCode });
  expect(res.status).toBe(200);
  const id = res.body.data.id as number;
  createdMaps.push(id);
  return id;
}

/** 第一次定尺寸 = 草稿的「初始化那一刻」。 */
async function initMap(mapId: number, gridSize = 4): Promise<void> {
  const res = await api.patch(`/api/maps/${mapId}/grid-size`).send({ gridSize });
  expect(res.status).toBe(200);
}

async function draftOf(mapId: number): Promise<{ version: number; style?: MapStyle }> {
  // 画布在 `/:id/map`，不是 `/:id` —— 后者回的是条目行（名称 / 封面 / 版本数是推导值）。
  const res = await api.get(`/api/maps/${mapId}/map`);
  expect(res.status).toBe(200);
  return res.body.data.draft;
}

afterAll(async () => {
  for (const id of createdMaps) await api.delete(`/api/maps/${id}`);
  // 夹具自己擦干净：§19 起是**物理**删除，不是「留成软删」（见 test/purge.ts）。
  for (const code of createdThemes) await purgeTheme(code);
  await db.destroy();
});

describe('主题风格 → 新地图（§5 的 S3）', () => {
  it('新建地图第一次定尺寸时，草稿拿到主题的缺省风格', async () => {
    const style = themeStyle();
    const themeCode = await createTheme(style);
    const mapId = await createMap(themeCode);

    await initMap(mapId);
    const draft = await draftOf(mapId);

    expect(draft.version).toBe(MAP_JSON_VERSION);
    expect(draft.style).toEqual(style);
  });

  it('主题没设过风格 → 不写 style（渲染层落 DEFAULT_MAP_STYLE，不发明值）', async () => {
    const themeCode = await createTheme();
    const mapId = await createMap(themeCode);

    await initMap(mapId);
    const draft = await draftOf(mapId);

    expect(draft.style).toBeUndefined();
  });

  /**
   * v0.8.6 §1：方格大小不是风格 —— 同一个 168px 在 4×4 和 20×20 的图上完全是两种
   * 粗细。主题里那个值就算存在（「设为主题风格」会把当时那张图的值一并写进去），
   * 也不该决定新图的格子大小；新图从「按画布自适应」开始。
   */
  it('拷风格时不带方格大小，其余字段照旧来自主题', async () => {
    const style: MapStyle = { ...themeStyle(), cellSize: 168 };
    const themeCode = await createTheme(style);
    const mapId = await createMap(themeCode);

    await initMap(mapId);
    const draft = await draftOf(mapId);

    expect(draft.style?.cellSize).toBeNull();
    expect(draft.style?.gridSeparator).toEqual(style.gridSeparator);
    expect(draft.style?.regionLabel).toEqual(style.regionLabel);
  });

  it('已有的草稿不追溯：改主题风格后再 resize，图还是自己那份', async () => {
    const themeCode = await createTheme(themeStyle());
    const mapId = await createMap(themeCode);
    await initMap(mapId, 4);

    // 作者把这幅图的网格线调细了。
    const own: MapStyle = {
      ...DEFAULT_MAP_STYLE,
      gridSeparator: { width: 1, color: '#111111' },
    };
    const draft = await draftOf(mapId);
    const saved = await api
      .put(`/api/maps/${mapId}/map`)
      .send({ data: { ...draft, version: MAP_JSON_VERSION, gridSize: 4, cells: {}, regions: [], style: own } });
    expect(saved.status).toBe(200);

    // 主题风格这时被换掉了（比如在另一张图上「设为主题风格」）。
    const changed = await api
      .patch(`/api/themes/${themeCode}`)
      .send({ data: { version: 1, style: { ...DEFAULT_MAP_STYLE, gridSeparator: { width: 9, color: '#ff0000' } } } });
    expect(changed.status).toBe(200);

    await initMap(mapId, 6);
    expect((await draftOf(mapId)).style).toEqual(own);
  });
});
