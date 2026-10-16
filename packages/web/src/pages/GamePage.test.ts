import { describe, expect, it } from 'vitest';

/**
 * FEAT-G03 (docs/v0.4.0.md §6) + SPEC-G03 / SPEC-G04 — source-level guards for
 * the game page, the same technique as `EditorPage.infoDrawer.test.ts`.
 *
 * What must not regress: the roster and the map are the **preview's** (same
 * component, same state machine), the operation cursor box is gone, and the two
 * game layers plus the toolbar state machine are wired to `lib/gamePlacement`.
 */

const pageSource =
  (import.meta.glob('./GamePage.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['./GamePage.tsx'] ?? '';

const routerSource =
  (import.meta.glob('../router.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['../router.tsx'] ?? '';

describe('GamePage (FEAT-G03)', () => {
  it('is a top-level route outside the app shell, keyed by the access path', () => {
    // FEAT-L04 (docs/v0.5.1.md §4): `/play/:slug` — `/games` is gone.
    expect(routerSource).toContain("path: '/play/:slug'");
    expect(routerSource).toContain('element: <GamePage />');
    expect(routerSource).not.toContain("path: '/games");
    expect(routerSource).not.toContain('/play/:gameId');
    // It must not live inside the AppShell children array.
    const shellChildren = routerSource.slice(
      routerSource.indexOf('element: <AppShell />'),
      routerSource.indexOf("path: '/editor/:projectId'"),
    );
    expect(shellChildren).not.toContain('GamePage');
  });

  it('resolves the game by slug', () => {
    expect(pageSource).toContain('const { slug: slugParam } = useParams();');
    expect(pageSource).toContain('useGameDetail(slug)');
    // A bare /play/:slug that matches nothing must not crash the page.
    expect(pageSource).toContain('游戏不存在或加载失败。');
    // FEAT-L04: both escapes lead back to the new game list.
    expect(pageSource).toContain("navigate('/play')");
    expect(pageSource).not.toContain("navigate('/games')");
  });

  it('reuses the preview roster and the linkage state machine', () => {
    expect(pageSource).toContain('<ParticipantPanel');
    expect(pageSource).toContain('readOnly');
    expect(pageSource).toContain('reduceLinkageActivation');
    expect(pageSource).toContain('onActivateClick={handleCardClick}');
  });

  it('renders the preview map plus the two game layers', () => {
    expect(pageSource).toContain('<MapGamePlacementLayer');
    expect(pageSource).toContain('<MapGameToolHintLayer');
    // Every preview layer the spec lists is still mounted.
    for (const layer of [
      'MapBackgroundLayer',
      'MapRegionFillLayer',
      'MapHighlightLayer',
      'MapRegionHighlightLayer',
      'MapNonStandableMaskLayer',
      'MapRegionOutlineLayer',
      'MapGridSeparatorLayer',
      'MapObjectLayer',
      'MapRegionLabelLayer',
      'MapCanvasFrameLayer',
      'MapMouseCursorBoxLayer',
      'MapRulerStrips',
    ]) {
      expect(pageSource).toContain(`<${layer}`);
    }
  });

  it('does not render the operation cursor box', () => {
    expect(pageSource).not.toContain('MapOperationCursorBoxLayer');
  });

  it('marks exclusions with an × button and no view cluster', () => {
    // 验收补充：禁止按钮用 X 图标；画布固定自适应，没有平移 / 缩放 / 重置。
    expect(pageSource).toContain('<X className="h-5 w-5 text-red-500" />');
    expect(pageSource).not.toContain('<Ban');
    for (const gone of ['zoomBy', 'clampZoom', 'zoomAtPoint', 'setPanning', 'panRef', 'panMovedRef']) {
      expect(pageSource).not.toContain(gone);
    }
    expect(pageSource).not.toContain('RotateCcw');
    expect(pageSource).not.toContain('重置视图');
    // The ruler toggle stays — it is a display preference, not a view transform.
    expect(pageSource).toContain('显示 / 隐藏标尺');
  });

  it('lays out three columns', () => {
    expect(pageSource).toContain('flex h-screen flex-col overflow-hidden');
    expect(pageSource).toContain('flex min-h-0 flex-1');
    // Left info column, centre canvas, right toolbar.
    expect(pageSource).toContain('w-[256px] shrink-0 flex-col border-r');
    expect(pageSource).toContain('relative min-h-0 flex-1 select-none overflow-hidden');
    expect(pageSource).toContain('w-[84px] shrink-0 flex-col items-center');
  });

  it('arms a participant for placement on card click, numbered from 1', () => {
    // The panel speaks 0-based slot indices; the placement layer numbers
    // participants from 1 (SPEC-G01 §7.1).
    expect(pageSource).toContain("setMode({ kind: 'placing', participantId })");
    expect(pageSource).toContain('const participantId = index + 1;');
    expect(pageSource).toContain("{ type: 'click', participantId: index }");
  });

  it('keeps the placing state while another card is hovered', () => {
    // v0.4.0 验收补充：悬停另一张卡片只切换联动预览，移开后恢复已武装参与者
    // 的激活；退出放置态只能靠再次点击参与者或工具按钮。
    const hover = pageSource.slice(
      pageSource.indexOf('onDeactivateHover={(index) => {'),
      pageSource.indexOf('onActivateClick={handleCardClick}'),
    );
    expect(hover).toContain("mode.kind === 'placing'");
    expect(hover).toContain('participantId: mode.participantId - 1,');
    expect(hover).toContain("{ type: 'leave', participantId: index }");
    // BUG-G02 (docs/v0.4.1.md §9): the restore must be the idempotent event —
    // `click` toggles, so leaving the armed card itself would switch it off.
    expect(hover).toContain("type: 'restore',");
    expect(hover).not.toContain("type: 'click'");
  });

  it('dispatches a cell interaction by the active mode', () => {
    const dispatch = pageSource.slice(
      pageSource.indexOf('const dispatchCell ='),
      pageSource.indexOf('const startClearPress ='),
    );
    expect(dispatch).toContain('placeParticipant(state, {');
    expect(dispatch).toContain('placeForbidden(state, { x, y, noStandCells })');
    expect(dispatch).toContain('clearCell(state, { x, y })');
    // 放置态下 variant 区分短按（编号）与长按（头像）。
    expect(dispatch).toContain('variant,');
    // SPEC-G06: the row/column sweep needs the board size.
    expect(dispatch).toContain('gridSize,');
  });

  it('explains a refused placement instead of failing silently', () => {
    // SPEC-G05 §5.2: the toast names the cell the participant already owns.
    expect(pageSource).toContain('const block = placementBlockReason({');
    expect(pageSource).toContain('toast.error(describeBlock(block, mode.participantId, placementState.board))');
    // CLAR-H13（docs/v0.4.2.md §1.1）: the toast says 编号 — a participant is not
    // the same thing as the participant's number.
    expect(pageSource).toContain('该格已有编号 ${participantId}');
    // SPEC-J05 §3.6（docs/v0.4.3.md）：编号可以落在多个格子上，所以「已在别处」
    // 这条拒绝只剩头像一种情况，文案也跟着改成头像，不再报「编号 N 已放置在 …」。
    expect(pageSource).toContain('该参与者的头像已放置在 ${formatCellLabel(at)}');
    expect(pageSource).not.toContain('编号 ${participantId} 已放置在');
  });

  it('dims the roster cards of avatar-placed participants only (SPEC-L05)', () => {
    // SPEC-G05 §5.3: derived from the board, so a clear/undo restores it.
    // v0.5.1 SPEC-L05: a 编号 no longer dims the card — only the avatar does.
    expect(pageSource).toContain('avatarPlacedParticipantIds(placementState.board)');
    expect(pageSource).not.toContain('placedParticipantIds(placementState.board)');
    expect(pageSource).toContain('placedSlotIndices={placedSlotIndices}');
  });

  describe('left column slim-down (v0.5.1 SPEC-L06 ~ SPEC-L09)', () => {
    it('shows the brand after the back arrow and the name on the next line', () => {
      // FEAT-L07 + v0.5.3 FEAT-N03: `[←] [Logo]`, then `{name} {n}x{n}`.
      expect(pageSource).toContain("from '@/components/layout/BrandLogo'");
      expect(pageSource).toContain('<BrandLogo');
      expect(pageSource).toContain('{game.name} {gridSize}x{gridSize}');
    });

    it('no longer shows a cover (SPEC-L06)', () => {
      // The 80×56 thumbnail and its initial-letter placeholder are gone.
      expect(pageSource).not.toContain('game.coverUrl');
      expect(pageSource).not.toContain("|| '游'");
    });

    it('no longer shows difficulty, source map or participant count (SPEC-L08)', () => {
      expect(pageSource).not.toContain('GAME_DIFFICULTY_COLORS');
      expect(pageSource).not.toContain('GAME_DIFFICULTY_LABELS');
      expect(pageSource).not.toContain('game.difficulty');
      expect(pageSource).not.toContain('来自地图 v');
      expect(pageSource).not.toContain('game.versionNo');
      expect(pageSource).not.toContain('参与者 {slots.filter(Boolean).length} 人');
    });

    it('no longer shows the long instructions paragraph (SPEC-L09)', () => {
      expect(pageSource).not.toContain('点击参与者进入放置状态：点击格子放置的是该参与者的「编号」');
      expect(pageSource).not.toContain('编号与参与者不是一个东西');
      expect(pageSource).not.toContain('需要手动排除时，用工具栏的「禁止符号」');
      expect(pageSource).not.toContain('已放置的参与者卡片会变淡');
    });

    it('keeps the three-column shell and the participant panel', () => {
      expect(pageSource).toContain('w-[256px] shrink-0 flex-col border-r');
      expect(pageSource).toContain('<ParticipantPanel');
      expect(pageSource).toContain('readOnly');
    });
  });

  it('validates before submitting and lists every problem', () => {
    // FEAT-V01 §8.
    expect(pageSource).toContain('const result = validatePlacement({');
    expect(pageSource).toContain('if (!result.passed) {');
    expect(pageSource).toContain('setValidationIssues(result.issues);');
    expect(pageSource).toContain('submitPlacement(state)');
    expect(pageSource).toContain('校验通过，已提交');
    // The dialog shows the issues and a close button only.
    expect(pageSource).toContain('提交未通过');
    expect(pageSource).toContain('validationIssues?.map((issue, index) => (');
  });

  it('places a number on a tap and the avatar on a long-press', () => {
    // v0.4.0 验收补充 + v0.4.3 SPEC-J03：点击格子切换参与者编号，长按格子放头像。
    expect(pageSource).toContain("dispatchCell(cell.x, cell.y, 'number')");
    expect(pageSource).toContain("dispatchCell(x, y, 'image')");
    // 长按定时器与工具栏清除按钮同源（GAME_LONG_PRESS_MS）。
    const press = pageSource.slice(
      pageSource.indexOf('const startCellPress ='),
      pageSource.indexOf('const endCellPress ='),
    );
    expect(press).toContain('GAME_LONG_PRESS_MS');
    // 长按生效后，同一手势末尾的 click 必须被吞掉。
    expect(pageSource).toContain('press?.fired');
    expect(pageSource).toContain('startCellPress(cell.x, cell.y)');
  });

  it('never sweeps the row/column itself — that lives in placeParticipant (SPEC-J02)', () => {
    // SPEC-J02 §2.2：页面只负责把「短按 / 长按」报上去，是否补 × 由纯函数决定
    // （现在是「只有长按补」）。页面层不得自己碰 autoForbiddenCells。
    expect(pageSource).not.toContain('autoForbiddenCells');
    // 短按与长按走同一条派发路径，只有 variant 不同。
    expect(pageSource).toContain("dispatchCell(cell.x, cell.y, 'number')");
    expect(pageSource).toContain("dispatchCell(x, y, 'image')");
  });

  it('long-pressing the clear button wipes the whole board', () => {
    expect(pageSource).toContain('GAME_LONG_PRESS_MS');
    expect(pageSource).toContain('setPlacementState((state) => clearAll(state))');
    expect(pageSource).toContain('onPointerDown={startClearPress}');
    expect(pageSource).toContain('onPointerUp={endClearPress}');
  });

  it('blocks undo past the submission point', () => {
    expect(pageSource).toContain('submitPlacement(state)');
    expect(pageSource).toContain('canUndo(placementState)');
    expect(pageSource).toContain('placementState.submittedPastLength');
  });

  it('merges placed × into the non-standable mask', () => {
    expect(pageSource).toContain('forbiddenCells(placementState.board)');
    expect(pageSource).toContain('noStandCells={maskCells}');
  });
});
