import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * v0.5.8 §13: 「以此为底稿新建」（fork 列表直达）。
 *
 * 版本条目的主点击从只读预览改成**带 `?v={n}` 进编辑器**：快照装进本地
 * store（不写库），用户在编辑器里改，**点保存时才生成草稿** —— fork 一行
 * 新 maps 行并把那一刻的画布一起写进去，随后 replace 到新行的编辑器 URL。
 * 没保存就离开 → 什么都没发生。
 *
 * 与 `EditorPage.autoSave.test.ts` / `EditorPage.publish.test.ts` 同一手法：
 * 渲染 `EditorPage` 需要 query client / router / 预置 store，因此做源码断言。
 */

const pageSource = readSource('pages/EditorPage.tsx');
const forkHookSource = readSource('hooks/useVersions.ts');
const versionApiSource = readSource('api/versions.ts');

describe('EditorPage fork 态（v0.5.8 §13）', () => {
  it('reads the fork source from the ?v= query', () => {
    expect(pageSource).toContain('const [searchParams] = useSearchParams();');
    expect(pageSource).toContain("searchParams.get('v')");
    // 只接受正整数；`?v=` 缺失 / 非法都按普通编辑器处理。
    expect(pageSource).toContain('Number.isInteger(parsed) && parsed > 0 ? parsed : null');
  });

  it('seeds the canvas from the version snapshot, not the work draft', () => {
    // 数据源换成版本详情；fork 态下 MapInitDialog / 草稿早退全部跳过。
    expect(pageSource).toContain(
      'useVersionDetail(forkFrom !== null && Number.isFinite(id) ? id : null, forkFrom)',
    );
    expect(pageSource).toContain('editor.init(id, snapshot.data, {');
    expect(pageSource).toContain('updatedAt: snapshot.publishedAt,');
    expect(pageSource).toContain('currentVersionNo: snapshot.versionNo,');
    expect(pageSource).toContain('if (forkFrom === null && mapQuery.data?.draft == null) {');
  });

  it('generates the draft on save, not on entry', () => {
    // 保存 = fork（带编辑器当前画布）→ 标记已保存 → replace 到新行 URL。
    expect(pageSource).toContain('const forkAndSave = async (): Promise<boolean> => {');
    expect(pageSource).toContain('data: editor.toDraft(),');
    expect(pageSource).toContain('editor.markSaved(project.updatedAt);');
    expect(pageSource).toContain("navigate(`/maps/${project.id}/edit`, { replace: true })");
    // persist 按 forkFrom 分流；普通路径一行不改。
    expect(pageSource).toContain('forkFrom !== null ? forkAndSave() : persistDraft()');
    // 进入页面本身没有任何写库调用（自动保存已在 v0.5.8 §3 删除）。
    expect(pageSource).not.toContain('basicInfoPersistedRef');
  });

  it('flushes dirty=false before swapping the URL', () => {
    // useBlocker 读的是渲染闭包里的 dirty —— 同一 continuation 里 navigate
    // 会拿旧值（true）把自己拦下，弹「有未保存更改」。
    expect(pageSource).toContain('window.setTimeout(() => navigate(`/maps/${project.id}/edit`, { replace: true }), 0);');
  });

  it('announces the fork state with a banner and forks publish too', () => {
    expect(pageSource).toContain('基于 v{forkFrom}');
    expect(pageSource).toContain('保存后将生成新草稿（不会改动原版本）');
    // fork 态点发布 = 先落盘，再请用户点一次（publishMutation 绑的是旧 id）。
    expect(pageSource).toContain('const handlePublishClick = (): void => {');
    expect(pageSource).toContain("toast.success('已生成草稿', { description: '请再次点击「发布」' });");
    expect(pageSource).toContain('onPublish={handlePublishClick}');
  });

  it('shows the error state when ?v= points at a missing version', () => {
    // 否则 versionQuery 永远不 resolve，页面转圈到天荒地老。
    expect(pageSource).toContain('forkFrom !== null && versionQuery.isError');
    expect(pageSource).toContain('地图版本不存在或加载失败。');
  });
});

describe('useForkVersion（v0.5.8 §13）', () => {
  it('carries the editor canvas and can skip its own navigation', () => {
    expect(forkHookSource).toContain('versionsApi.fork(id, versionNo, data)');
    expect(forkHookSource).toContain('useForkVersion(options: { navigate?: boolean } = {})');
    expect(forkHookSource).toContain('if (options.navigate !== false) {');
    // 版本历史面板的「编辑此版本」不传 data —— 老行为（点哪条生成哪条）。
    expect(versionApiSource).toContain('data ? { data } : {}');
  });
});

/*
 * server 侧（fork 命名「{name} (自 v{n})」+ body.data 落库）不走源码断言 ——
 * `readSource` 只覆盖 web 包，且这条链路的真相在 DB 里，由 server 包的
 * `api.test.ts` 直接打接口验证（见该文件 v0.5.8 §13 用例）。
 */
