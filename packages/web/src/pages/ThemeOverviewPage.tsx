import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, MapPin, Package, Puzzle, Rocket, Users } from 'lucide-react';
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
import { SETTINGS_THEMES_PATH } from '@/lib/workspace';

const COUNT_LINKS = [
  { module: 'assets', label: '资源', icon: Package, field: 'assets' },
  { module: 'maps', label: '地图', icon: MapPin, field: 'maps' },
  { module: 'characters', label: '角色', icon: Users, field: 'characters' },
  { module: 'puzzles', label: '谜题', icon: Puzzle, field: 'puzzles' },
] as const;

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
  const [renameOpen, setRenameOpen] = useState(false);
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
  const online = deployedGames.length;

  return (
    <section className="space-y-6">
      <PageHeader
        title={theme.name}
        description={theme.description ?? '还没有描述 —— 在「重命名」里补一句'}
        actions={
          <>
            <Button size="sm" onClick={() => setDeployOpen(true)}>
              <Rocket className="mr-1 h-3.5 w-3.5" />
              上线
            </Button>
            <ThemeActionsMenu
              onExport={() => setExportOpen(true)}
              onRename={() => setRenameOpen(true)}
              onDelete={() => setDeleteOpen(true)}
            />
          </>
        }
      />

      {/* 四个计数当入口：数字大、单位小、右上一个箭头 —— 一眼知道这里有什么、点了去哪。 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COUNT_LINKS.map((entry) => (
          <Link
            key={entry.module}
            to={workspace.href(entry.module)}
            className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
          >
            <entry.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block font-kai text-2xl leading-none tabular-nums">
                {theme.counts[entry.field]}
              </span>
              <span className="mt-1 block text-2xs text-muted-foreground">{entry.label}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>

      <Card className="divide-y divide-border px-4">
        <FactRow label="编码">
          <span className="font-mono text-xs">{theme.code}</span>
          <span className="ml-2 text-2xs text-muted-foreground">地址与资源包里都是它，创建后不可改</span>
        </FactRow>
        <FactRow label="缺省风格">
          {styleSet ? (
            <span>
              已设置
              <span className="ml-2 text-2xs text-muted-foreground">
                这个主题下新画的地图会从它开始
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              未设置
              <span className="ml-2 text-2xs">
                在任意一张地图的「基本信息」里，用「设为主题风格」写入
              </span>
            </span>
          )}
        </FactRow>
        <FactRow label="上线">
          {online === 0 ? (
            <span className="text-muted-foreground">
              还没有关卡上线
              <span className="ml-2 text-2xs">上线之后才有包可导</span>
            </span>
          ) : (
            <span>
              {online} 关在线
              {collection ? (
                <span className="ml-2 font-mono text-2xs text-muted-foreground">
                  /play/theme/{collection.slug}
                </span>
              ) : (
                <span className="ml-2 text-2xs text-muted-foreground">还没有合辑</span>
              )}
            </span>
          )}
        </FactRow>
      </Card>

      <p className="text-2xs leading-relaxed text-muted-foreground">
        这一页以后会长出更多可配置项（字体、联动调色板）。现在风格只在画布上设 ——
        那一份是玩家真正看到的，第二份抄在这里只会渐渐对不上。
      </p>

      <DeployThemeDialog theme={theme} open={deployOpen} onOpenChange={setDeployOpen} />
      <RenameThemeDialog theme={theme} open={renameOpen} onOpenChange={setRenameOpen} />
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
 * 重命名（§16.2 的 `⋯` 里）—— 只改 `name` / `description`。
 *
 * `code` 不在这里：它进 URL 与资源包 manifest（§4），改一次就让所有已发出的
 * 链接与包对不上号，所以它从建行起就是只读的。
 */
function RenameThemeDialog({
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
  const update = useUpdateTheme(theme.code);

  // 每次打开都从主题当前值开始 —— 上一次取消时留下的草稿不该在下一次出现。
  useEffect(() => {
    if (!open) return;
    setName(theme.name);
    setDescription(theme.description ?? '');
  }, [open, theme.name, theme.description]);

  async function submit(): Promise<void> {
    await update.mutateAsync({
      name: name.trim(),
      description: description.trim().length > 0 ? description.trim() : null,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>重命名主题</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme-rename-name">名称</Label>
            <Input id="theme-rename-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="theme-rename-description">描述</Label>
            <Input
              id="theme-rename-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="可选"
            />
          </div>
          <p className="text-2xs text-muted-foreground">
            编码 <span className="font-mono">{theme.code}</span> 不可改 —— 它已经进了地址和资源包。
          </p>
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
