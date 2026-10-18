import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * FEAT-K09（docs/v0.5.0.md §7.1）：地图列表是**条目并集**。
 *
 * 页面吃 `PaginatedData<MapEntrySummary>`，一行要么是工作条目（`kind:'draft'`）
 * 要么是版本条目（`kind:'version'`）。除既有关键词 / 排序 / 视图切换外只加两个
 * 纯视图控件：三态类型筛选与按地图归组，且都作用于当前页。
 *
 * 源码断言（同 `EditorPage.infoDrawer.test.ts`）：整页渲染需要 query client。
 */

const pageSource = readSource('pages/MapsPage.tsx');

describe('MapsPage 条目并集（FEAT-K09 §7.1 / v0.5.4 FEAT-O06）', () => {
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
    expect(pageSource).toContain("kindFilter === 'all' ? list : list.filter((entry) => entry.kind === kindFilter);");
  });

  it('offers the group-by-lineage toggle, defaulting to off', () => {
    expect(pageSource).toContain('const [groupByMap, setGroupByMap] = useState(false);');
    const grouping = pageSource.slice(
      pageSource.indexOf('const rank = (entry: MapEntrySummary): number =>'),
      pageSource.indexOf('}, [data?.list, kindFilter, groupByMap]);'),
    );
    expect(grouping).toContain("entry.kind === 'draft' ? 0 : 1;");
    expect(grouping).toContain('a.rootId - b.rootId ||');
    expect(grouping).toContain('rank(a) - rank(b) ||');
    expect(grouping).toContain('(b.versionNo ?? 0) - (a.versionNo ?? 0),');
  });

  it('v0.5.8 §2: 两类条目共用同一组路由', () => {
    // 预览对两类都存在：版本条目看自己，工作条目看血统最高版本。
    expect(pageSource).toContain('const versionNo = entry.versionNo ?? entry.currentVersionNo;');
    expect(pageSource).toContain('navigate(`/maps/${entry.projectId}/${versionNo}/view`);');
    // 「新建谜题 / 编辑此版本」两个按 kind 分叉的入口已从列表页移除。
    expect(pageSource).not.toContain('/puzzles?new=');
    expect(pageSource).not.toContain('forkMutation');
    expect(pageSource).toContain("import { useDeleteVersion } from '@/hooks/useVersions';");
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

  it('version entries never reach the rename / cover dialog', () => {
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
