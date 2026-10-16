import { describe, expect, it } from 'vitest';

/**
 * FEAT-G02 (docs/v0.4.0.md §5) + OPT-W01 ~ OPT-W04 (docs/v0.4.1.md §1 ~ §4):
 * the works table is the deploy entry point.
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

describe('WorksPage table (OPT-W01 §1)', () => {
  it('keeps exactly five columns in the required order', () => {
    expect(pageSource).toContain("const COLUMNS = ['名称', '版本', '部署状态', '发布时间', '操作'] as const;");
    // The removed columns must be gone for good.
    for (const gone of ['作品编号', '参与者数', '区域数', '物品数', '备注', '地图名称']) {
      expect(pageSource).not.toContain(`'${gone}'`);
    }
  });

  it('moves the 已部署 badge into its own column', () => {
    // The name cell is plain text now; the badge lives in 部署状态.
    expect(pageSource).toContain('<td className="px-3 py-2 font-medium">{work.projectName}</td>');
    expect(pageSource).toContain('已部署');
    expect(pageSource).toContain('<span className="text-muted-foreground">—</span>');
  });
});

describe('WorksPage deploy entry (FEAT-G02 §5.1 + OPT-W02 §2)', () => {
  it('renders a deploy button on every row', () => {
    expect(pageSource).toContain('onClick={() => setDeployTarget(work)}');
    expect(pageSource).toContain("isDeployed ? '重新部署' : '部署'");
  });

  it('flags only the deployed version and jumps straight to the game page', () => {
    // OPT-W02: `deployed` is now per version, so the row needs both facts.
    expect(pageSource).toContain('const isDeployed = game !== null && work.deployed;');
    expect(pageSource).toContain('{isDeployed ? (');
    // projectId → game comes from the games listing, so the badge can deep-link
    // by access path (OPT-W04).
    expect(pageSource).toContain('const gameByProject = useMemo(');
    expect(pageSource).toContain('navigate(`/games/${game.slug}`)');
  });

  it('mounts the deploy dialog with the map’s current game', () => {
    expect(pageSource).toContain('<GameDeployDialog');
    expect(pageSource).toContain('open={deployTarget !== null}');
    // OPT-W03 §3: the dialog needs the stored values to prefill the re-deploy.
    expect(pageSource).toContain('existingGame={deployTarget ? gameByProject.get(deployTarget.projectId) ?? null : null}');
  });
});

describe('GameDeployDialog (FEAT-G02 §5.2 + OPT-W03 / OPT-W04)', () => {
  it('defaults the name to the work map name', () => {
    expect(dialogSource).toContain('const startName = work.projectName;');
    expect(dialogSource).toContain('setName(startName)');
    expect(dialogSource).toContain('maxLength={GAME_NAME_MAX_LENGTH}');
  });

  it('prefills the difficulty and the stored cover on a re-deploy', () => {
    // OPT-W03 §3.
    expect(dialogSource).toContain('const startDifficulty = existingGame?.difficulty ?? GAME_DIFFICULTY_DEFAULT;');
    expect(dialogSource).toContain('setDifficulty(startDifficulty)');
    expect(dialogSource).toContain('existingGame?.coverUrl ?? null');
    expect(dialogSource).toContain('showStoredCover');
    // Removing is explicit, and only then does the deploy clear the cover.
    expect(dialogSource).toContain('clearCover: coverRemoved && !cover,');
  });

  it('defaults the access path and keeps it in step with name and difficulty', () => {
    // OPT-W04 §4.2.
    expect(dialogSource).toContain('setSlug(buildDefaultSlug({ name: startName, difficulty: startDifficulty }));');
    expect(dialogSource).toContain('setSlug(buildDefaultSlug({ name, difficulty }));');
    expect(dialogSource).toContain('if (!open || slugTouched) return;');
    expect(dialogSource).toContain('setSlugTouched(true);');
    expect(dialogSource).toContain('maxLength={GAME_SLUG_MAX_LENGTH}');
  });

  it('validates the path before deploying and previews the URL', () => {
    expect(dialogSource).toContain('const problem = slugError(trimmedSlug);');
    expect(dialogSource).toContain("toast.error('请填写访问路径')");
    expect(dialogSource).toContain('`/games/${slug}`');
    expect(dialogSource).toContain('normalizeSlugInput(event.target.value)');
  });

  it('tells the author to type a path when the name derives nothing (Q13)', () => {
    expect(dialogSource).toContain('无法根据名称生成访问路径，请手动填写（仅限小写字母、数字与连字符）');
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

  it('sends the access path through the deploy payload', () => {
    expect(hookSource).toContain('slug,');
    expect(hookSource).toContain('clearCover,');
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
