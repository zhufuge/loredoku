import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronRight, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  DEFAULT_DIFFICULTY_TIERS,
  DEFAULT_MAP_STYLE,
  MAP_STYLE_DIFF_GROUPS,
  nextDifficultyKey,
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
import { ColorField } from '@/components/ui/color-input';
import { IconButton } from '@/components/ui/icon-button';
import { PageHeader } from '@/components/layout/PageHeader';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { DifficultyBadge } from '@/components/game/DifficultyBadge';
import { NumberField } from '@/components/map-editor/StyleFields';
import { useDeleteTheme, useUpdateTheme } from '@/hooks/useThemes';
import { isValidShadowColor } from '@/lib/mapStyle';
import { THEME_STYLE_FIELDS, writeStyleValue } from '@/lib/themeStyleFields';
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
 * - **缺省风格**：二十几项按网格 / 边框 / 标签 / 光标列成清单，可整份编辑（v0.8.3）；
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
  /** 没有缺省风格的主题，渲染的是**新建地图时会拿到的**那份 —— 清单不能是空的。 */
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
       * v0.8.3 §2：缺省风格。
       *
       * 以前这一行只写「去地图的『基本信息』里用『设为主题风格』写入」—— 那是一句
       * 操作指引，读者还得再走四步。现在它是一张**清单**：二十几项按四个分组列全，
       * 每项一行「名字 + 当前值」，右上角一个「编辑」把整份打开成表单。
       */}
      <Card className="space-y-3 px-4 py-4">
        <CardHead
          title="缺省风格"
          description="新建地图时抄这一份；已经画好的图不受影响。"
          onEdit={() => setStyleOpen(true)}
          editLabel="编辑缺省风格"
        />
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
          {MAP_STYLE_DIFF_GROUPS.map((group) => {
            const rows = THEME_STYLE_FIELDS.filter((field) => field.group === group);
            return (
              <Fragment key={group}>
                <h4 className="col-span-full mt-1 text-2xs font-medium text-muted-foreground first:mt-0">
                  {group}
                </h4>
                {rows.map((field) => (
                  <div
                    key={field.key}
                    className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 last:border-b-0"
                  >
                    <span className="truncate text-xs text-muted-foreground">{field.label}</span>
                    <StyleValue kind={field.kind} text={field.format(style)} />
                  </div>
                ))}
              </Fragment>
            );
          })}
        </div>
      </Card>

      {/* v0.8.3 §3：难度分级。徽章就是部署页 / 游戏卡上那一枚，所见即所得。 */}
      <Card className="space-y-3 px-4 py-4">
        <CardHead
          title="难度分级"
          description={
            theme.data.difficultyLevels
              ? '部署关卡时从这几档里挑，顺序即由易到难。'
              : '还没改过，用的是内置五档；部署关卡时从这几档里挑。'
          }
          onEdit={() => setTiersOpen(true)}
          editLabel="编辑难度分级"
        />
        <div className="flex flex-wrap gap-2">
          {tiers.map((tier) => (
            <DifficultyBadge key={tier.key} difficulty={tier.key} tiers={tiers} className="px-2.5 py-1 text-xs" />
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

/** 清单卡片的头：标题 + 一句口径 + 「编辑」。三个区块共用。 */
function CardHead({
  title,
  description,
  onEdit,
  editLabel,
}: {
  title: string;
  description: string;
  onEdit: () => void;
  /** 两个区块并排时，两个都叫「编辑」读者分不清是哪一个。 */
  editLabel: string;
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="font-kai text-base leading-tight">{title}</h3>
        <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Button variant="outline" size="sm" className="shrink-0" onClick={onEdit}>
        {editLabel}
      </Button>
    </div>
  );
}

/** 清单里的一格值：颜色给色块 + 色值，别的一律等宽字。 */
function StyleValue({ kind, text }: { kind: string; text: string }): JSX.Element {
  const isColor = kind === 'color' && /^#[0-9a-fA-F]{6}$/.test(text);
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      {isColor ? (
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-sm ring-1 ring-inset ring-border"
          style={{ backgroundColor: text }}
        />
      ) : null}
      <span className="font-mono text-2xs text-foreground">{text}</span>
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
 * v0.8.3 §2：缺省风格表单。
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>缺省风格 · {theme.name}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[64vh] space-y-4 overflow-y-auto pr-1">
          {MAP_STYLE_DIFF_GROUPS.map((group) => (
            <section key={group} className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">{group}</h4>
              <div className="space-y-1.5">
                {THEME_STYLE_FIELDS.filter((field) => field.group === group).map((field) => {
                  const value = field.read(style);
                  return (
                    <div key={field.key} className="flex items-center justify-between gap-3">
                      <Label className="text-2xs font-normal text-muted-foreground">
                        {field.label}
                      </Label>
                      <StyleFieldControl
                        field={field}
                        value={value}
                        onChange={(next) => set(field.key, next)}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setStyle(DEFAULT_MAP_STYLE)}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            恢复默认
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={() => void submit()} disabled={update.isPending}>
              {update.isPending ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
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
    const numeric = typeof value === 'number' ? value : 0;
    return (
      <div className="flex items-center gap-1">
        {/* `cellSize` 可以是 `null`（按画布自适应）—— 回不去的话那一项只能越改越死。 */}
        {field.key === 'cellSize' && value === null ? (
          <span className="w-16 text-right text-2xs text-muted-foreground">自适应</span>
        ) : (
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
        )}
        {field.key === 'cellSize' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={value === null ? '当前已是自适应' : '改为自适应'}
            disabled={value === null}
            onClick={() => onChange(null)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    );
  }

  const text = typeof value === 'string' ? value : '';
  /**
   * 阴影环允许 `rgba()` —— 这里只拦「明明打错了却照样提交」：输入不合法时不写回
   * 草稿，框里留着用户打的那半截，视觉上不跳。保存时 schema 仍是最后一道关。
   */
  return (
    <Input
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        if (field.kind === 'shadow' && !isValidShadowColor(next)) return;
        if (field.kind === 'text' && next.trim().length === 0) return;
        onChange(next);
      }}
      className="h-7 w-40 font-mono text-2xs"
      aria-label={field.label}
    />
  );
}

/**
 * v0.8.3 §3：难度分级。
 *
 * 一档 = 标识 + 名字。**标识不给改**：它落进 `games.difficulty`，改一次，库里那些
 * 关就跟新名字对不上了，而这里没有任何东西能替它们改回来。名字随便改 —— 那才是
 * 「说法」。新档的标识由 `nextDifficultyKey` 生成（`tier-1`、`tier-2` …），
 * 因为中文名 slug 化之后什么都不剩。
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

  const move = (index: number, delta: number): void => {
    setTiers((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row as ThemeDifficultyTier);
      return next;
    });
  };

  async function submit(): Promise<void> {
    const data: Record<string, unknown> = { ...theme.data };
    /**
     * 「和内置五档一模一样」才删键 —— 并且要连**名字**一起比。
     *
     * v0.8.3 修：这里第一版只比 `key`，于是「把『极简』改名叫『入门』」会被判成
     * 「还是内置五档」，`difficultyLevels` 被删掉，保存后名字又变回「极简」——
     * 界面上看起来就是「保存不生效」。改名字不改 key，但名字正是作者要存的东西。
     */
    const isBuiltIn =
      tiers.length === DEFAULT_DIFFICULTY_TIERS.length &&
      tiers.every((tier, index) => {
        const builtin = DEFAULT_DIFFICULTY_TIERS[index];
        return builtin !== undefined && tier.key === builtin.key && tier.label === builtin.label;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>难度分级 · {theme.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-2xs leading-relaxed text-muted-foreground">
            顺序即由易到难，徽章的底色也按这个顺序取。标识落库，不能改；名字随便改。
          </p>

          <ul className="space-y-2">
            {tiers.map((tier, index) => (
              <li key={tier.key} className="flex items-center gap-2">
                <DifficultyBadge difficulty={tier.key} tiers={tiers} className="w-16 justify-center text-center" />
                <Input
                  value={tier.label}
                  aria-label={`第 ${index + 1} 档名称`}
                  maxLength={12}
                  onChange={(event) =>
                    setTiers((current) =>
                      current.map((row, position) =>
                        position === index ? { ...row, label: event.target.value } : row,
                      ),
                    )
                  }
                  className="h-8 flex-1 text-sm"
                />
                <span className="w-20 shrink-0 truncate font-mono text-2xs text-muted-foreground">
                  {tier.key}
                </span>
                <IconButton
                  icon={<ArrowUp className="h-3.5 w-3.5" />}
                  label="上移"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                />
                <IconButton
                  icon={<ArrowDown className="h-3.5 w-3.5" />}
                  label="下移"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground"
                  disabled={index === tiers.length - 1}
                  onClick={() => move(index, 1)}
                />
                <IconButton
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  label="删除这一档"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  disabled={tiers.length <= 1}
                  onClick={() => setTiers((current) => current.filter((_, position) => position !== index))}
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
                  { key: nextDifficultyKey(current), label: `第 ${current.length + 1} 档` },
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
