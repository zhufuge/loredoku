import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Rocket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  GAME_DIFFICULTY_COLORS,
  GAME_DIFFICULTY_LABELS,
  GAME_DIFFICULTY_TEXT_COLORS,
  type MapGameSummary,
  type PuzzleEntrySummary,
} from '@loredoku/shared';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { GameDeployDialog } from '@/components/game/GameDeployDialog';
import { useCancelGame, useGames } from '@/hooks/useGames';
import { usePuzzles } from '@/hooks/usePuzzles';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * 部署模块（v0.7.1 §7.4）：一行 = 一条在线的游戏。
 *
 * 取消部署是**假删**（`deleted_at`）：玩家的 `/play/{slug}` 立刻打不开，
 * 谜题列表的「已部署」徽标随之消失，但同一个访问路径可以再用 —— 所以弹窗里
 * 把这两件事都写清楚，别让作者以为删了就找不回来。
 *
 * v0.7.11：这一页自己就能**发起部署**。
 *
 * 以前它只能「看」——要部署得先跳到谜题列表找到那一版再点部署，回来核对结果。
 * 现在页头有一个「部署」按钮，弹窗里第一步就选谜题版本，选完用该版本的信息回填
 * 名称 / 路径 / 封面 / 难度。「前往谜题列表」那个按钮随之删掉：它唯一的用处
 * 就是绕路去做这件事。
 */
export function DeploymentsPage(): JSX.Element {
  const gamesQuery = useGames();
  const cancelMutation = useCancelGame();
  const [cancelTarget, setCancelTarget] = useState<MapGameSummary | null>(null);
  /** 刚复制成功的那一行的 slug —— 让勾号只出现在被点的那一行。 */
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [deployOpen, setDeployOpen] = useState(false);

  /**
   * 部署弹窗要的版本列表。只取已发布的版本行（`kind: 'version'`）——草稿行
   * 部署不了，列出来只会让人点了才发现。100 条足够覆盖任何真实工坊。
   */
  const versionsQuery = usePuzzles({
    kind: 'version',
    pageSize: 100,
    sort: 'updatedAt',
    order: 'desc',
  });

  useEffect(() => {
    document.title = '部署 · 格物';
  }, []);

  useEffect(() => {
    if (copiedSlug === null) return;
    const timer = setTimeout(() => setCopiedSlug(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedSlug]);

  const games = useMemo(() => gamesQuery.data ?? [], [gamesQuery.data]);
  const versions = versionsQuery.data?.list ?? null;

  /**
   * 某个版本已经部署过 → 用那条部署回填（同一个版本再部署就是覆盖它）。
   * 传函数而不是预先算一张表：列表和版本列表各自刷新时，弹窗永远读到最新的那份。
   */
  const existingGameFor = (entry: PuzzleEntrySummary): MapGameSummary | null =>
    games.find((game) => game.puzzleId === entry.id) ?? null;

  const copyPath = (game: MapGameSummary): void => {
    const path = `${window.location.origin}/play/${game.slug}`;
    void (async () => {
      try {
        await navigator.clipboard.writeText(path);
        setCopiedSlug(game.slug);
        toast.success('访问路径已复制');
      } catch {
        toast.error('复制失败，请手动选中');
      }
    })();
  };

  function renderBody(): JSX.Element {
    if (gamesQuery.isLoading) {
      return (
        <div className="space-y-2">
          {/* v0.7.9：骨架高 64（= 行高），原来是 80 —— 加载完成后整页会往上跳 16px。 */}
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      );
    }

    if (gamesQuery.isError) {
      return (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          {/* v0.7.9：与其余四页统一 —— 给出真正的原因，而不是只有「加载失败」。 */}
          <p className="text-sm text-muted-foreground">
            {gamesQuery.error instanceof Error ? gamesQuery.error.message : '部署列表加载失败'}
          </p>
          <Button variant="outline" onClick={() => void gamesQuery.refetch()}>
            重试
          </Button>
        </Card>
      );
    }

    if (games.length === 0) {
      return (
        // v0.7.8 §5：工坊五个列表页的空状态统一为「一句说明 + 一个主按钮」。
        // v0.7.11：按钮就是「部署」—— 空状态下一步要做的事，不再让人先去别处。
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-sm text-muted-foreground">还没有部署任何游戏</p>
          <Button onClick={() => setDeployOpen(true)}>
            <Rocket className="mr-1 h-3.5 w-3.5" />
            部署
          </Button>
        </Card>
      );
    }

    return (
      <Card className="overflow-hidden">
        {games.map((game) => {
          const initial = game.name.trim().charAt(0) || '游';
          return (
            <div
              key={game.id}
              className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
            >
              {/* v0.7.8 §10：缩略图 64×40、行高 64，与 `MapListRow` 完全同档 ——
                  两个「行列表」页面现在共用一套列语法（缩略图 / 名称 192 /
                  弹性中列 / 时间 208 / 操作 160）。原来是 80×48 与 w-56 / w-44 /
                  w-32，同一份 `formatDateTime` 在两页占两种宽度。 */}
              <span className="h-10 w-16 shrink-0 overflow-hidden rounded border bg-muted/40">
                {game.coverUrl ? (
                  <img
                    src={game.coverUrl}
                    alt={game.name}
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-secondary/40 text-sm font-semibold text-muted-foreground/60">
                    {initial}
                  </span>
                )}
              </span>

              <div className="w-48 shrink-0">
                <div className="truncate font-medium" title={game.name}>
                  {game.name}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  来源：{game.puzzleName} v{game.puzzleVersionNo}
                </div>
              </div>

              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium"
                style={{
                  backgroundColor: GAME_DIFFICULTY_COLORS[game.difficulty],
                  color: GAME_DIFFICULTY_TEXT_COLORS[game.difficulty],
                }}
              >
                {GAME_DIFFICULTY_LABELS[game.difficulty]}
              </span>

              <span className="w-16 shrink-0 tabular-nums text-sm text-muted-foreground">
                {game.gridSize} × {game.gridSize}
              </span>

              <button
                type="button"
                onClick={() => copyPath(game)}
                title="复制完整访问路径"
                className="min-w-0 flex-1 truncate text-left font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                /play/{game.slug}
              </button>

              <span className="w-52 shrink-0 truncate text-right text-xs text-muted-foreground">
                {formatDateTime(game.createdAt)}
              </span>

              <div className="flex w-40 shrink-0 items-center justify-end gap-1">
                {/*
                 * 用 <a target="_blank"> 而不是 navigate：游戏是给玩家看的独立页面，
                 * 作者往往要一边对照工坊一边试玩，抢掉当前页签会丢掉列表的滚动位置。
                 */}
                <a
                  href={`/play/${game.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  title="在新标签页打开游戏"
                  className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <IconButton
                  variant="ghost"
                  icon={
                    copiedSlug === game.slug ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )
                  }
                  label="复制访问路径"
                  onClick={() => copyPath(game)}
                />
                <IconButton
                  variant="ghost"
                  icon={<Trash2 className="h-4 w-4" />}
                  label="取消部署"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setCancelTarget(game)}
                />
              </div>
            </div>
          );
        })}
      </Card>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="部署"
        description={
          gamesQuery.isLoading ? '正在加载…' : `共 ${games.length} 个游戏在线。`
        }
        actions={
          <Button onClick={() => setDeployOpen(true)}>
            <Rocket className="mr-1 h-3.5 w-3.5" />
            部署
          </Button>
        }
      />

      {renderBody()}

      {/* v0.7.11：部署弹窗挂在这一页 —— 版本选择、回填与路径覆盖都在里面。 */}
      <GameDeployDialog
        puzzle={null}
        versions={versions}
        resolveExistingGame={existingGameFor}
        open={deployOpen}
        onOpenChange={setDeployOpen}
      />

      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open && !cancelMutation.isPending) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消部署「{cancelTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              玩家通过 /play/{cancelTarget?.slug} 将立即无法访问；可以再用同一个访问路径重新部署。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (!cancelTarget) return;
                cancelMutation.mutate(cancelTarget.id, {
                  onSuccess: () => setCancelTarget(null),
                });
              }}
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  处理中…
                </>
              ) : (
                '取消部署'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
