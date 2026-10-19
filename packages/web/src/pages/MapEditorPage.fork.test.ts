import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * 「以此为底稿新建」（fork 列表直达）。
 *
 * 版本条目的主点击**带 `?v={n}` 进编辑器**：快照装进本地 store（不写库），
 * 用户在编辑器里改，**点保存时才生成草稿** —— fork 一行新 maps 行并把那一刻
 * 的画布一起写进去，随后 replace 到新行的编辑器 URL。没保存就离开 → 什么都没
 * 发生。
 *
 * 与 `MapEditorPage.autoSave.test.ts` / `MapEditorPage.publish.test.ts` 同一手法：
 * 渲染 `MapEditorPage` 需要 query client / router / 预置 store，因此做源码断言。
 */

const pageSource = readSource('pages/MapEditorPage.tsx');
const forkHookSource = readSource('hooks/useVersions.ts');
const versionApiSource = readSource('api/versions.ts');

describe('MapEditorPage fork 态（v0.5.8 §13）', () => {
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
    // init 的 meta 只有版本元数据。
    expect(pageSource).not.toContain('updatedAt: snapshot.publishedAt,');
    expect(pageSource).toContain('currentVersionNo: snapshot.versionNo,');
    expect(pageSource).toContain('if (forkFrom === null && mapQuery.data?.draft == null) {');
  });

  it('generates the draft on save, not on entry', () => {
    // 保存 = fork（带编辑器当前画布）→ 标记已保存 → replace 到新行 URL。
    expect(pageSource).toContain('const forkAndSave = async (): Promise<number | null> => {');
    expect(pageSource).toContain('data: editor.toDraft(),');
    expect(pageSource).toContain('editor.markSaved();');
    expect(pageSource).toContain("navigate(`/maps/${mapEntry.id}/edit`, { replace: true })");
    // persist 按 forkFrom 分流；普通路径一行不改。fork 返回新行 id，
    // 同一轮保存里的基本信息与尺寸都写到这个 id 上。
    expect(pageSource).toContain('const forkedId = await forkAndSave();');
    expect(pageSource).toContain('targetId = forkedId;');
    // 进入页面本身没有任何写库调用。
    expect(pageSource).not.toContain('basicInfoPersistedRef');
  });

  it('flushes dirty=false before swapping the URL', () => {
    // useBlocker 读的是渲染闭包里的 dirty —— 同一 continuation 里 navigate
    // 会拿旧值（true）把自己拦下，弹「有未保存更改」。
    expect(pageSource).toContain('window.setTimeout(() => navigate(`/maps/${mapEntry.id}/edit`, { replace: true }), 0);');
  });

  it('says nothing on entry and toasts once after the draft is actually created', () => {
    // 页面顶部不挂「基于 v2」横幅，提示只在保存成功后出现。
    expect(pageSource).not.toContain('基于 v{forkFrom}');
    expect(pageSource).not.toContain('保存后将生成新草稿（不会改动原版本）');
    // 一次保存一条提示：基于谁、生成了什么。不再单挂说明行。
    expect(pageSource).toContain('toast.success(`已基于 v${forkFrom} 生成新地图`);');
    expect(pageSource).not.toContain("description: '原版本未改动'");
  });

  it('shows neither the 草稿 badge nor the 发布 button while it is still a version', () => {
    // fork 态不是草稿 —— 徽标换成「无」，发布按钮整个不渲染。
    expect(pageSource).toContain('status={forkFrom !== null ? null : editor.status}');
    expect(pageSource).toContain('onPublish={forkFrom === null ? openPublishConfirm : undefined}');
    // 保存后 replace 到新草稿行 URL，`forkFrom` 随之变 null，二者一起回来。
    expect(pageSource).toContain('navigate(`/maps/${mapEntry.id}/edit`, { replace: true })');
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

  it('leaves the toast to the caller when navigation is skipped', () => {
    // 编辑器那条路自己提示「已基于 v{n} 生成新地图」，这里不能再弹一条。
    const guardAt = forkHookSource.indexOf('if (options.navigate !== false) {');
    const guarded = forkHookSource.slice(
      guardAt,
      forkHookSource.indexOf('onError: (error) => {', guardAt),
    );
    expect(guarded).toContain('toast.success(`已从 v${versionNo} 新增一个条目`)');
    expect(guarded).toContain('navigate(`/maps/${mapEntry.id}/edit`)');
  });
});

/*
 * server 侧（fork 命名「{name} (自 v{n})」+ body.data 落库）不走源码断言 ——
 * `readSource` 只覆盖 web 包，且这条链路的真相在 DB 里，由 server 包的
 * `api.test.ts` 直接打接口验证（见该文件的 fork 用例）。
 */
