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
import { DeleteThemeDialog } from '@/components/theme-overview/DeleteThemeDialog';
import { resolveMapStyle } from '@/lib/mapStyle';
import { THEME_STYLE_FIELDS } from '@/lib/themeStyleFields';
import { SETTINGS_THEMES_PATH, type ModuleKey } from '@/lib/workspace';
import { MODULE_ICONS } from '@/lib/moduleIcons';

/**
 * v0.8.2：入口只写「去哪、叫什么」，图标从 `MODULE_ICONS` 取 —— 与顶栏同一枚。
 *
 * v0.10.4：五个子组件（清单卡片头 / 一行事实 / 操作提示卡 / 三个设置弹窗）各自
 * 成文件，这一页只剩「这一屏由哪些卡片组成」。拆之前它 1225 行，一半是弹窗里
 * 的控件代码。
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
  /**
   * 没有初始样式的主题，渲染的是**新建地图时会拿到的**那份 —— 清单不能是空的。
   * v0.9.1：走 `resolveMapStyle` 而不是 `?? DEFAULT_MAP_STYLE` —— 老主题存的是
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

      {/*
        v0.9.5：这五项原本是四张独立的卡片（标记 / 工具按钮图标 / 长按计时环 /
        提交校验）—— 它们回答的是同一个问题：**玩家在盘面上操作时看到的那些提示长
        什么样**。分四张会让人以为四件事互不相干，而作者改的时候往往是一起调的。
        合成一张卡之后，五枚图并排放在同一节里，一眼看得全。
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

      <EditThemeDialog theme={theme} open={editOpen} onOpenChange={setEditOpen} />
      <ThemeStyleDialog theme={theme} open={styleOpen} onOpenChange={setStyleOpen} />
      <DifficultyTiersDialog theme={theme} open={tiersOpen} onOpenChange={setTiersOpen} />
      <DeleteThemeDialog theme={theme} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </section>
  );
}
