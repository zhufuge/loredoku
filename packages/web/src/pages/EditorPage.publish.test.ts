import { describe, expect, it } from 'vitest';

/**
 * FEAT-H05（docs/v0.4.2.md §5）：「发布」不再是一按就发请求。
 *
 * - §5.2 发布前确认弹窗（标题 / 版本号预告 / 可选备注 / dirty 提示）；
 * - §5.3 发布成功弹窗（「预览」+「前往作品页」，预览链接带 `v`）；
 * - §5.4 保存是 primary、发布是 outline，两个按钮**不合并**，且发布不再因 dirty 置灰。
 *
 * 与 `EditorPage.autoSave.test.ts` / `EditorPage.infoDrawer.test.ts` 同一手法：
 * 渲染 `EditorPage` 需要 query client / router / 预置 store，因此这里做源码断言。
 */

const pageSource =
  ((import.meta.glob('./EditorPage.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['./EditorPage.tsx'] ?? '').replace(/\r\n/g, '\n');

const toolbarSource =
  ((import.meta.glob('../components/editor/EditorToolbar.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['../components/editor/EditorToolbar.tsx'] ?? '').replace(
    /\r\n/g,
    '\n',
  );

const versionsSource =
  ((import.meta.glob('../hooks/useVersions.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['../hooks/useVersions.ts'] ?? '').replace(/\r\n/g, '\n');

describe('EditorPage publish confirm dialog (FEAT-H05 §5.2)', () => {
  it('goes through a confirmation dialog instead of firing the request', () => {
    expect(pageSource).toContain('const [publishOpen, setPublishOpen] = useState(false);');
    expect(pageSource).toContain('const openPublishConfirm = (): void => {');
    expect(pageSource).toContain('onPublish={openPublishConfirm}');
    expect(pageSource).toContain('open={publishOpen}');
  });

  it('announces the version it is about to create', () => {
    expect(pageSource).toContain('const nextVersionNo = (editor.currentVersionNo ?? 0) + 1;');
    expect(pageSource).toContain('发布会把当前画布内容存为一个新的作品版本（v{nextVersionNo}）');
  });

  it('collects an optional note and passes it through trimmed', () => {
    expect(pageSource).toContain('const [publishNotes, setPublishNotes] = useState(\'\');');
    expect(pageSource).toContain('id="publish-notes"');
    expect(pageSource).toContain('const notes = publishNotes.trim();');
    expect(pageSource).toContain('publishMutation.mutate(');
    expect(pageSource).toContain('{ notes: notes.length > 0 ? notes : undefined }');
  });

  it('warns about unsaved edits and offers 保存并发布 when dirty', () => {
    expect(pageSource).toContain('有未保存的修改，将先保存再发布。');
    expect(pageSource).toContain("'保存并发布'");
    expect(pageSource).toContain("'确认发布'");
  });

  it('runs save → publish serially and aborts the publish when the save fails', () => {
    expect(pageSource).toContain('if (editor.dirty && !(await persist())) return;');
    const body = pageSource.slice(
      pageSource.indexOf('const confirmPublish = (): void => {'),
      pageSource.indexOf('const previewCellSize'),
    );
    expect(body.indexOf('await persist()')).toBeLessThan(body.indexOf('publishMutation.mutate('));
  });

  it('keeps the dialog open while the request flies, and shows 发布中…', () => {
    expect(pageSource).toContain('if (!open && !publishMutation.isPending) setPublishOpen(false);');
    expect(pageSource).toContain('event.preventDefault();');
    expect(pageSource).toContain('发布中…');
  });
});

describe('EditorPage publish success dialog (FEAT-H05 §5.3)', () => {
  it('opens from the publish result and closes back to null', () => {
    expect(pageSource).toContain(
      'const [publishedVersion, setPublishedVersion] = useState<MapVersionSummary | null>(null);',
    );
    expect(pageSource).toContain('setPublishedVersion(result.version ?? null);');
    expect(pageSource).toContain('open={publishedVersion !== null}');
  });

  it('offers 预览 and 前往作品页, and the preview link carries the version number', () => {
    expect(pageSource).toContain('已发布 v{publishedVersion?.versionNo ?? \'\'}');
    expect(pageSource).toContain('前往作品页');
    expect(pageSource).toContain('navigate(\'/works\');');
    expect(pageSource).toContain(
      'navigate(`/works/${version.id}/view?project=${id}&v=${version.versionNo}`);',
    );
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
    expect(save).toContain('保存中…');
    expect(publish).toContain('发布中…');
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
    expect(badge).toContain('未保存');
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
