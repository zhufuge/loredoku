import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import {
  MAP_STYLE_DIFF_GROUPS,
  resolveDifficultyTiers,
  type ThemeCounts,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { DifficultyBadge } from '@/components/game/DifficultyBadge';
import { CardHead, FactRow, StyleValue } from '@/components/theme-overview/ThemeOverviewParts';
import { GameMarksCard } from '@/components/theme-overview/GameMarksCard';
import { EditThemeDialog } from '@/components/theme-overview/EditThemeDialog';
import { ThemeStyleDialog } from '@/components/theme-overview/ThemeStyleDialog';
import { DifficultyTiersDialog } from '@/components/theme-overview/DifficultyTiersDialog';
import { GameListTextsCard } from '@/components/theme-overview/GameListTextsCard';
import { DeleteThemeDialog } from '@/components/theme-overview/DeleteThemeDialog';
import { resolveMapStyle } from '@/lib/mapStyle';
import { THEME_STYLE_FIELDS } from '@/lib/themeStyleFields';
import { SETTINGS_THEMES_PATH, type ModuleKey } from '@/lib/workspace';
import { MODULE_ICONS } from '@/lib/moduleIcons';

/**
 * 入口只写「去哪、叫什么」，图标从 `MODULE_ICONS` 取 —— 与顶栏同一枚。
 *
 * 五个子组件（清单卡片头 / 一行事实 / 操作提示卡 / 三个设置弹窗）各自
 * 成文件，这一页只剩「这一屏由哪些卡片组成」。
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
 * 「上线」与「导出资源包」在**部署页** —— 那才是「出门」这件事发生的地方，
 * 而概览页回答的是静态问题。这一页的动作只有编辑信息、删除两个，`⋯` 也就没有
 * 必要了：一个装两个按钮的菜单，比两个按钮贵。
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
  /**
   * 没有初始样式的主题，渲染的是**新建地图时会拿到的**那份 —— 清单不能是空的。
   * 走 `resolveMapStyle` 而不是 `?? DEFAULT_MAP_STYLE` —— 老主题存的是
   * 旧形状（缺 `canvasShadow`），直接读字段会炸；解析一遍把缺的键补齐。
   */
  const style = resolveMapStyle(theme.data.style);
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
       * 图标 24px、描边 1.5：24px 的 lucide 若还用默认 stroke-width=2，线条会粗一半
       * （同一份 24 单位坐标放大），卡片排起来像几个加粗的按钮；1.5 让视觉重量不变，
       * 只是「更大」。
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
         * 识别色是一行事实，不是一个小控件。它的编辑在「编辑信息」里，
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
       * v0.8.6 §1：「地图初始样式」这个名字直说这一区块的用途 —— 告诉新建的那张图
       * 长什么样，不必先知道「缺省」是 default 的旧译、再猜「风格」指的是地图的样式。
       *
       * 不写副标题：清单本身就是答案，一句话解释一个已经看得见的东西只占了第一屏。
       */}
      <Card className="space-y-3 px-4 py-4">
        <CardHead title="地图初始样式" onEdit={() => setStyleOpen(true)} />
        {/*
         * v0.8.7 §1 —— 这份清单用 CSS 多栏（`columns-*`）：组是**一栏里的一段**，
         * 浏览器按内容高度把四段分进三栏（2+5 / 9 / 7 行），既没有洞，也不用手写
         * 「哪组进哪栏」的表 —— 那种表每加一组就要跟着改一次。`break-inside-avoid`
         * 保证一组不会被从中间劈到两栏。
         */}
        <div className="columns-1 gap-x-10 lg:columns-3">
          {MAP_STYLE_DIFF_GROUPS.map((group) => {
            const rows = THEME_STYLE_FIELDS.filter((field) => field.group === group);
            return (
              <section key={group} className="mb-5 break-inside-avoid last:mb-0">
                {/*
                 * 组名是**栏头**：稍重一点的颜色 + 一条通栏细线。组在栏里上下相接，
                 * 只靠位置已经分不开，所以它得是栏头而不是一行小字。
                 */}
                <h4 className="mb-1.5 border-b border-border pb-1 text-2xs font-medium tracking-[0.08em] text-foreground/70">
                  {group}
                </h4>
                {/*
                 * `dt` / `dd` 是同一个网格的两列，值列宽度由**这一组里最长的值**决定，
                 * 于是同一组的右边缘落在一条线上 ——「4px」和「12px」的末位对齐，
                 * 七个字符的色值自然也排成一列。让值贴列右边缘的话（列宽 373px），
                 * 标签与值之间隔着大半列空白，读一行要横着扫过去。
                 *
                 * 为什么只对齐到「组」：网格是每组一份（组要 `break-inside-avoid`，
                 * 不能拆到两栏）。组与组之间差几个像素，值都还是贴着自己那条右边缘。
                 *
                 * **两套列宽是有意的**：`lg` 以上一栏 373px，右对齐像一张表；`lg` 以下
                 * 整页只剩一栏（宽 500+），同样右对齐的话标签与值之间会空出半行，读一行
                 * 要横跨半屏 —— 那时标签按内容宽、值紧跟其后。单栏里没人拿它竖着扫，
                 * 组与组差几个像素不算问题。
                 *
                 * 也就不画行分隔线：二十几条横线只把纸面切成格子，而每一行短的
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

      {/*
        这五项同属一张卡：它们回答的是同一个问题 —— **玩家在盘面上操作时看到的那些
        提示长什么样**。分成几张会让人以为几件事互不相干，而作者改的时候往往是一起
        调的；合成一张后五枚图并排放在同一节里，一眼看得全。
      */}
      <GameMarksCard theme={theme} />

      {/* v0.8.3 §3：难度分级。徽章就是部署页 / 游戏卡上那一枚，所见即所得。 */}
      <Card className="space-y-3 px-4 py-4">
        <CardHead title="难度分级" onEdit={() => setTiersOpen(true)} />
        <div className="flex flex-wrap gap-2">
          {tiers.map((tier) => (
            <DifficultyBadge key={tier.level} difficulty={tier.level} tiers={tiers} className="px-2.5 py-1 text-xs" />
          ))}
        </div>
      </Card>

      {/*
        玩家侧列表页顶上那两行字。它们是**这个主题**的口气，不是全站的
        统一文案 —— 与难度分级挨着放，因为两者都是「这个主题怎么描述自己的关卡」。
      */}
      <Card className="space-y-3 px-4 py-4">
        <CardHead title="游戏列表文案" />
        <GameListTextsCard theme={theme} />
      </Card>

      <EditThemeDialog theme={theme} open={editOpen} onOpenChange={setEditOpen} />
      <ThemeStyleDialog theme={theme} open={styleOpen} onOpenChange={setStyleOpen} />
      <DifficultyTiersDialog theme={theme} open={tiersOpen} onOpenChange={setTiersOpen} />
      <DeleteThemeDialog theme={theme} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </section>
  );
}
