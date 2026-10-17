import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * FEAT-H05（docs/v0.4.2.md §5）＋ v0.5.0 SPEC-K13（docs/v0.5.0.md §7.4）：
 * 地图编辑器里的「发布」依然是「确认弹窗 → 保存 → 发请求」，但语义换成
 * **新增带版本标记的地图条目**（地图模块的版本管理），发布成功的去处也从
 * 作品页改成地图列表 / 地图版本预览页。
 *
 * - §5.2 发布前确认弹窗（标题 / 版本号预告 / 可选备注 / dirty 提示）；
 * - §7.4 成功后「查看该条目」回地图列表、「预览」去 `/maps/:id/:v/view`；
 * - §5.4 保存是 primary、发布是 outline，两个按钮**不合并**，且发布不再因 dirty 置灰。
 *
 * 与 `EditorPage.autoSave.test.ts` / `EditorPage.infoDrawer.test.ts` 同一手法：
 * 渲染 `EditorPage` 需要 query client / router / 预置 store，因此这里做源码断言。
 */

const pageSource = readSource('pages/EditorPage.tsx');

const toolbarSource = readSource('components/editor/EditorToolbar.tsx');

const versionsSource = readSource('hooks/useVersions.ts');

describe('EditorPage publish confirm dialog (FEAT-H05 §5.2)', () => {
  it('goes through a confirmation dialog instead of firing the request', () => {
    expect(pageSource).toContain('const [publishOpen, setPublishOpen] = useState(false);');
    expect(pageSource).toContain('const openPublishConfirm = (): void => {');
    expect(pageSource).toContain('onPublish={openPublishConfirm}');
    expect(pageSource).toContain('open={publishOpen}');
  });

  it('announces the version it is about to create', () => {
    // SPEC-K13：版本号从版本列表推导（fork 后取 MAX+1），兜底 currentVersionNo+1。
    expect(pageSource).toContain('const nextVersionNo = useMemo(() => {');
    expect(pageSource).toContain('Math.max(...versions.map((version) => version.versionNo)) + 1;');
    expect(pageSource).toContain('return (editor.currentVersionNo ?? 0) + 1;');
  });

  it('collects an optional note and passes it through trimmed', () => {
    expect(pageSource).toContain('const [publishNotes, setPublishNotes] = useState(\'\');');
    expect(pageSource).toContain('id="publish-notes"');
    expect(pageSource).toContain('const notes = publishNotes.trim();');
    expect(pageSource).toContain('publishMutation.mutate(');
    expect(pageSource).toContain('{ notes: notes.length > 0 ? notes : undefined }');
  });

  it('runs save → publish serially and aborts the publish when the save fails', () => {
    expect(pageSource).toContain('if (editor.dirty && !(await persist())) return;');
    const body = pageSource.slice(
      pageSource.indexOf('const confirmPublish = (): void => {'),
      pageSource.indexOf('const previewCellSize'),
    );
    expect(body.indexOf('await persist()')).toBeLessThan(body.indexOf('publishMutation.mutate('));
  });

  it('keeps the dialog open while the request flies', () => {
    expect(pageSource).toContain('if (!open && !publishMutation.isPending) setPublishOpen(false);');
    expect(pageSource).toContain('event.preventDefault();');
  });
});

describe('EditorPage publish success dialog (SPEC-K13 §7.4)', () => {
  it('opens from the publish result and closes back to null', () => {
    expect(pageSource).toContain(
      'const [publishedVersion, setPublishedVersion] = useState<MapVersionSummary | null>(null);',
    );
    expect(pageSource).toContain('setPublishedVersion(result.version ?? null);');
    expect(pageSource).toContain('open={publishedVersion !== null}');
  });

  it('routes back to the map list, or on to the version preview', () => {
    expect(pageSource).toContain('navigate(\'/projects\');');
    expect(pageSource).toContain('navigate(`/maps/${id}/${version.versionNo}/view`);');
    expect(pageSource).not.toContain('/works');
  });

  it('routes a validation failure into the existing 无法发布 dialog, with no second UI', () => {
    expect(pageSource).toContain('setPublishOpen(false);');
    expect(pageSource).toContain('setViolations(result.violations ?? []);');
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
    expect(versionsSource).toContain('const version = await versionsApi.publish(id, notes);');
    expect(versionsSource).toContain('return { ok: true, version };');
  });

  it('no longer fires a success toast — the success dialog replaces it', () => {
    const onSuccess = versionsSource.slice(
      versionsSource.indexOf('onSuccess: (result) => {'),
      versionsSource.indexOf('onError: (error) => {'),
    );
    expect(onSuccess).toContain('queryClient.invalidateQueries');
    expect(onSuccess).not.toContain('toast.success');
  });
});
