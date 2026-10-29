import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Rocket } from 'lucide-react';
import type { Theme } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ColorInput } from '@/components/ui/color-input';
import { PageHeader } from '@/components/layout/PageHeader';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { ExportBundleDialog } from '@/components/theme/ExportBundleDialog';
import { ThemeActionsMenu } from '@/components/theme/ThemeActionsMenu';
import { useGames } from '@/hooks/useGames';
import {
  useDeleteTheme,
  useDeployTheme,
  useThemeDeployments,
  useUpdateTheme,
} from '@/hooks/useThemes';
import { SETTINGS_THEMES_PATH, type ContentModuleKey } from '@/lib/workspace';
import { MODULE_ICONS } from '@/lib/moduleIcons';

/**
 * v0.8.2：选色的起点。石青是浅色下的 `--primary`，第一次按下取色器就从这里开始 ——
 * 它不是「默认识别色」，只是不让取色器从一个随机黑开始。
 */
const ACCENT_FALLBACK = '#326385';

/**
 * v0.8.2：四个入口只写「去哪、叫什么」，图标从 `MODULE_ICONS` 取 —— 与顶栏同一枚。
 * 原来这里自带一份图标表，地图用的是 `MapPin`，顶栏用的是 `Map`：同一个模块在
 * 两处长得不一样，而读者恰恰是「先在顶栏看见它，再在这四格里找它」。
 */
const COUNT_LINKS = [
  { module: 'assets', label: '资源' },
  { module: 'maps', label: '地图' },
  { module: 'characters', label: '角色' },
  { module: 'puzzles', label: '谜题' },
] as const satisfies ReadonlyArray<{ module: ContentModuleKey; label: string }>;

/**
 * v0.8.0 §18：`/:code/overview` —— 一个工作空间自己的那页（导航第一项「概览」）。
 *
 * 上一版这一屏是「主题工作台」：顶栏里一条面包屑 + 四个带计数的 tab + 一列平铺
 * 内容。有了工作空间之后，那四个 tab 就是顶栏的四个模块 —— 同一件事说两遍，
 * 而且第二遍更弱（只能看，不能干活）。
 *
 * 所以这一页只剩下「这个空间是什么」：
 *
 * - **四个计数**当入口（大数字 + 箭头），点了就去对应模块；
 * - **几行事实**：编码、缺省风格、上线状态 —— 都是「别处改不了、但需要随时知道」的；
 * - **动作**：上线（唯一有外部结果的事）在页头，导出 / 改名 / 删除在 `⋯` 里（§16.2）。
 */
export function ThemeOverviewPage(): JSX.Element {
  const workspace = useWorkspace();
  const theme = workspace?.theme ?? null;
  const [deployOpen, setDeployOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deploymentsQuery = useThemeDeployments();
  const gamesQuery = useGames();

  // 包是「已经能玩的那几关」（§11.1），所以清单要的是部署行，不是主题库。
  const deployedGames = useMemo(
    () => (gamesQuery.data ?? []).filter((game) => game.themeCode === theme?.code),
    [gamesQuery.data, theme?.code],
  );
  const collection = useMemo(
    () =>
      (deploymentsQuery.data ?? []).find((entry) => entry.themeCode === theme?.code) ?? null,
    [deploymentsQuery.data, theme?.code],
  );

  useEffect(() => {
    if (theme) document.title = `${theme.name} · 概览 · 格物`;
  }, [theme]);

  if (!workspace || !theme) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">没有选中主题。</p>
        <Button variant="outline" asChild>
          <Link to={SETTINGS_THEMES_PATH}>去主题配置</Link>
        </Button>
      </section>
    );
  }

  const styleSet = Boolean(theme.data.style);
  const accent = theme.data.accent ?? null;
  const online = deployedGames.length;

  return (
    <section className="space-y-6">
      <PageHeader
        title={theme.name}
        description={theme.description ?? '还没有描述'}
        actions={
          <>
            <Button size="sm" onClick={() => setDeployOpen(true)}>
              <Rocket className="mr-1 h-3.5 w-3.5" />
              上线
            </Button>
            <ThemeActionsMenu
              onExport={() => setExportOpen(true)}
              onEdit={() => setEditOpen(true)}
              onDelete={() => setDeleteOpen(true)}
            />
          </>
        }
      />

      {/*
       * 四个计数当入口：数字大、单位小、右上一个箭头 —— 一眼知道这里有什么、点了去哪。
       *
       * v0.8.2：图标从 16px 放到 24px，并且描边降到 1.5。24px 的 lucide 若还用
       * 默认 stroke-width=2，线条会比 16px 时粗一半（同一份 24 单位坐标放大），
       * 四张卡排起来像四个加粗的按钮；1.5 让它回到原来的视觉重量，只是「更大」。
       */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COUNT_LINKS.map((entry) => {
          const Icon = MODULE_ICONS[entry.module];
          return (
            <Link
              key={entry.module}
              to={workspace.href(entry.module)}
              className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
            >
              {/*
               * `self-start`：图标与**数字那一行**对齐，而不是与整块（数字 + 标签）
               * 垂直居中。居中会让它掉到数字与标签之间 —— 数字是这一格的主语，
               * 图标是它的量词，两者该在同一行上起头。
               */}
              <Icon
                className="h-6 w-6 shrink-0 self-start text-muted-foreground"
                strokeWidth={1.5}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-kai text-2xl leading-none tabular-nums">
                  {theme.counts[entry.module]}
                </span>
                <span className="mt-1 block text-2xs text-muted-foreground">{entry.label}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>

      <Card className="divide-y divide-border px-4">
        <FactRow label="编码">
          <span className="font-mono text-xs">{theme.code}</span>
        </FactRow>
        {/*
         * v0.8.2：识别色是一行事实，不是一个小控件。它的编辑在 `⋯ →「编辑主题信息」`，
         * 与名称、描述同一处 —— 把取色器摆在概览页上，等于给这一页加一个「设置项」，
         * 而这一页的职责是「告诉你这个空间是什么」。
         */}
        <FactRow label="识别色">
          {accent ? (
            <span className="inline-flex items-center gap-1.5 align-middle">
              <span
                aria-hidden
                className="h-3.5 w-3.5 rounded-sm ring-1 ring-inset ring-border"
                style={{ backgroundColor: accent }}
              />
              <span className="font-mono text-xs">{accent}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">未设置</span>
          )}
        </FactRow>
        <FactRow label="缺省风格">
          {styleSet ? (
            <span>已设置</span>
          ) : (
            <span className="text-muted-foreground">
              未设置
              {/*
               * v0.8.2：原来这一行是一段 26 字的说明，读者会把「未设置」先读成「不可用」。
               * 现在把「去哪儿设」做成链接本身 —— 一句说明兼一条路，不用记菜单路径。
               */}
              <Link
                to={workspace.href('maps')}
                className="ml-2 text-2xs text-primary underline-offset-4 hover:underline"
              >
                去设一张地图的风格 →
              </Link>
            </span>
          )}
        </FactRow>
        <FactRow label="上线">
          {online === 0 ? (
            <span className="text-muted-foreground">还没有关卡上线</span>
          ) : (
            <span>
              {online} 关在线
              {collection ? (
                /* v0.8.2：路径从「一串只读的等宽字」变成真的入口 —— 概览页能出门。 */
                <Link
                  to={`/play/theme/${collection.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 font-mono text-2xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  /play/theme/{collection.slug} ↗
                </Link>
              ) : (
                <span className="ml-2 text-2xs text-muted-foreground">还没有合辑</span>
              )}
            </span>
          )}
        </FactRow>
      </Card>

      <DeployThemeDialog theme={theme} open={deployOpen} onOpenChange={setDeployOpen} />
      <EditThemeDialog theme={theme} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteThemeDialog theme={theme} open={deleteOpen} onOpenChange={setDeleteOpen} />
      <ExportBundleDialog
        theme={exportOpen ? theme : null}
        games={deployedGames}
        onOpenChange={setExportOpen}
      />
    </section>
  );
}

/** 一行事实：左侧 4 字标签、右侧值。40px，与列表页的行同档。 */
function FactRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-x-6 gap-y-1 py-2">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-sm">{children}</span>
    </div>
  );
}

/**
 * 编辑主题信息（§16.2 的 `⋯` 里）—— 改 `name` / `description` / `accent`。
 *
 * v0.8.2 之前它叫「重命名」，只有名称与描述。加了识别色之后那个名字就成了谎：
 * 这一格改的是「这个空间叫什么、长什么样」。
 *
 * `code` 仍不在这里：它进 URL 与资源包 manifest（§4），改一次就让所有已发出的
 * 链接与包对不上号，所以它从建行起就是只读的。
 *
 * `data` 是**整份覆盖**（`themeRepository.updateTheme` 直接写 JSONB），所以保存时
 * 要把当前 `data` 铺开再改 `accent` —— 只发 `{accent}` 会把 `style` 一起抹掉。
 */
function EditThemeDialog({
  theme,
  open,
  onOpenChange,
}: {
  theme: Theme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const [name, setName] = useState(theme.name);
  const [description, setDescription] = useState(theme.description ?? '');
  /** `null` = 没有门牌色。与「选了某个颜色」是两回事，保存时分别落成「删键」与「写值」。 */
  const [accent, setAccent] = useState<string | null>(theme.data.accent ?? null);
  const update = useUpdateTheme(theme.code);

  // 每次打开都从主题当前值开始 —— 上一次取消时留下的草稿不该在下一次出现。
  useEffect(() => {
    if (!open) return;
    setName(theme.name);
    setDescription(theme.description ?? '');
    setAccent(theme.data.accent ?? null);
  }, [open, theme.name, theme.description, theme.data.accent]);

  async function submit(): Promise<void> {
    const data: Record<string, unknown> = { ...theme.data };
    if (accent) data['accent'] = accent;
    else delete data['accent'];
    await update.mutateAsync({
      name: name.trim(),
      description: description.trim().length > 0 ? description.trim() : null,
      data,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>编辑主题信息</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme-edit-name">名称</Label>
            <Input id="theme-edit-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="theme-edit-description">描述</Label>
            <Input
              id="theme-edit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="可选"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="theme-edit-accent">识别色</Label>
            <div className="flex min-h-10 items-center gap-2">
              {accent ? (
                <>
                  <ColorInput
                    id="theme-edit-accent"
                    aria-label="识别色"
                    value={accent}
                    onChange={setAccent}
                  />
                  <span className="font-mono text-xs text-muted-foreground">{accent}</span>
                  <button
                    type="button"
                    className="ml-1 text-2xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    onClick={() => setAccent(null)}
                  >
                    清除
                  </button>
                </>
              ) : (
                /* 没设过就不先摆一个色块 —— 一进门就是某个颜色，等于替作者做了决定。 */
                <Button
                  id="theme-edit-accent"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAccent(ACCENT_FALLBACK)}
                >
                  选一个颜色
                </Button>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={name.trim().length === 0 || update.isPending}
            >
              {update.isPending ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 删主题（§8 护栏 3）：**有东西就不给删**，而且先把数量说清楚。
 *
 * 真正的拦截在服务端（那里才有计数与 `is_default` 判定），这里只负责把「为什么
 * 可能删不掉」提前写在按钮旁边 —— 让人点了才知道失败，比先说一句贵得多。
 *
 * 删掉的是**当前工作空间**：成功后回系统配置页，而不是留在一个已经不存在的
 * 地址上。
 */
function DeleteThemeDialog({
  theme,
  open,
  onOpenChange,
}: {
  theme: Theme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const navigate = useNavigate();
  const remove = useDeleteTheme();
  const [error, setError] = useState<string | null>(null);
  const filled = [
    theme.counts.assets > 0 ? `${theme.counts.assets} 个资源` : null,
    theme.counts.maps > 0 ? `${theme.counts.maps} 张地图` : null,
    theme.counts.characters > 0 ? `${theme.counts.characters} 个角色` : null,
    theme.counts.puzzles > 0 ? `${theme.counts.puzzles} 个谜题` : null,
  ].filter((part): part is string => part !== null);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function confirm(): Promise<void> {
    try {
      await remove.mutateAsync(theme.code);
      onOpenChange(false);
      navigate(SETTINGS_THEMES_PATH);
    } catch (cause) {
      // 服务端才是权威（它手里有计数）。它拒绝时那句话要留在
      // 对话框里 —— 关掉弹窗再 toast 一句，作者就看不到「还差什么」了。
      setError(cause instanceof Error ? cause.message : '删除失败');
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>删除主题「{theme.name}」？</AlertDialogTitle>
          <AlertDialogDescription>
            {filled.length > 0
              ? `主题下还有 ${filled.join('、')}，需要先移空才能删。`
              : '这个主题里没有东西，删除后不可恢复。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={filled.length > 0 || remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            {remove.isPending ? '删除中…' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * 一键整主题部署（§9）：动作，不是新状态。生成一个 `/play/theme/:slug`，
 * 成员是主题里每个谜题最新的已发布版本。
 */
function DeployThemeDialog({
  theme,
  open,
  onOpenChange,
}: {
  theme: Theme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const [slug, setSlug] = useState('');
  const deploy = useDeployTheme(theme.code);

  useEffect(() => {
    if (!open) return;
    setSlug(`${theme.code}-story`.toLowerCase());
  }, [open, theme.code]);

  async function submit(): Promise<void> {
    await deploy.mutateAsync({ slug: slug.trim(), name: theme.name });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>上线「{theme.name}」</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            会把主题里每个谜题**最新的已发布版本**各上线一次，再把这个主题做成一个合辑。
            重新上线一关，合辑会自动指向新版本。
          </p>
          <div className="space-y-2">
            <Label htmlFor="deploy-slug">访问路径</Label>
            <div className="flex items-center text-sm text-muted-foreground">
              <span className="shrink-0">/play/theme/</span>
              <Input
                id="deploy-slug"
                className="ml-1"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="hlm-story"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={() => void submit()} disabled={slug.trim().length === 0 || deploy.isPending}>
              {deploy.isPending ? '上线中…' : '上线'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
