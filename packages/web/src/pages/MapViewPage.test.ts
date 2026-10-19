import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * `/maps/:id/views`
 * 的 `:id` **一律指 `maps.id`** —— 版本行与草稿行都是 `maps` 行，URL 不借
 * 「拥有它的工作条目」这一层。四种组合的解析规则：
 *
 * | `:id` 命中 | 无 `?v=` | 有 `?v=` |
 * |---|---|---|
 * | 版本行 | 展示**这一行**（它自带 data） | 以 `?v=` 为准 |
 * | 草稿行 | 取血统 `MAX(version)` | 以 `?v=` 为准 |
 *
 * 页面级的渲染需要 router + query client，所以这里做源码断言（与
 * `MapEditorPage.publish.test.ts` 同一手法）。
 */

const pageSource = readSource('pages/MapViewPage.tsx');

describe('MapViewPage 的版本号解析（v0.5.8 第三阶段）', () => {
  it('`?v=` 优先，缺省才走兜底', () => {
    expect(pageSource).toContain('Number.isFinite(requestedNo) && requestedNo > 0 ? requestedNo : fallbackVersionNo;');
  });

  it('兜底先看这一行自己的版本号，再看血统最高号', () => {
    // 版本行命中 → 它自己的号；草稿行命中 → 血统 MAX。顺序不能反，否则打开
    // 一个历史版本会跳到最新版。
    expect(pageSource).toContain(
      'mapQuery.data.map.versionNo ?? mapQuery.data.map.currentVersionNo',
    );
  });

  it('`:id` 就是 maps.id，直接进 useMapCanvas / useVersionDetail', () => {
    expect(pageSource).toContain('const { mapId: mapIdParam } = useParams<{ mapId: string }>();');
    expect(pageSource).toContain('useMapCanvas(valid ? mapId : Number.NaN)');
    expect(pageSource).toContain('useVersionDetail(valid ? mapId : null, versionNo)');
  });
});
