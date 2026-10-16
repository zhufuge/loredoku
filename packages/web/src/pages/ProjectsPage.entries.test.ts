import { describe, expect, it } from 'vitest';

/**
 * FEAT-K09（docs/v0.5.0.md §7.1）：地图列表是**条目并集**。
 *
 * 页面吃 `PaginatedData<MapEntrySummary>`，一行要么是工作条目（`kind:'draft'`）
 * 要么是版本条目（`kind:'version'`）。除既有关键词 / 排序 / 视图切换外只加两个
 * 纯视图控件：三态类型筛选（默认「全部」）与「按地图归组」（默认关），且都作用
 * 于当前页 —— 默认观感与 v0.4.3 逐像素一致。
 *
 * 源码断言（同 `EditorPage.infoDrawer.test.ts`）：整页渲染需要 query client。
 */

const pageSource =
  ((import.meta.glob('./ProjectsPage.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['./ProjectsPage.tsx'] ?? '').replace(/\r\n/g, '\n');

describe('ProjectsPage 条目并集（FEAT-K09 §7.1）', () => {
  it('consumes the union type instead of a plain project list', () => {
    expect(pageSource).toContain("import type { MapEntrySummary } from '@loredoku/shared';");
    expect(pageSource).toContain('const [editProject, setEditProject] = useState<MapEntrySummary | null>(null);');
    expect(pageSource).toContain('const [deleteTarget, setDeleteTarget] = useState<MapEntrySummary | null>(null);');
    expect(pageSource).toContain('const isVersionEntry = (entry: MapEntrySummary): boolean => entry.kind === \'version\';');
    // 两种条目用 `kind-id` 做 key，不会互相覆盖。
    expect(pageSource.match(/key=\{`\$\{entry\.kind\}-\$\{entry\.id\}`\}/g)?.length ?? 0).toBe(2);
  });

  it('offers the three-state kind filter, defaulting to 全部', () => {
    expect(pageSource).toContain("type KindFilter = 'all' | 'draft' | 'version';");
    expect(pageSource).toContain("const [kindFilter, setKindFilter] = useState<KindFilter>('all');");
    expect(pageSource).toContain('<option value="all">全部条目</option>');
    expect(pageSource).toContain('<option value="draft">只看工作条目</option>');
    expect(pageSource).toContain('<option value="version">只看版本条目</option>');
    expect(pageSource).toContain("kindFilter === 'all' ? list : list.filter((entry) => entry.kind === kindFilter);");
  });

  it('offers the group-by-lineage toggle, defaulting to off', () => {
    expect(pageSource).toContain('const [groupByMap, setGroupByMap] = useState(false);');
    expect(pageSource).toContain('按地图归组');
    // 归组排序：rootId → 工作条目在前 → 版本号降序。
    const grouping = pageSource.slice(
      pageSource.indexOf('const rank = (entry: MapEntrySummary): number =>'),
      pageSource.indexOf('}, [data?.list, kindFilter, groupByMap]);'),
    );
    expect(grouping).toContain("entry.kind === 'draft' ? 0 : 1;");
    expect(grouping).toContain('a.rootId - b.rootId ||');
    expect(grouping).toContain('rank(a) - rank(b) ||');
    expect(grouping).toContain('(b.versionNo ?? 0) - (a.versionNo ?? 0),');
  });

  it('routes version entries to preview / new-puzzle / fork', () => {
    expect(pageSource).toContain('onPreview={(item) => navigate(`/maps/${item.projectId}/${item.versionNo}/view`)}');
    expect(pageSource).toContain('navigate(`/puzzles?new=${item.projectId}:${item.versionNo}`)');
    expect(pageSource).toContain('forkMutation.mutate({ id: item.projectId, versionNo: item.versionNo ?? 0 })');
    expect(pageSource).toContain('import { useDeleteVersion, useForkVersion } from \'@/hooks/useVersions\';');
  });

  it('deletes through two different endpoints by entry kind', () => {
    const confirm = pageSource.slice(
      pageSource.indexOf('const confirmDelete = (): void => {'),
      pageSource.indexOf('const deleting ='),
    );
    expect(confirm).toContain('if (isVersionEntry(target)) {');
    expect(confirm).toContain('deleteVersionMutation.mutate(');
    expect(confirm).toContain('deleteMutation.mutate(target.projectId');
    // 两套确认文案。
    expect(pageSource).toContain('`删除地图版本 v${deleteTarget.versionNo ?? \'\'}？`');
    expect(pageSource).toContain('该版本条目将被永久删除，引用它的谜题会失去这个画布版本。');
    expect(pageSource).toContain('`删除地图「${deleteTarget?.name}」？`');
  });

  it('version entries never reach the rename / cover dialog', () => {
    // 重命名只可能由工作条目分支的按钮触发（组件层已断言），页面侧的证据：
    // 「只看版本条目」的空态没有「新建地图」入口，也没有封面编辑路径。
    expect(pageSource).toContain('还没有已发布的版本，在地图编辑器里发布一个试试');
    expect(pageSource).toContain("{kindFilter === 'version' ? null : (");
    expect(pageSource).toContain('<EditProjectDialog project={editProject}');
    // 整页不出现 fork 之外的版本写入调用。
    expect(pageSource).not.toContain('versionsApi.createDraft');
    expect(pageSource).not.toContain('/draft`');
  });

  it('opens the editor by projectId for a work entry', () => {
    expect(pageSource).toContain('navigate(`/editor/${entry.projectId}`);');
  });
});
