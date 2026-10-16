import { describe, expect, it } from 'vitest';

/**
 * FEAT-G02 (docs/v0.4.0.md §5): the works table is the deploy entry point.
 *
 * Source-level assertions, the same technique as `EditorPage.infoDrawer.test.ts`
 * — the page needs a live query client to render, and the rules being protected
 * are wiring rules (which hook feeds which element, which API the dialog calls).
 */

const pageSource =
  (import.meta.glob('./WorksPage.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['./WorksPage.tsx'] ?? '';

const dialogSource =
  (import.meta.glob('../components/game/GameDeployDialog.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['../components/game/GameDeployDialog.tsx'] ?? '';

const hookSource =
  (import.meta.glob('../hooks/useGames.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['../hooks/useGames.ts'] ?? '';

describe('WorksPage deploy entry (FEAT-G02 §5.1)', () => {
  it('renders a deploy button on every row', () => {
    expect(pageSource).toContain('onClick={() => setDeployTarget(work)}');
    expect(pageSource).toContain("work.deployed ? '重新部署' : '部署'");
  });

  it('flags deployed rows and jumps straight to the game page', () => {
    expect(pageSource).toContain('{work.deployed ? (');
    expect(pageSource).toContain('已部署');
    // projectId → gameId comes from the games listing, so the badge can deep-link.
    expect(pageSource).toContain('const gameIdByProject = useMemo(');
    expect(pageSource).toContain('navigate(`/games/${gameId}`)');
  });

  it('mounts the deploy dialog', () => {
    expect(pageSource).toContain('<GameDeployDialog');
    expect(pageSource).toContain('open={deployTarget !== null}');
  });
});

describe('GameDeployDialog (FEAT-G02 §5.2)', () => {
  it('defaults the name to the work map name', () => {
    expect(dialogSource).toContain('setName(work.projectName)');
    expect(dialogSource).toContain('maxLength={GAME_NAME_MAX_LENGTH}');
  });

  it('offers the five difficulty tiers from the shared palette', () => {
    expect(dialogSource).toContain('GAME_DIFFICULTY_LEVELS.map((level) => (');
    expect(dialogSource).toContain('backgroundColor: GAME_DIFFICULTY_COLORS[level]');
    expect(dialogSource).toContain('GAME_DIFFICULTY_DEFAULT');
  });

  it('stages the cover in the dialog and uploads it after the deploy', () => {
    // The upload targets the new game id, so it runs once the row exists.
    expect(dialogSource).toContain('cover,');
    expect(dialogSource).toContain('event.target.value =');
    expect(hookSource).toContain('const game = await gamesApi.deploy(projectId,');
    expect(hookSource).toContain('if (cover) {');
    expect(hookSource).toContain('await gamesApi.uploadCover(game.id, cover)');
  });

  it('invalidates the games and works listings after a deploy', () => {
    expect(hookSource).toContain('void queryClient.invalidateQueries({ queryKey: gameKeys.all })');
    expect(hookSource).toContain('void queryClient.invalidateQueries({ queryKey: versionKeys.all })');
  });

  it('deploys with the trimmed name and closes on success', () => {
    expect(dialogSource).toContain('const trimmed = name.trim()');
    expect(dialogSource).toContain("toast.error('请填写游戏名称')");
    expect(dialogSource).toContain('{ onSuccess: () => onOpenChange(false) }');
  });

  it('warns that a second deploy of the same map overwrites the first', () => {
    expect(dialogSource).toContain('再次部署将覆盖此前的游戏');
  });
});
