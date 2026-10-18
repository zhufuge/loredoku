import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * FEAT-K09（docs/v0.5.0.md §7.1）：地图列表是**条目并集**。
 *
 * 页面吃 `PaginatedData<MapEntrySummary>`，一行要么是工作条目（`kind:'draft'`）
 * 要么是版本条目（`kind:'version'`）。
 *
 * v0.5.8 §15 / 设计 §17：正文拆「草稿」「版本」两块 —— 分块取代原来三态 kind
 * 筛选的用途，版本块固定按血统排序又吸收了「按地图归组」，两个纯视图控件一并
 * 删除；版本块**恒为列表行**，网格 / 列表切换只管草稿块。
 *
 * 源码断言（同 `EditorPage.infoDrawer.test.ts`）：整页渲染需要 query client。
 */

/** Drop JSDoc / JSX block comments — assertions below only look at the code. */
const pageSource = readSource('pages/MapsPage.tsx').replace(/\/\*[\s\S]*?\*\//g, '');

describe('MapsPage 条目并集（FEAT-K09 §7.1 / v0.5.4 FEAT-O06）', () => {
  it('consumes the union type instead of a plain project list', () => {
    expect(pageSource).toContain("import type { MapEntrySummary } from '@loredoku/shared';");
    expect(pageSource).toContain('const [editProject, setEditProject] = useState<MapEntrySummary | null>(null);');
    expect(pageSource).toContain('const [deleteTarget, setDeleteTarget] = useState<MapEntrySummary | null>(null);');
    expect(pageSource).toContain('const isVersionEntry = (entry: MapEntrySummary): boolean => entry.kind === \'version\';');
    // 两种条目用 `kind-id` 做 key，不会互相覆盖（草稿列表 / 草稿网格 / 版本列表）。
    expect(pageSource.match(/key=\{`\$\{entry\.kind\}-\$\{entry\.id\}`\}/g)?.length ?? 0).toBe(3);
  });

  it('v0.5.8 §15: splits the page into a draft block and a version block', () => {
    expect(pageSource).toContain('const { drafts, versions } = useMemo(() => {');
    expect(pageSource).toContain("drafts: list.filter((entry) => entry.kind === 'draft'),");
    expect(pageSource).toContain("versions: list");
    expect(pageSource).toContain(".filter((entry) => entry.kind === 'version')");
    // 版本块常态排序 = 同血统相邻、新号在上（原「按地图归组」的顺序）。
    expect(pageSource).toContain('a.rootId - b.rootId || (b.versionNo ?? 0) - (a.versionNo ?? 0)');
    // 两块各有标题。
    expect(pageSource).toContain('草稿 <span');
    expect(pageSource).toContain('版本 <span');
  });

  it('v0.5.8 §15: version entries are always list rows, never cards', () => {
    // 只有草稿块能出卡片；两种视图都用 `ProjectListRow` 的名单共两处（草稿 / 版本）。
    expect(pageSource.match(/<ProjectGridCard/g)?.length ?? 0).toBe(1);
    expect(pageSource.match(/<ProjectListRow/g)?.length ?? 0).toBe(2);
    // 视图切换只作用于草稿块：除工具栏按钮的选中态外，正文里只有草稿块用它分流。
    expect(pageSource.match(/view === 'list'/g)?.length ?? 0).toBe(2);
  });

  it('v0.5.8 §15: the three-state kind filter and group-by-map toggle are gone', () => {
    expect(pageSource).not.toContain('type KindFilter');
    expect(pageSource).not.toContain('kindFilter');
    expect(pageSource).not.toContain('groupByMap');
    expect(pageSource).not.toContain('按地图归组');
    expect(pageSource).not.toContain('只看工作条目');
  });

  it('v0.5.8 §15: empty blocks are hidden, both empty falls back to one empty state', () => {
    expect(pageSource).toContain('if (drafts.length === 0 && versions.length === 0) {');
    expect(pageSource).toContain("{keyword ? '没有匹配的地图' : '还没有地图，创建一个开始吧'}");
    expect(pageSource).toContain('{drafts.length > 0 ? (');
    expect(pageSource).toContain('{versions.length > 0 ? (');
  });

  it('v0.5.9 §7: previews go to /maps/:id/views with the version in the query', () => {
    // 预览对两类都存在：版本条目看自己，工作条目看血统最高版本。
    expect(pageSource).toContain('const versionNo = entry.versionNo ?? entry.currentVersionNo;');
    expect(pageSource).toContain('navigate(`/maps/${entry.projectId}/views?v=${versionNo}`);');
    // 「新建谜题 / 编辑此版本」两个按 kind 分叉的入口已从列表页移除。
    expect(pageSource).not.toContain('/puzzles?new=');
    expect(pageSource).not.toContain('forkMutation');
    expect(pageSource).toContain("import { useDeleteVersion } from '@/hooks/useVersions';");
  });

  it('v0.5.8 §13: the primary click forks by entry kind', () => {
    // v0.5.8 两者都进 `/editor/:projectId` —— 版本条目的 projectId 就是拥有
    // 它的 maps 行 id，点哪条都是同一个 id，版本内容被地图草稿覆盖。v0.5.9
    // 一度改去只读预览；v0.5.8 §13 定为「以此为底稿新建」：同样进编辑器，
    // 带 `?v=` 装载版本快照，**保存时才生成草稿**。
    const open = pageSource.slice(
      pageSource.indexOf('const handleOpen = (entry: MapEntrySummary): void => {'),
      pageSource.indexOf('const handlePreview'),
    );
    expect(open).toContain("entry.kind === 'version' && entry.versionNo !== null");
    expect(open).toContain('navigate(`/maps/${entry.projectId}/edit?v=${entry.versionNo}`);');
    expect(open).toContain('navigate(`/maps/${entry.projectId}/edit`);');
  });

  it('v0.5.9 §5: the view choice survives a reload', () => {
    expect(pageSource).toContain("const VIEW_STORAGE_KEY = 'loredoku.maps.view';");
    expect(pageSource).toContain('useState<ViewMode>(readStoredView)');
    expect(pageSource).toContain('window.localStorage.setItem(VIEW_STORAGE_KEY, view);');
    expect(pageSource).toContain("window.localStorage.getItem(VIEW_STORAGE_KEY) === 'list'");
  });

  it('deletes through two different endpoints by entry kind', () => {
    const confirm = pageSource.slice(
      pageSource.indexOf('const confirmDelete = (): void => {'),
      pageSource.indexOf('const deleting ='),
    );
    expect(confirm).toContain('if (isVersionEntry(target)) {');
    expect(confirm).toContain('deleteVersionMutation.mutate(');
    expect(confirm).toContain('deleteMutation.mutate(target.projectId');
  });

  it('keeps a single rename / cover dialog for both blocks', () => {
    expect(pageSource).toContain('<EditProjectDialog project={editProject}');
    // 整页不出现 fork 之外的版本写入调用。
    expect(pageSource).not.toContain('versionsApi.createDraft');
    expect(pageSource).not.toContain('/draft`');
  });

  it('opens the editor at /maps/:id/edit for a work entry', () => {
    const open = pageSource.slice(
      pageSource.indexOf('const handleOpen = (entry: MapEntrySummary): void => {'),
      pageSource.indexOf('const handlePreview'),
    );
    expect(open).toContain('navigate(`/maps/${entry.projectId}/edit`);');
  });

  it('v0.5.9 §4: the grid tops out at five cards per row', () => {
    expect(pageSource.match(/2xl:grid-cols-5/g)?.length ?? 0).toBe(2);
  });
});
