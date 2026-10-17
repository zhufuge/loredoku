import { describe, expect, it } from 'vitest';
import { codeOf, readSource } from '@/testing/source';

/**
 * v0.5.0 SPEC-K03（docs/v0.5.0.md §2.4 / §5.3）：谜题列表页承接原作品页。
 *
 * 表头 5 列与操作按钮和 v0.4.3 作品页**逐字一致**（交付标准 #2），变的只是数据
 * 源：一条谜题引用 `(mapProjectId, mapVersionNo)`，部署以**谜题**为单位
 * （CONS-K16：一个谜题一个游戏），导出的是谜题自己的 `PuzzleDraft` v1。
 *
 * 源码断言（同 `EditorPage.infoDrawer.test.ts`）：整页渲染需要 query client。
 */

const pageSource = readSource('pages/PuzzlesPage.tsx');

const deployDialogSource = readSource('components/game/GameDeployDialog.tsx');

const routerSource = codeOf('router.tsx');

describe('PuzzlesPage table（交付标准 #2：与 v0.4.3 作品页逐字一致）', () => {
  it('renders 版本 as the referenced map version number', () => {
    expect(pageSource).toContain('v{puzzle.mapVersionNo}');
  });

  it('shows the four row actions plus the deploy state badge', () => {
    expect(pageSource).toContain("onClick={() => navigate(`/puzzles/${puzzle.id}/view`)}");
    expect(pageSource).toContain("onClick={() => navigate(`/play/${game.slug}`)}");
  });
});

describe('PuzzlesPage deploy wiring（CONS-K16：一个谜题一个游戏）', () => {
  it('opens the deploy dialog for the puzzle, prefilled from its existing game', () => {
    expect(pageSource).toContain('const [deployTarget, setDeployTarget] = useState<PuzzleSummary | null>(null);');
    expect(pageSource).toContain('puzzle={deployTarget}');
    expect(pageSource).toContain('existingGame={deployTarget ? gameByPuzzle.get(deployTarget.id) ?? null : null}');
  });

  it('maps games by puzzleId', () => {
    const mapping = pageSource.slice(
      pageSource.indexOf('const gameByPuzzle = useMemo(() => {'),
      pageSource.indexOf('}, [gamesQuery.data]);'),
    );
    expect(mapping).toContain('if (game.puzzleId !== null) map.set(game.puzzleId, game);');
  });

  it('the dialog deploys by puzzle id and carries the map version in its copy', () => {
    expect(deployDialogSource).toContain('puzzle: PuzzleSummary | null;');
    const call = deployDialogSource.slice(
      deployDialogSource.indexOf('deploy.mutate('),
      deployDialogSource.indexOf('{ onSuccess: () => onOpenChange(false) },'),
    );
    expect(call).toContain('puzzleId: puzzle.id,');
    expect(call).toContain('difficulty,');
    expect(call).toContain('clearCover: coverRemoved && !cover,');
    expect(call).toContain('cover,');
    expect(deployDialogSource).toContain(
      '`把谜题「${puzzle.name} v${puzzle.mapVersionNo}」部署为可玩的游戏。相同谜题只能部署一个游戏，再次部署将覆盖此前的游戏。`',
    );
  });
});

describe('PuzzlesPage export / duplicate / delete（FEAT-K08 / §2.4）', () => {
  it('exports the puzzle’s own PuzzleDraft as a JSON download', () => {
    expect(pageSource).toContain('const detail = await puzzlesApi.detail(puzzle.id);');
    expect(pageSource).toContain('anchor.download = `${puzzle.name}-puzzle.json`;');
    expect(pageSource).toContain('type: \'application/json\'');
  });

  it('duplicates into the editor of the new puzzle', () => {
    expect(pageSource).toContain('duplicatePuzzle.mutate(puzzle.id, {');
    expect(pageSource).toContain('onSuccess: (created) => navigate(`/puzzles/${created.id}/edit`),');
  });

  it('asks before deleting a puzzle', () => {
    expect(pageSource).toContain('deletePuzzle.mutate(target.id, { onSettled: () => setDeleteTarget(null) });');
  });
});

describe('PuzzlesPage routing（§2.4）', () => {
  it('is the /puzzles route and opens 新建谜题 from ?new=', () => {
    expect(routerSource).toContain("{ path: 'puzzles', element: <PuzzlesPage /> },");
    expect(routerSource).toContain("path: '/puzzles/:puzzleId/edit',");
    expect(routerSource).toContain("path: '/puzzles/:puzzleId/view',");
    expect(pageSource).toContain("const [createOpen, setCreateOpen] = useState(() => searchParams.get('new') !== null);");
    expect(pageSource).toContain('<CreatePuzzleDialog');
  });

  it('has no trace of the removed works module', () => {
    expect(routerSource).not.toContain('/works');
    expect(routerSource).not.toContain('WorksPage');
    expect(pageSource).not.toContain('WorksPage');
    expect(pageSource).not.toContain('worksApi');
  });
});
