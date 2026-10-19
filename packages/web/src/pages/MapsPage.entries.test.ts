import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * FEAT-K09（docs/v0.5.0.md §7.1）：地图列表是**条目并集**。
 *
 * 页面吃 `PaginatedData<MapEntrySummary>`，一行要么是工作条目（`kind:'draft'`）
 * 要么是版本条目（`kind:'version'`）。
 *
 * 正文拆「草稿」「版本」两块（设计 §17）：分块取代三态 kind 筛选的用途，
 * 「按地图归组」控件随之删除；版本块**恒为列表行**，网格 / 列表切换只管草稿块。
 *
 * 两块**各自分页**：同一端点带 `kind` 发两个请求，各带页号与 total，各有一条
 * 翻页条。排序一律在服务端（客户端只能重排当前页，跨页会乱），默认按更新时间
 * 倒序 —— 版本的块里就是最新发布的在最上面。
 *
 * 源码断言（同 `MapEditorPage.infoDrawer.test.ts`）：整页渲染需要 query client。
 */

/** Drop JSDoc / JSX block comments — assertions below only look at the code. */
const pageSource = readSource('pages/MapsPage.tsx').replace(/\/\*[\s\S]*?\*\//g, '');

describe('MapsPage 条目并集（FEAT-K09 §7.1 / v0.5.4 FEAT-O06）', () => {
  it('consumes the union type instead of a plain project list', () => {
    expect(pageSource).toContain("import type { MapEntrySummary } from '@loredoku/shared';");
    expect(pageSource).toContain('const [editMapEntry, setEditMapEntry] = useState<MapEntrySummary | null>(null);');
    expect(pageSource).toContain('const [deleteTarget, setDeleteTarget] = useState<MapEntrySummary | null>(null);');
    expect(pageSource).toContain('const isVersionEntry = (entry: MapEntrySummary): boolean => entry.kind === \'version\';');
    // 两种条目用 `kind-id` 做 key，不会互相覆盖（草稿列表 / 草稿网格 / 版本列表）。
    expect(pageSource.match(/key=\{`\$\{entry\.kind\}-\$\{entry\.id\}`\}/g)?.length ?? 0).toBe(3);
  });

  it('splits the page into a draft block and a version block', () => {
    // 两块各发一个带 kind 的请求，各拿各的 list / total。
    expect(pageSource).toContain("const draftQuery = useMaps({ ...shared, kind: 'draft', page: draftPage });");
    expect(pageSource).toContain(
      "const versionQuery = useMaps({ ...shared, kind: 'version', page: versionPage });",
    );
    expect(pageSource).toContain('const drafts = draftQuery.data?.list ?? [];');
    expect(pageSource).toContain('const versions = versionQuery.data?.list ?? [];');
    // 两块各有标题。
    expect(pageSource).toContain('草稿 <span');
    expect(pageSource).toContain('版本 <span');
  });

  it('两块各自分页，各带页号与翻页条', () => {
    expect(pageSource).toContain('const [draftPage, setDraftPage] = useState(1);');
    expect(pageSource).toContain('const [versionPage, setVersionPage] = useState(1);');
    expect(pageSource).toContain('const draftTotal = draftQuery.data?.total ?? 0;');
    expect(pageSource).toContain('const versionTotal = versionQuery.data?.total ?? 0;');
    // 一条翻页条一个块：定义一次、调两次，页面上没有共用翻页条。
    expect(pageSource.match(/\{renderPager\(/g)?.length ?? 0).toBe(2);
    expect(pageSource).toContain('{renderPager(draftPage, draftPages, draftTotal, setDraftPage)}');
    expect(pageSource).toContain(
      '{renderPager(versionPage, versionPages, versionTotal, setVersionPage)}',
    );
    // 搜索 / 排序变了，两块一起回到第一页。
    expect(pageSource).toContain('const resetPages = (): void => {');
    expect(pageSource).not.toContain('setPage(');
  });

  it('version entries are always list rows, never cards', () => {
    // 只有草稿块能出卡片；两种视图都用 `MapListRow` 的名单共两处（草稿 / 版本）。
    expect(pageSource.match(/<MapGridCard/g)?.length ?? 0).toBe(1);
    expect(pageSource.match(/<MapListRow/g)?.length ?? 0).toBe(2);
    // 视图切换只作用于草稿块：除工具栏按钮的选中态外，正文里只有草稿块用它分流。
    expect(pageSource.match(/view === 'list'/g)?.length ?? 0).toBe(2);
  });

  it('the three-state kind filter and group-by-map toggle are gone', () => {
    expect(pageSource).not.toContain('type KindFilter');
    expect(pageSource).not.toContain('kindFilter');
    expect(pageSource).not.toContain('groupByMap');
    expect(pageSource).not.toContain('按地图归组');
    expect(pageSource).not.toContain('只看工作条目');
  });

  it('empty blocks are hidden, both empty falls back to one empty state', () => {
    expect(pageSource).toContain('if (draftTotal === 0 && versionTotal === 0) {');
    expect(pageSource).toContain("{keyword ? '没有匹配的地图' : '还没有地图，创建一个开始吧'}");
    // 块的出现与否看**总数**而不是当前页条数 —— 否则翻到越界页就整块消失。
    expect(pageSource).toContain('{draftTotal > 0 ? (');
    expect(pageSource).toContain('{versionTotal > 0 ? (');
  });

  it('previews go to /maps/:id/views with the version in the query', () => {
    // 预览对两类都存在：版本条目看自己，工作条目看血统最高版本。
    expect(pageSource).toContain('const versionNo = entry.versionNo ?? entry.currentVersionNo;');
    expect(pageSource).toContain('navigate(`/maps/${entry.mapId}/views?v=${versionNo}`);');
    // 「新建谜题 / 编辑此版本」两个按 kind 分叉的入口已从列表页移除。
    expect(pageSource).not.toContain('/puzzles?new=');
    expect(pageSource).not.toContain('forkMutation');
    expect(pageSource).toContain("import { useDeleteVersion } from '@/hooks/useVersions';");
  });

  it('the primary click forks by entry kind', () => {
    // 版本条目同样进编辑器，但带 `?v=` 装载版本快照，**保存时才生成草稿**。
    const open = pageSource.slice(
      pageSource.indexOf('const handleOpen = (entry: MapEntrySummary): void => {'),
      pageSource.indexOf('const handlePreview'),
    );
    expect(open).toContain("entry.kind === 'version' && entry.versionNo !== null");
    expect(open).toContain('navigate(`/maps/${entry.mapId}/edit?v=${entry.versionNo}`);');
    expect(open).toContain('navigate(`/maps/${entry.mapId}/edit`);');
  });

  it('deletes through two different endpoints by entry kind', () => {
    const confirm = pageSource.slice(
      pageSource.indexOf('const confirmDelete = (): void => {'),
      pageSource.indexOf('const deleting ='),
    );
    expect(confirm).toContain('if (isVersionEntry(target)) {');
    expect(confirm).toContain('deleteVersionMutation.mutate(');
    expect(confirm).toContain('deleteMutation.mutate(target.mapId');
  });

  it('the grid tops out at five cards per row', () => {
    expect(pageSource.match(/2xl:grid-cols-5/g)?.length ?? 0).toBe(2);
  });
});
