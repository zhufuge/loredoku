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
import { readLastThemeCode } from '@/lib/workspace';
import { cn } from '@/lib/utils';

/**
 * v0.8.0 §18：**系统配置 · 主题**。这是「换一间工作台」的唯一入口。
 *
 * 上一版它是工坊的第六个模块，和资源 / 地图并列。可它不是内容，是**容器**：
 * 点进去不是看东西，而是换一个世界接着干活。所以它搬出了顶栏 —— 现在顶栏只有
 * 一个工作空间里的六个模块，主题列表在 `/settings/themes`，从顶栏的主题切换器
 * （【主题配置】）或地址进入。
 *
 * v0.8.2 补了三处「这一页该回答却没回答」的事：
 *
 * 1. **我在哪**：卡片上标「当前」。这一页唯一的用途是换空间，不标就等于让人靠记忆
 *    分辨两张长得一样的卡。系统配置没有 `WorkspaceContext`（它在 `WorkspaceLayout`
 *    里），当前编码只能读切换器写的那个键。
 * 2. **凭什么认出这个世界**：卡顶那条 8px 色带原来读 `data.linkageColors` —— 那个
 *    字段自 v0.5.0 FEAT-K14 起已经搬到谜题上，没有任何界面会写它，于是色带永远是
 *    一条 muted 灰线。现在改读 `data.accent`（v0.8.2 新增的识别色），没设就**不画**
 *    色带，而不是留一条灰的在那儿冒充内容。
 * 3. **这卡是什么形状**：两列时卡片 632px 宽、内容只占左边一半。现在把「几关在线」
 *    做成右对齐的数字块 —— 宽度被用上了，也顺手和概览页的四格计数长成一个家族。
 */
export function ThemesPage(): JSX.Element {
  const themesQuery = useThemes();
  const [createOpen, setCreateOpen] = useState(false);

  // 系统配置页在 `AppShell variant="config"` 里，外壳之外没有工作空间上下文。
  // 读「记住的主题编码」是这一页能拿到「我在哪」的唯一来源 —— 它由切换器与
  // `WorkspaceLayout` 写入，换浏览器就没了，所以只用来**标一下**，不参与跳转。
  const currentCode = readLastThemeCode();

  useEffect(() => {
    document.title = '主题 · 系统配置 · 格物';
  }, []);

  const themes = themesQuery.data ?? [];

  function renderBody(): JSX.Element {
    if (themesQuery.isLoading) {
      return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-40 rounded-lg bg-muted" />
          ))}
        </div>
      );
    }

    /*
     * v0.8.2：错误态不再伪装成空态。原来 `data ?? []` 加上只判 `isLoading`，接口
     * 500 时页面会说「还没有主题，先创建一个吧」—— 作者会真的去建第三个主题。
     */
    if (themesQuery.isError) {
      return (
        <Card className="flex flex-col items-start gap-3 p-6">
          <p className="text-sm">主题列表没取到</p>
          <p className="text-xs text-muted-foreground">
            {themesQuery.error instanceof Error ? themesQuery.error.message : '未知错误'}
          </p>
          <Button variant="outline" size="sm" onClick={() => void themesQuery.refetch()}>
            重试
          </Button>
        </Card>
      );
    }

    if (themes.length === 0) {
      // 主按钮只留页头那一个：空态里再放一个「新建主题」，同一屏就有两个同义按钮。
      return (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <p className="font-kai text-lg">还没有主题</p>
          <p className="text-xs text-muted-foreground">点右上角「新建主题」，建第一个世界。</p>
        </Card>
      );
    }

    return (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        {themes.map((theme) => (
          <ThemeCard key={theme.code} theme={theme} current={theme.code === currentCode} />
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

function ThemeCard({ theme, current }: { theme: Theme; current: boolean }): JSX.Element {
  // v0.8.2：色带用主题自己的识别色（`data.accent`）—— 这是作者给的、属于这个世界的
  // 一种颜色，界面只是引用它。没设过就整条不画：留一条 muted 灰带会被读成「有内容」。
  const accent = theme.data.accent;
  return (
    <Link
      to={`/${theme.code}/overview`}
      aria-current={current ? 'page' : undefined}
      data-testid={`theme-card-${theme.code}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/40',
        current ? 'border-primary/50' : 'border-border',
      )}
    >
      {/*
       * v0.8.2：色带的**位置**总是占着 8px，有识别色才画出来。
       * 不占位的话，同排卡片里只有设过色的那张往下挪 8px —— 标题、编码、描述
       * 全部错开一条带子的高度，一排卡片看起来像没对齐的价签。
       */}
      <span
        aria-hidden
        data-testid="theme-accent-band"
        className="h-2"
        style={accent ? { backgroundColor: accent } : undefined}
      />
      <div className="flex flex-1 gap-4 p-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate font-kai text-lg leading-tight">{theme.name}</h2>
            {current ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs text-primary">
                当前
              </span>
            ) : null}
          </div>
          <p className="truncate font-mono text-2xs text-muted-foreground">{theme.code}</p>
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {theme.description ?? '暂无描述'}
          </p>
        </div>

        {/* 右对齐的数字块：卡片在宽屏会拉到 600px 上下，光靠左边一两行字撑不住。 */}
        <div className="shrink-0 text-right">
          <p className="font-kai text-2xl leading-none tabular-nums">{theme.counts.games}</p>
          <p className="mt-1 text-2xs text-muted-foreground">关在线</p>
          <p className="mt-2 space-y-0.5 text-2xs text-muted-foreground">
            <span className="block">
              {theme.counts.assets} 资源 · {theme.counts.maps} 地图
            </span>
            <span className="block">
              {theme.counts.characters} 角色 · {theme.counts.puzzles} 谜题
            </span>
          </p>
        </div>
      </div>
    </Link>
  );
}

/**
 * §16.7：新建时必须当场选主题 —— 所以「主题」本身的新建只要 code / name。
 * `code` 进 URL 与 manifest，所以只在创建时可填，之后不可改（§4）。
 *
 * 识别色不在这里：新建的第一件事是给世界起名字，颜色是「它长出来之后」才有的判断，
 * 而且这一版把它放在概览的「编辑主题信息」里（那里也能随时改）。
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
  /** 服务端才是编码规则的权威（字符集、保留字、重名），它那句话要留在弹窗里。 */
  const [error, setError] = useState<string | null>(null);
  const createTheme = useCreateTheme();

  /*
   * v0.8.3（docs/v0.8.3.md §14）：编码**不再跟着名字长出来**。
   *
   * 上一版把名字小写化、空格换连字符之后填进编码框，看起来省事，实际有两个问题：
   *
   * 1. 它只对英文名成立 —— 中文名推出来是空串，于是「自动填」只在一半情况下发生过，
   *    同一个输入框会有两种行为；
   * 2. 名字是给读者看的，编码是进地址与资源包的。把它们绑在一起，等于鼓励作者用
   *    「名字的拼音缩写」这种既不好看也不好念的东西当编码；更糟的是，作者改名字时
   *    会以为编码也跟着改了 —— 而它创建后不可改。
   *
   * 现在两格各管各的：名字随便写，编码由作者自己定（`hlm`、`tang-chao`）。
   */

  // 上一次失败的那句话不该跟着下一次打开一起出现。
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function submit(): Promise<void> {
    try {
      await createTheme.mutateAsync({
        code: code.trim(),
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
    onOpenChange(false);
  }

  const canSubmit = name.trim().length > 0 && code.trim().length > 0;

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
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="theme-code">编码</Label>
            <Input
              id="theme-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="小写字母、数字、下划线或连字符，创建后不可改"
              autoComplete="off"
              spellCheck={false}
              /*
               * 等宽只管**输入值**（`hlm`、`tang-chao` 里 l/1、O/0 要分得开，
               * 卡片上也用等宽显示编码）。`::placeholder` 会继承元素字体，
               * 而这句话现在是一整句中文规则说明 —— 让它跟着等宽走，中文
               * 会落到等宽栈的中文后备字体上，标点宽度也和旁边「可选」不
               * 一致。所以单独把占位符拉回正文字体（v0.8.3 §14.5）。
               */
              className="font-mono placeholder:font-sans"
            />
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
