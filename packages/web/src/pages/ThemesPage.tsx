import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Theme } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/layout/PageHeader';
import { useCreateTheme, useThemes } from '@/hooks/useThemes';
import { cn } from '@/lib/utils';

/**
 * v0.8.0 §18：**系统配置 · 主题**。这是「换一间工作台」的唯一入口。
 *
 * 上一版它是工坊的第六个模块，和资源 / 地图并列。可它不是内容，是**容器**：
 * 点进去不是看东西，而是换一个世界接着干活。所以它搬出了顶栏 —— 现在顶栏只有
 * 一个工作空间里的六个模块，主题列表在 `/settings/themes`，从顶栏的主题切换器
 * （【主题配置】）或地址进入。
 *
 * 卡片仍然回答两个问题：这个主题有多少东西，现在能玩几关。计数分两行 ——
 * 主行是**对外结果**（几关在线），次行是**库**（资源 / 地图 / 角色）。五个数字
 * 平铺成一排时，读者会把它们读成同一种量。
 */
export function ThemesPage(): JSX.Element {
  const themesQuery = useThemes();
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    document.title = '主题 · 系统配置 · 格物';
  }, []);

  const themes = themesQuery.data ?? [];

  function renderBody(): JSX.Element {
    if (themesQuery.isLoading) {
      return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-36 rounded-lg bg-muted" />
          ))}
        </div>
      );
    }
    if (themes.length === 0) {
      return (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-sm text-muted-foreground">还没有主题，先创建一个吧</p>
          <Button onClick={() => setCreateOpen(true)}>新建主题</Button>
        </Card>
      );
    }
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {themes.map((theme) => (
          <ThemeCard key={theme.code} theme={theme} />
        ))}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="主题"
        description="每个主题是一间独立的工作台：点进去，里面的资源、地图、角色、谜题都只属于它。"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建主题
          </Button>
        }
      />
      {renderBody()}
      <CreateThemeDialog open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}

function ThemeCard({ theme }: { theme: Theme }): JSX.Element {
  // 色带用作者自己的调色板（§16.9）：它是这个主题真实的视觉语言，天然区分两个主题，
  // 而且不违反「作品内容不随界面变」—— 这是引用，不是给界面新增配色。
  const swatches = (theme.data.linkageColors ?? []).slice(0, 4);
  return (
    <Link
      // v0.8.0 §18：点卡片 = 进这间工作台，落在它的概览（四扇门都在那儿）。
      to={`/${theme.code}/overview`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-accent/40"
    >
      <div className="flex h-2">
        {swatches.length > 0 ? (
          swatches.map((swatch) => (
            <span key={swatch.key} className="flex-1" style={{ backgroundColor: swatch.color }} />
          ))
        ) : (
          <span className="flex-1 bg-muted" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate font-kai text-lg leading-tight">{theme.name}</h2>
            <p className="mt-1 truncate text-2xs text-muted-foreground">{theme.code}</p>
          </div>
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {theme.description ?? '暂无描述'}
        </p>
        <div className="mt-auto space-y-1">
          <p className="text-xs text-foreground">
            {theme.counts.puzzles} 关 · {theme.counts.games} 关在线
          </p>
          <p className="text-2xs text-muted-foreground">
            {theme.counts.assets} 资源 · {theme.counts.maps} 地图 · {theme.counts.characters} 角色
          </p>
        </div>
      </div>
    </Link>
  );
}

/**
 * §16.7：新建时必须当场选主题 —— 所以「主题」本身的新建只要 code / name。
 * `code` 进 URL 与 manifest，所以只在创建时可填，之后不可改（§4）。
 */
function CreateThemeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  /** 服务端才是编码规则的权威（字符集、保留字、重名），它那句话要留在弹窗里。 */
  const [error, setError] = useState<string | null>(null);
  const createTheme = useCreateTheme();

  // 中文名推不出 code（`slugify` 会得到空串），所以这里只做「小写化 + 空格换连字符」，
  // 剩下的交给服务端的正则与错误消息 —— 别在前端发明规则。
  const derivedCode = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');

  // 上一次失败的那句话不该跟着下一次打开一起出现。
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function submit(): Promise<void> {
    try {
      await createTheme.mutateAsync({
        code: (codeTouched ? code : derivedCode).trim(),
        name: name.trim(),
        description: description.trim().length > 0 ? description.trim() : null,
      });
    } catch (cause) {
      // 关掉弹窗再 toast，作者就不知道该改哪一格了 —— 留在原地，句子在下面。
      setError(cause instanceof Error ? cause.message : '创建失败');
      return;
    }
    setError(null);
    setName('');
    setCode('');
    setDescription('');
    setCodeTouched(false);
    onOpenChange(false);
  }

  const canSubmit = name.trim().length > 0 && (codeTouched ? code : derivedCode).trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新建主题</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme-name">名称</Label>
            <Input
              id="theme-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="红楼梦"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="theme-code">编码</Label>
            <Input
              id="theme-code"
              value={codeTouched ? code : derivedCode}
              onChange={(event) => {
                setCodeTouched(true);
                setCode(event.target.value);
              }}
              placeholder="hlm"
            />
            <p className={cn('text-2xs text-muted-foreground')}>
              进地址与资源包，创建后不可改。只能用小写字母、数字、下划线与连字符；
              settings、play 等系统页面的路径不能用。
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="theme-description">描述</Label>
            <Input
              id="theme-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="可选"
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={() => void submit()} disabled={!canSubmit || createTheme.isPending}>
              {createTheme.isPending ? '创建中…' : '创建'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
