import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * FEAT-H05（docs/v0.4.2.md §5）＋ v0.5.0 SPEC-K13（docs/v0.5.0.md §7.4）：
 * 地图编辑器里的「发布」依然是「确认弹窗 → 保存 → 发请求」，但语义换成
 * **新增带版本标记的地图条目**（地图模块的版本管理）。
 *
 * - §5.2 发布前确认弹窗（标题 / 版本号预告 / dirty 提示）；
 * - §5.4 保存是 primary、发布是 outline，两个按钮**不合并**，且发布不再因 dirty 置灰。
 *
 * v0.6.0: 发布成功后**只弹 toast，不再有跳转按钮**（用户反馈：提示即可）。
 * 曾经的「查看该条目 / 预览」成功弹窗（SPEC-K10 §7.2）整段删除，新版本号
 * 随 toast 文案给出；流程不再把 `MapVersionSummary` 带回页面。
 *
 * v0.5.6: the confirm flow moved into `useEditorPublish`; the page keeps the
 * dialogs' JSX, so the two files are asserted side by side.
 *
 * 与 `EditorPage.autoSave.test.ts` / `EditorPage.infoDrawer.test.ts` 同一手法：
 * 渲染 `EditorPage` 需要 query client / router / 预置 store，因此这里做源码断言。
 */

const pageSource = readSource('pages/EditorPage.tsx');

const publishHookSource = readSource('hooks/useEditorPublish.ts');

const toolbarSource = readSource('components/editor/EditorToolbar.tsx');

const versionsSource = readSource('hooks/useVersions.ts');

describe('EditorPage publish confirm dialog (FEAT-H05 §5.2)', () => {
  it('goes through a confirmation dialog instead of firing the request', () => {
    expect(publishHookSource).toContain('const [publishOpen, setPublishOpen] = useState(false);');
    expect(publishHookSource).toContain('const openPublishConfirm = (): void => {');
    expect(pageSource).toContain('onPublish={handlePublishClick}');
    expect(pageSource).toContain('open={publishOpen}');
  });

  it('announces the version it is about to create', () => {
    // SPEC-K13：版本号从版本列表推导（fork 后取 MAX+1），兜底 currentVersionNo+1。
    expect(publishHookSource).toContain('const nextVersionNo = useMemo(() => {');
    expect(publishHookSource).toContain('Math.max(...versions.map((version) => version.versionNo)) + 1;');
    expect(publishHookSource).toContain('return (currentVersionNo ?? 0) + 1;');
  });

  it('v0.5.8 §4: the note field is gone — a second confirmation is the ask', () => {
    expect(publishHookSource).not.toContain('publishNotes');
    expect(pageSource).not.toContain('publish-notes');
    // 二次确认文本留在 AlertDialogDescription 里。
    expect(pageSource).toContain('发布后该版本不可修改。');
    expect(pageSource).toContain('确认发布');
  });

  it('runs save → publish serially and aborts the publish when the save fails', () => {
    expect(publishHookSource).toContain('if (dirty && !(await persist())) return;');
    const body = publishHookSource.slice(
      publishHookSource.indexOf('const confirmPublish = (): void => {'),
      publishHookSource.indexOf('return {'),
    );
    expect(body.indexOf('await persist()')).toBeLessThan(body.indexOf('publishMutation.mutate('));
  });

  it('keeps the dialog open while the request flies', () => {
    expect(pageSource).toContain('if (!open && !publishMutation.isPending) setPublishOpen(false);');
    expect(pageSource).toContain('event.preventDefault();');
  });
});

describe('EditorPage publish success feedback (SPEC-K13 §7.4, v0.6.0)', () => {
  it('announces the new version with a toast and nothing else', () => {
    // v0.6.0: 成功弹窗（查看该条目 / 预览）整段删除，只留提示。
    expect(publishHookSource).toContain('toast.success(`已发布 v${result.version?.versionNo ?? \'\'}`');
    expect(publishHookSource).toContain("description: '已在地图列表新增条目。',");
    // 流程不再把发布结果带回页面。
    expect(publishHookSource).not.toContain('publishedVersion');
    expect(publishHookSource).not.toContain('setPublishedVersion');
  });

  it('has no post-publish navigation left in the page', () => {
    expect(pageSource).not.toContain('open={publishedVersion !== null}');
    expect(pageSource).not.toContain('查看该条目');
    // 唯一的 /views 导航是版本历史面板的预览（EditorPage.tsx onPreview），
    // 与发布成功无关；发布弹窗自身不再 navigate 任何地方。
    expect(pageSource).not.toContain('navigate(`/maps/${id}/views');
  });

  it('routes a validation failure into the existing 无法发布 dialog, with no second UI', () => {
    expect(publishHookSource).toContain('setPublishOpen(false);');
    expect(publishHookSource).toContain('setViolations(result.violations ?? []);');
    // Exactly one such dialog: the publish path reuses it instead of adding one.
    expect(pageSource.split('<AlertDialogTitle>无法发布</AlertDialogTitle>').length - 1).toBe(1);
  });
});

describe('EditorToolbar button hierarchy (FEAT-H05 §5.4)', () => {
  /** The whole `<Button …>…</Button>` element that wraps an `onClick` handler. */
  function buttonElement(handler: string): string {
    const handlerAt = toolbarSource.indexOf(handler);
    const open = toolbarSource.lastIndexOf('<Button', handlerAt);
    const close = toolbarSource.indexOf('</Button>', handlerAt);
    return toolbarSource.slice(open, close);
  }

  it('keeps 保存 and 发布 as two buttons, with 保存 as the primary one', () => {
    const save = buttonElement('onClick={onSave} disabled={saving || !dirty}');
    const publish = buttonElement('onClick={onPublish}');
    // 保存：默认（primary）variant；发布：outline。
    expect(save).not.toContain('variant="outline"');
    expect(publish).toContain('variant="outline"');
  });

  it('publish stays clickable while dirty — only 保存中 / 发布中 disable it', () => {
    const publish = buttonElement('onClick={onPublish}');
    expect(publish).toContain('disabled={saving || publishing}');
    expect(publish).not.toContain('dirty');
  });

  it('marks the unsaved state with a clickable 未保存 badge that saves', () => {
    const badgeAt = toolbarSource.indexOf('title="有未保存的修改，点击立即保存"');
    expect(badgeAt).toBeGreaterThan(-1);
    const badge = toolbarSource.slice(
      toolbarSource.lastIndexOf('<button', badgeAt),
      toolbarSource.indexOf('</button>', badgeAt),
    );
    expect(badge).toContain('onClick={onSave}');
  });
});

describe('usePublishProject carries the version back (FEAT-H05 §5.3)', () => {
  it('stops dropping the version the API already returns', () => {
    expect(versionsSource).toContain('version?: MapVersionSummary;');
    // v0.5.8 第三阶段：发布带上用户填的版本号（`undefined` = 服务端 MAX+1）。
    expect(versionsSource).toContain('const published = await versionsApi.publish(id, version);');
    expect(versionsSource).toContain('useMutation<PublishResult, unknown, number | undefined>');
    expect(versionsSource).toContain('return { ok: true, version: published };');
  });

  it('keeps the data hook free of toasts — the flow hook owns the feedback', () => {
    // v0.6.0: 成功提示挪到 useEditorPublish；usePublishProject 只负责失效缓存。
    const onSuccess = versionsSource.slice(
      versionsSource.indexOf('onSuccess: (result) => {'),
      versionsSource.indexOf('onError: (error) => {'),
    );
    expect(onSuccess).toContain('queryClient.invalidateQueries');
    expect(onSuccess).not.toContain('toast.success');
    // 而发布流程 hook 里必须有这个 toast。
    expect(publishHookSource).toContain('toast.success(`已发布 v${result.version?.versionNo ?? \'\'}`');
  });
});

/**
 * v0.5.8 第三阶段（docs/map-table-merge-design.md §4.2）：发布弹窗里多了一个
 * **版本号输入框**，预填血统 `MAX+1`，用户可改成任意正整数（可填空洞号）。
 * 没改就发 `undefined`，交给服务端续号 —— 免得拿着过期的默认值撞号。
 */
describe('发布弹窗：版本号可改（v0.5.8 第三阶段）', () => {
  it('预填默认号，并在每次打开弹窗时重置', () => {
    expect(publishHookSource).toContain("const [versionInput, setVersionInput] = useState('');");
    const open = publishHookSource.slice(
      publishHookSource.indexOf('const openPublishConfirm = (): void => {'),
      publishHookSource.indexOf('const confirmPublish = (): void => {'),
    );
    expect(open).toContain('setVersionInput(String(nextVersionNo));');
    expect(open).toContain('setVersionError(null);');
  });

  it('只认正整数，且血统内不可重号（软删行由服务端兜底）', () => {
    const body = publishHookSource.slice(
      publishHookSource.indexOf('const validateVersion = (value: string): string | null => {'),
      publishHookSource.indexOf('const openPublishConfirm'),
    );
    expect(body).toContain("if (!/^\\d+$/.test(trimmed)) return '版本号需为正整数';");
    expect(body).toContain('version.versionNo === parsed');
    expect(body).toContain('已存在于该地图血统中');
  });

  it('不改输入框就发 undefined，改了才发数字', () => {
    expect(publishHookSource).toContain(
      "trimmed === '' || Number(trimmed) === nextVersionNo ? undefined : Number(trimmed);",
    );
    expect(publishHookSource).toContain('publishMutation.mutate(explicit, {');
  });

  it('校验不通过时拦在本地，不发请求', () => {
    const body = publishHookSource.slice(
      publishHookSource.indexOf('const confirmPublish = (): void => {'),
      publishHookSource.indexOf('return {'),
    );
    expect(body).toContain('if (error) {');
    expect(body.indexOf('validateVersion(versionInput)')).toBeLessThan(
      body.indexOf('publishMutation.mutate('),
    );
  });

  it('弹窗里有输入框与行内错误位，标题跟着输入走', () => {
    expect(pageSource).toContain('id="publish-version"');
    expect(pageSource).toContain('value={versionInput}');
    expect(pageSource).toContain('onBlur={() => setVersionError(validateVersion(versionInput))}');
    expect(pageSource).toContain("{versionError ?? `默认 v${nextVersionNo}，可改成任意正整数（不必连续）。`}");
    expect(pageSource).toContain(
      "发布为 v{versionInput.trim() === '' ? nextVersionNo : versionInput.trim()}？",
    );
  });
});
