import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import {
  DEFAULT_DIFFICULTY_TIERS,
  DEFAULT_MAP_STYLE,
  fileUrlFromPath,
  MAP_STYLE_DIFF_GROUPS,
  difficultySwatchColor,
  nextDifficultyLevel,
  resolveDifficultyTiers,
  THEME_DIFFICULTY_TIER_MAX,
  type MapStyle,
  type Theme,
  type ThemeCounts,
  type ThemeDifficultyTier,
} from '@loredoku/shared';
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
import { ColorField, ColorInput } from '@/components/ui/color-input';
import { IconButton } from '@/components/ui/icon-button';
import { PageHeader } from '@/components/layout/PageHeader';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { DifficultyBadge } from '@/components/game/DifficultyBadge';
import { Hint, NumberField, Row } from '@/components/map-editor/StyleFields';
import {
  useDeleteTheme,
  useRemoveThemeForbiddenSymbol,
  useUpdateTheme,
  useUploadThemeForbiddenSymbol,
} from '@/hooks/useThemes';
import { isValidShadowColor, isValidStyleColor } from '@/lib/mapStyle';
import {
  resetThemeStyle,
  THEME_STYLE_FIELDS,
  THEME_STYLE_GROUP_HINTS,
  writeStyleValue,
  type ThemeStyleField,
} from '@/lib/themeStyleFields';
import { SETTINGS_THEMES_PATH, type ModuleKey } from '@/lib/workspace';
import { MODULE_ICONS } from '@/lib/moduleIcons';

/**
 * v0.8.2：选色的起点。石青是浅色下的 `--primary`，第一次按下取色器就从这里开始 ——
 * 它不是「默认识别色」，只是不让取色器从一个随机黑开始。
 */
const ACCENT_FALLBACK = '#326385';

/**
 * v0.8.2：入口只写「去哪、叫什么」，图标从 `MODULE_ICONS` 取 —— 与顶栏同一枚。
 * 原来这里自带一份图标表，地图用的是 `MapPin`，顶栏用的是 `Map`：同一个模块在
 * 两处长得不一样，而读者恰恰是「先在顶栏看见它，再在这四格里找它」。
 *
 * v0.8.3：**加上部署**。前四格数的是「这个空间里有什么」，第五格数「有几关已经
 * 出门了」—— 它和那四个不是同一件事，但同在「这个空间现在什么样」这个答案里。
 */
const COUNT_LINKS = [
  { module: 'assets', label: '资源', field: 'assets' },
  { module: 'maps', label: '地图', field: 'maps' },
  { module: 'characters', label: '角色', field: 'characters' },
  { module: 'puzzles', label: '谜题', field: 'puzzles' },
  { module: 'deployments', label: '部署', field: 'games' },
] as const satisfies ReadonlyArray<{
  module: ModuleKey;
  label: string;
  field: keyof ThemeCounts;
}>;

/**
 * v0.8.0 §18：`/:code/overview` —— 一个工作空间自己的那页（导航第一项「概览」）。
 *
 * 上一版这一屏是「主题工作台」：顶栏里一条面包屑 + 四个带计数的 tab + 一列平铺
 * 内容。有了工作空间之后，那四个 tab 就是顶栏的四个模块 —— 同一件事说两遍。
 *
 * 所以这一页只回答「这个空间是什么、按什么规矩长」：
 *
 * - **五格计数**当入口（大数字 + 箭头），点了就去对应模块；第五格是部署；
 * - **四行信息**：名称、编码、描述、识别色 —— 都是「别处改、这里看」的；
 * - **地图初始样式**：二十几项按网格 / 边框 / 标签 / 光标列成清单，可整份编辑（v0.8.3）；
 * - **难度分级**：这个空间认可哪几档，可增删改（v0.8.3）；
 * - **动作平铺**：编辑信息、删除各是一个按钮（v0.8.3 去掉了 `⋯`）。
 *
 * v0.8.3 之前页头还有「上线」和 `⋯` 里的「导出资源包」。两者都搬去了**部署页**
 * —— 那才是「出门」这件事发生的地方，而概览页回答的是静态问题。删掉它们之后
 * 剩下的动作只有两个，`⋯` 也就没有必要了：一个装两个按钮的菜单，比两个按钮贵。
 */
export function ThemeOverviewPage(): JSX.Element {
  const workspace = useWorkspace();
  const theme = workspace?.theme ?? null;
  const [editOpen, setEditOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [tiersOpen, setTiersOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  const accent = theme.data.accent ?? null;
  /** 没有初始样式的主题，渲染的是**新建地图时会拿到的**那份 —— 清单不能是空的。 */
  const style = theme.data.style ?? DEFAULT_MAP_STYLE;
  const tiers = resolveDifficultyTiers(theme.data.difficultyLevels);

  return (
    <section className="space-y-6">
      <PageHeader
        title={theme.name}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              编辑信息
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              删除主题
            </Button>
          </>
        }
      />

      {/*
       * 计数当入口：数字大、单位小、右上一个箭头 —— 一眼知道这里有什么、点了去哪。
       *
       * v0.8.2：图标从 16px 放到 24px，并且描边降到 1.5。24px 的 lucide 若还用
       * 默认 stroke-width=2，线条会比 16px 时粗一半（同一份 24 单位坐标放大），
       * 卡片排起来像几个加粗的按钮；1.5 让它回到原来的视觉重量，只是「更大」。
       */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                  {theme.counts[entry.field]}
                </span>
                <span className="mt-1 block text-2xs text-muted-foreground">{entry.label}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>

      <Card className="divide-y divide-border px-4">
        <FactRow label="名称">
          <span>{theme.name}</span>
        </FactRow>
        <FactRow label="编码">
          <span className="font-mono text-xs">{theme.code}</span>
        </FactRow>
        <FactRow label="描述">
          {theme.description ? (
            <span>{theme.description}</span>
          ) : (
            <span className="text-muted-foreground">未填写</span>
          )}
        </FactRow>
        {/*
         * v0.8.2：识别色是一行事实，不是一个小控件。它的编辑在「编辑信息」里，
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
      </Card>

      {/*
       * v0.8.6 §1：「缺省风格」改名「地图初始样式」。原来那个词要读者先知道
       * 「缺省」是 default 的旧译，再猜「风格」指的是地图的样式 —— 而这个区块
       * 全部的用途就是「告诉新建的那张图长什么样」。
       *
       * 也不再写一句副标题（「新建地图时抄这一份；已经画好的图不受影响」）：
       * 清单本身就是答案，一句话解释一个已经看得见的东西只占了第一屏。
       */}
      <Card className="space-y-3 px-4 py-4">
        <CardHead title="地图初始样式" onEdit={() => setStyleOpen(true)} />
        {/*
         * v0.8.7 §1 —— 这份清单从「三列流式网格」改成「多栏」。
         *
         * 原来每个组标题 `col-span-full`，于是每组都要另起一行、组尾剩下一两个
         * 空格：网格（2 项）占两格留一格，边框（5 项）占两行留一格，光标（7 项）
         * 占两行留两格 —— 右半边参差着四个洞，读起来像一张没对齐的表。
         *
         * 现在用 CSS 多栏（`columns-*`）：组是**一栏里的一段**，浏览器按内容高度
         * 把四段分进三栏（2+5 / 9 / 7 行），既没有洞，也不用手写「哪组进哪栏」的
         * 表 —— 那种表每加一组就要跟着改一次。`break-inside-avoid` 保证一组不会
         * 被从中间劈到两栏。
         */}
        <div className="columns-1 gap-x-10 lg:columns-3">
          {MAP_STYLE_DIFF_GROUPS.map((group) => {
            const rows = THEME_STYLE_FIELDS.filter((field) => field.group === group);
            return (
              <section key={group} className="mb-5 break-inside-avoid last:mb-0">
                {/*
                 * 组名从「几乎和行标签同色同号的 10px 小字」提成**栏头**：稍重一点的
                 * 颜色 + 一条通栏细线。它原来是靠「另起一行」来划分组的，现在组在
                 * 栏里上下相接，只靠位置已经分不开了。
                 */}
                <h4 className="mb-1.5 border-b border-border pb-1 text-2xs font-medium tracking-[0.08em] text-foreground/70">
                  {group}
                </h4>
                {/*
                 * 行不再是一个个 `justify-between` 的 div：`dt` / `dd` 是同一个网格的
                 * 两列，值列宽度由**这一组里最长的值**决定，于是同一组的右边缘落在
                 * 一条线上 ——「4px」和「12px」的末位对齐，七个字符的色值自然也排成
                 * 一列。用 `justify-between` 时值贴的是列右边缘，而列宽 373px，标签
                 * 与值之间隔着大半列空白，读一行要横着扫过去。
                 *
                 * 为什么只对齐到「组」：网格是每组一份（组要 `break-inside-avoid`，
                 * 不能拆到两栏）。组与组之间差几个像素，值都还是贴着自己那条右边缘。
                 *
                 * **两套列宽是有意的**：`lg` 以上一栏 373px，右对齐像一张表；`lg` 以下
                 * 整页只剩一栏（宽 500+），同样右对齐的话标签与值之间会空出半行，读一行
                 * 要横跨半屏 —— 那时改成「标签按内容宽、值紧跟其后」。单栏里没人拿它竖着
                 * 扫，组与组差几个像素不算问题。
                 *
                 * 也就不画行分隔线了：二十几条横线只把纸面切成格子，而每一行短的
                 * 只有二十来个字，靠行距已经分得开。组与组之间剩下的那点空间，正好
                 * 交给栏头那条线。
                 */}
                <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 lg:grid-cols-[minmax(0,1fr)_max-content]">
                  {rows.map((field) => (
                    <Fragment key={field.key}>
                      <dt className="truncate text-xs text-muted-foreground">{field.label}</dt>
                      <dd>
                        <StyleValue kind={field.kind} text={field.format(style)} />
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </Card>

      {/* v0.8.6 §4：主题级的「禁止符号」缺省。与地图初始样式同属「新建内容长什么样」。 */}
      <ForbiddenSymbolCard theme={theme} />

      {/* v0.8.3 §3：难度分级。徽章就是部署页 / 游戏卡上那一枚，所见即所得。 */}
      <Card className="space-y-3 px-4 py-4">
        <CardHead title="难度分级" onEdit={() => setTiersOpen(true)} />
        <div className="flex flex-wrap gap-2">
          {tiers.map((tier) => (
            <DifficultyBadge key={tier.level} difficulty={tier.level} tiers={tiers} className="px-2.5 py-1 text-xs" />
          ))}
        </div>
      </Card>

      <EditThemeDialog theme={theme} open={editOpen} onOpenChange={setEditOpen} />
      <ThemeStyleDialog theme={theme} open={styleOpen} onOpenChange={setStyleOpen} />
      <DifficultyTiersDialog theme={theme} open={tiersOpen} onOpenChange={setTiersOpen} />
      <DeleteThemeDialog theme={theme} open={deleteOpen} onOpenChange={setDeleteOpen} />
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
 * 清单卡片的头：标题 + 「编辑」。两个区块共用。
 *
 * v0.8.6 §1：**去掉了副标题**，按钮也不再写「编辑缺省风格 / 编辑难度分级」。
 *
 * 副标题那两句都是在解释一个已经看得见的清单（「新建地图时抄这一份」/「部署关卡时
 * 从这几档里挑」），占掉的却是第一屏。按钮写成「编辑」是因为它就贴着那张卡片的
 * 标题 —— 眼睛已经把「编辑」和上面那行字连起来了，再复述一遍主语只是更长。
 *
 * 但**可访问名**不能只有「编辑」：两个同名按钮对屏幕阅读器是灾难，读出来一模一样。
 * 所以视觉文案是「编辑」，`aria-label` 仍是「编辑地图初始样式 / 编辑难度分级」。
 *
 * v0.8.6 §4：「禁止符号」卡片没有「编辑」这一步（上传 / 移除即时保存），所以
 * `onEdit` 是可选的 —— 不给就只渲染标题。
 */
function CardHead({ title, onEdit }: { title: string; onEdit?: () => void }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <h3 className="font-kai text-base leading-tight">{title}</h3>
      {onEdit ? (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          aria-label={`编辑${title}`}
          onClick={onEdit}
        >
          编辑
        </Button>
      ) : null}
    </div>
  );
}

/**
 * v0.8.6 §4：主题级的「禁止符号」缺省 —— 本主题**新建**谜题时抄过去的那张图。
 *
 * 与「地图初始样式」同属一类：只影响新建那一刻，之后各走各的。所以这里不提供
 * 「批量改已有谜题」的入口，也不假装有 —— 已在编辑的谜题、已发布的关卡各自冻着
 * 自己那张（后者的版本行是一份快照）。
 *
 * 交互刻意不做弹窗：整个设置只有一张图，上传 / 移除就是最终动作，服务端即时保存。
 * 再套一层「编辑 → 保存」，多出来的两次点击换不到任何可撤销性（这里本来就没有
 * 取消的语义）。预览与按钮放在同一行，让「现在是什么」和「能改成什么」一眼对上。
 */
function ForbiddenSymbolCard({ theme }: { theme: Theme }): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadThemeForbiddenSymbol(theme.code);
  const remove = useRemoveThemeForbiddenSymbol(theme.code);
  const current = theme.data.forbiddenSymbol ?? null;
  const busy = upload.isPending || remove.isPending;

  return (
    <Card className="space-y-3 px-4 py-4">
      <CardHead title="禁止符号" />
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30">
          {current ? (
            <img
              src={fileUrlFromPath(current.path)}
              alt="禁止符号"
              className="h-full w-full object-contain"
            />
          ) : (
            /* 没有缺省 = 新建谜题仍拿到默认的 × 字形，占位就画这一枚。 */
            <X className="h-6 w-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mr-1 h-3.5 w-3.5" />
              {upload.isPending ? '上传中…' : current ? '更换' : '上传图片'}
            </Button>
            {current ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => remove.mutate()}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {remove.isPending ? '移除中…' : '移除'}
              </Button>
            ) : null}
          </div>
          <p className="text-2xs leading-relaxed text-muted-foreground">
            这张图会作为新建谜题的默认禁止符号；已在编辑的谜题与已发布的关卡不追溯。
          </p>
        </div>
      </div>
      {/*
       * 隐藏的 file input：按钮点它、选完立刻上传，`value` 清空是为了选同一张图
       * 再点一次也能触发 change。
       */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          if (!file) return;
          upload.mutate(file);
        }}
      />
    </Card>
  );
}

/**
 * 清单里的一格值：颜色给色块 + 色值，别的一律等宽字。
 *
 * v0.8.7 §1：字号从 10px 提到 12px，色块跟着从 10px 提到 12px。这一格不是「备注」——
 * 它是整个区块的**正文**（26 项值），而 10px 的等宽字在 1440 宽的屏幕上看是灰点。
 * 标签仍是 12px 的 `muted`：层级靠颜色，不靠字号 —— 大小再差一档，行就要矮回去了。
 */
function StyleValue({ kind, text }: { kind: string; text: string }): JSX.Element {
  const isColor = kind === 'color' && /^#[0-9a-fA-F]{6}$/.test(text);
  return (
    <span className="inline-flex items-center gap-1.5">
      {isColor ? (
        <span
          aria-hidden
          className="h-3 w-3 rounded-sm ring-1 ring-inset ring-border"
          style={{ backgroundColor: text }}
        />
      ) : null}
      <span className="font-mono text-xs tabular-nums text-foreground">{text}</span>
    </span>
  );
}

/**
 * 编辑主题信息 —— 改 `name` / `description` / `accent`。
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
    try {
      await update.mutateAsync({
        name: name.trim(),
        description: description.trim().length > 0 ? description.trim() : null,
        data,
      });
    } catch {
      // 提示由 `useUpdateTheme` 的 onError 统一弹出；这里只负责**不关窗**。
      return;
    }
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
                  <ColorField
                    id="theme-edit-accent"
                    label="识别色"
                    value={accent}
                    commit={setAccent}
                  />
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
 * v0.8.6 §1.6：光标那七个字段在抽屉里分属两个带框的小节 —— 鼠标框跟着指针走，
 * 操作框钉在当前操作格上，两者只是碰巧都叫「框」。摊成七行平铺，作者读到「阻挡色」
 * 得自己回想它属于哪一个。
 */
const CURSOR_BOXES = [
  {
    key: 'mouseCursorBox',
    title: '鼠标光标框',
    hint: 'Mouse Cursor Box — 跟着指针走，画布最高层。',
  },
  {
    key: 'operationCursorBox',
    title: '操作光标框',
    hint: 'Operation Cursor Box — 钉在当前操作格上，画在网格线外侧。',
  },
] as const;

/**
 * v0.8.3 §2：地图初始样式表单。
 *
 * 字段表来自 `THEME_STYLE_FIELDS`（同一份 `MAP_STYLE_FIELDS` + 各自怎么写），所以
 * 这里不重复列二十几行 JSX —— 那种写法每加一个风格字段都要改两处，而漏掉的那一处
 * 永远不会报错。
 *
 * 「编辑」是**整份草稿**：改到一半取消，主题不动。保存时把 `style` 塞回 `data`
 * （其余键原样带着 —— `data` 是整份覆盖）。
 */
function ThemeStyleDialog({
  theme,
  open,
  onOpenChange,
}: {
  theme: Theme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const [style, setStyle] = useState<MapStyle>(theme.data.style ?? DEFAULT_MAP_STYLE);
  const update = useUpdateTheme(theme.code);

  useEffect(() => {
    if (!open) return;
    setStyle(theme.data.style ?? DEFAULT_MAP_STYLE);
  }, [open, theme.data.style]);

  const set = (key: string, value: string | number | null): void =>
    setStyle((current) => writeStyleValue(current, key, value));

  async function submit(): Promise<void> {
    try {
      await update.mutateAsync({
        data: { ...theme.data, version: theme.data.version ?? 1, style },
      });
    } catch {
      return;
    }
    onOpenChange(false);
  }

  /** 一组里的字段，顺序仍由 `MAP_STYLE_FIELDS` 决定 —— 页面不另排。 */
  const fieldsOf = (group: string): readonly ThemeStyleField[] =>
    THEME_STYLE_FIELDS.filter((field) => field.group === group);

  const renderField = (field: ThemeStyleField): JSX.Element => (
    <Row key={field.key} label={field.label} hint={field.hint}>
      <StyleFieldControl
        field={field}
        value={field.read(style)}
        onChange={(next) => set(field.key, next)}
      />
    </Row>
  );

  /**
   * v0.8.6 §1.6：正文的骨架照「地图基本信息」抽屉 —— 分区之间有下边框、标题后面
   * 一个问号、行是「标签 —— 控件」（`Row`），光标那七个字段收成两个带框的小节。
   *
   * 弹窗原来读起来散：672px 宽的对话框里，标签贴着左边缘、控件贴着右边缘，中间
   * 空出一百多像素，二十几行之间既没有线也没有分区；而同一批字段在抽屉里是 320px
   * 一栏的表单，一行挨着一行。**同一件事在两处长成两样**，作者每次都要重学一遍
   * 「这一行改的是哪一项」。
   *
   * 于是这里只改版式，不加字段：宽度收到一栏，分组标题从「灰字」变成「分区」，
   * 行离得近一点，光标两个框各自围一个边。
   */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-sm font-semibold">
            地图初始样式 · {theme.name}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[62vh] overflow-y-auto">
          {MAP_STYLE_DIFF_GROUPS.map((group) => (
            <section key={group} className="space-y-2 border-b px-4 py-3 last:border-b-0">
              <h3 className="flex items-center text-xs font-semibold text-foreground">
                <span>{group}</span>
                <Hint text={THEME_STYLE_GROUP_HINTS[group] ?? group} />
              </h3>
              {group === '光标' ? (
                <div className="space-y-2">
                  {CURSOR_BOXES.map((box) => (
                    <div key={box.key} className="space-y-1.5 rounded-md border p-2">
                      <span className="flex items-center text-2xs font-medium">
                        <span>{box.title}</span>
                        <Hint text={box.hint} />
                      </span>
                      {fieldsOf(group)
                        .filter((field) => field.key.startsWith(`${box.key}.`))
                        .map(renderField)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">{fieldsOf(group).map(renderField)}</div>
              )}
            </section>
          ))}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setStyle((current) => resetThemeStyle(current))}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            恢复默认
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={update.isPending}>
              {update.isPending ? '保存中…' : '保存'}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/** 一个风格字段的控件：数字 / 颜色 / 阴影 / 字体名，四种，够覆盖整张字段表。 */
function StyleFieldControl({
  field,
  value,
  onChange,
}: {
  field: (typeof THEME_STYLE_FIELDS)[number];
  value: string | number | null;
  onChange: (value: string | number | null) => void;
}): JSX.Element {
  if (field.kind === 'color') {
    const text = typeof value === 'string' ? value : '';
    return (
      <ColorField
        label={field.label}
        value={text}
        commit={onChange}
      />
    );
  }

  if (field.kind === 'number') {
    /**
     * v0.8.6 §1：`cellSize` 那一整套「自适应」的分支删掉了 —— 它是唯一可空的字段，
     * 而它已经不在字段表里。`typeof` 的兜底留着，免得将来有字段的 `read` 返回
     * `null` 时把 `0` 以外的 `NaN` 送到输入框里。
     */
    const numeric = typeof value === 'number' ? value : 0;
    return (
      <NumberField
        id={`theme-style-${field.key}`}
        value={numeric}
        min={field.min ?? 0}
        max={field.max ?? 999}
        step={field.step ?? 1}
        suffix={field.suffix}
        commit={(next) => {
          const clamped = Math.min(field.max ?? 999, Math.max(field.min ?? 0, next));
          onChange(clamped);
        }}
      />
    );
  }

  const text = typeof value === 'string' ? value : '';
  /**
   * 阴影环允许 `rgba()` —— 抽屉那边是一组「色块 + 文本框」：色块给常见的不透明色，
   * 文本框留给带透明度的写法。这里照抄同一副面孔，包括那条「不合法就不写回草稿」
   * 的规矩：框里留着用户打的那半截，视觉上不跳，保存时 schema 仍是最后一道关。
   */
  if (field.kind === 'shadow') {
    return (
      <div className="flex items-center gap-1">
        <ColorInput
          value={isValidStyleColor(text) ? text : '#000000'}
          onChange={onChange}
          aria-label={`${field.label}（取色）`}
        />
        <Input
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            if (!isValidShadowColor(next)) return;
            onChange(next);
          }}
          className="h-7 w-32 font-mono text-2xs"
          aria-label={field.label}
        />
      </div>
    );
  }

  return (
    <Input
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        if (next.trim().length === 0) return;
        onChange(next);
      }}
      className="h-7 w-40 font-mono text-2xs"
      aria-label={field.label}
    />
  );
}

/**
 * v0.8.6 §3：难度分级。
 *
 * 一档 = **数字 + 名字 + 可选颜色**。
 *
 * 数字落进 `games.difficulty`，所以**不给改**：库里那些关只记得数字，改一次就
 * 全对不上了。它同时是顺序 —— 列表按它排，删掉中间一档也不必给后面重新编号
 * （重编号等于把已经在用的关卡集体搬走）。新档的数字接在最大一档后面。
 *
 * 颜色可以不给：不给就按位置落在内置五档那条热力坡上，存量主题因此一个像素都
 * 不变；给了就是一颗 `#rrggbb`，徽章拿它混出淡底与深字（浅色、深色界面各取各的）。
 *
 * 「恢复内置五档」= 把 `difficultyLevels` 这个键删掉，回到「没配过」的状态 ——
 * 比写一份和内置一模一样的数组干净：以后内置改了，这类主题跟着改。
 */
function DifficultyTiersDialog({
  theme,
  open,
  onOpenChange,
}: {
  theme: Theme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const [tiers, setTiers] = useState<ThemeDifficultyTier[]>(() =>
    [...resolveDifficultyTiers(theme.data.difficultyLevels)],
  );
  const update = useUpdateTheme(theme.code);

  useEffect(() => {
    if (!open) return;
    setTiers([...resolveDifficultyTiers(theme.data.difficultyLevels)]);
  }, [open, theme.data.difficultyLevels]);

  /** 只改名字 / 颜色 —— 档位数字是身份，界面上根本不给改。 */
  const patch = (level: number, next: Partial<ThemeDifficultyTier>): void => {
    setTiers((current) =>
      current.map((row) => (row.level === level ? { ...row, ...next } : row)),
    );
  };

  async function submit(): Promise<void> {
    const data: Record<string, unknown> = { ...theme.data };
    /**
     * 「和内置五档一模一样」才删键 —— 名字和**颜色**都要比。
     *
     * v0.8.3 的第一版只比标识，于是「把『极简』改名叫『入门』」会被判成「还是
     * 内置五档」，保存后名字又变回「极简」。v0.8.6 加了颜色，同一个坑再多一维：
     * 只改了颜色的档，删掉键之后颜色也跟着没了。
     */
    const isBuiltIn =
      tiers.length === DEFAULT_DIFFICULTY_TIERS.length &&
      tiers.every((tier, index) => {
        const builtin = DEFAULT_DIFFICULTY_TIERS[index];
        return (
          builtin !== undefined &&
          tier.level === builtin.level &&
          tier.label === builtin.label &&
          tier.color === undefined
        );
      });
    if (isBuiltIn) delete data['difficultyLevels'];
    else data['difficultyLevels'] = tiers;
    try {
      await update.mutateAsync({ data });
    } catch {
      return;
    }
    onOpenChange(false);
  }

  const tooFew = tiers.length === 0;
  const tooMany = tiers.length >= THEME_DIFFICULTY_TIER_MAX;
  const nextLevel = nextDifficultyLevel(tiers);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>难度分级 · {theme.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-2xs leading-relaxed text-muted-foreground">
            数字是档位，落库的就是它，越大越难；名字与颜色只影响展示。颜色不改就沿用内置那五档的坡。
          </p>

          <ul className="space-y-2">
            {tiers.map((tier) => (
              <li key={tier.level} className="flex items-center gap-2">
                <span
                  className="w-5 shrink-0 text-center font-mono text-2xs text-muted-foreground"
                  title={`第 ${tier.level} 档`}
                >
                  {tier.level}
                </span>
                <DifficultyBadge difficulty={tier.level} tiers={tiers} className="w-14 justify-center text-center" />
                <Input
                  value={tier.label}
                  aria-label={`第 ${tier.level} 档名称`}
                  maxLength={12}
                  onChange={(event) => patch(tier.level, { label: event.target.value })}
                  className="h-8 flex-1 text-sm"
                />
                <ColorField
                  value={difficultySwatchColor(tiers, tier.level)}
                  label={`第 ${tier.level} 档颜色`}
                  commit={(color) => patch(tier.level, { color })}
                />
                <IconButton
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  label="恢复默认色"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground"
                  disabled={tier.color === undefined}
                  onClick={() => patch(tier.level, { color: undefined })}
                />
                <IconButton
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  label="删除这一档"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  disabled={tiers.length <= 1}
                  onClick={() =>
                    setTiers((current) => current.filter((row) => row.level !== tier.level))
                  }
                />
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={tooMany}
              onClick={() =>
                setTiers((current) => [
                  ...current,
                  { level: nextLevel, label: `第 ${nextLevel} 档` },
                ])
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              添加一档
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setTiers([...DEFAULT_DIFFICULTY_TIERS])}
            >
              恢复内置五档
            </Button>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={tooFew || update.isPending || tiers.some((tier) => tier.label.trim().length === 0)}
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
  const filled = useMemo(
    () =>
      [
        theme.counts.assets > 0 ? `${theme.counts.assets} 个资源` : null,
        theme.counts.maps > 0 ? `${theme.counts.maps} 张地图` : null,
        theme.counts.characters > 0 ? `${theme.counts.characters} 个角色` : null,
        theme.counts.puzzles > 0 ? `${theme.counts.puzzles} 个谜题` : null,
      ].filter((part): part is string => part !== null),
    [theme.counts],
  );

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function confirm(): Promise<void> {
    try {
      await remove.mutateAsync(theme.code);
      onOpenChange(false);
      navigate(SETTINGS_THEMES_PATH);
    } catch (cause) {
      // 服务端才是权威（它手里有计数）。它拒绝时那句话要留在对话框里 ——
      // 关掉弹窗再 toast 一句，作者就看不到「还差什么」了。
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
