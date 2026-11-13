import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Settings2 } from 'lucide-react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeSwitcher } from '@/components/layout/ThemeSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { WORKSHOP_MIN_WIDTH_CLASS } from '@/lib/layout';
import { MODULE_ICONS } from '@/lib/moduleIcons';
import { TOOLBAR_ICON_HOVER_CLASS } from '@/lib/toolbarButtons';
import { workshopPath, type ModuleKey } from '@/lib/workspace';
import { cn } from '@/lib/utils';

/**
 * 工坊导航（v0.8.0 §18）：概览 → 资源 → 地图 → 角色 → 谜题 → 部署。
 *
 * 顺序按「先看这个空间有什么、再备料、再画图、再安排人物、最后出题与上线」的
 * 工作流排。全部挂在当前主题编码之下（`/hlm/maps`）—— 「在哪个世界」由地址说，
 * 不再由一条可切换的横条说。
 *
 * 图标不在这里写：`MODULE_ICONS`（`lib/moduleIcons.ts`）是唯一一份，概览页的
 * 计数卡取的是同一张表。
 */
const navItems: ReadonlyArray<{ key: ModuleKey; label: string }> = [
  /*
   * v0.8.0 §18：第一项从「主题列表」换成「概览」。主题列表搬去了系统配置页 ——
   * 它是**换工作空间**的地方，不是任何一个空间内部的一页；把两者挤在同一个
   * 顶栏里，等于让「我在哪」和「去哪儿」共用一格。
   */
  { key: 'overview', label: '概览' },
  { key: 'assets', label: '资源' },
  { key: 'maps', label: '地图' },
  { key: 'characters', label: '角色' },
  { key: 'puzzles', label: '谜题' },
  { key: 'deployments', label: '部署' },
];

/**
 * 外壳。两种形态：
 *
 * - `workshop`（默认）：品牌 + 六个模块 + 主题切换器 + 日夜开关 + 游戏。模块地址
 *   带当前主题编码。
 * - `config`：**没有模块**。系统配置是一间"机房"，从这里不直接干活，所以顶栏只
 *   留品牌 + 「系统配置」字样 + 一条回工坊的路 —— 一进来就知道自己离开了内容。
 *
 * 两种形态共用同一块 56px 的高和同一个 `max-w-7xl`：来回切的时候右边缘不会跳。
 */
export function AppShell({ variant = 'workshop' }: { variant?: 'workshop' | 'config' }): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useWorkspace();
  const config = variant === 'config';

  return (
    /*
     * v0.10.3：工坊是桌面工具，窄屏不做重排，改为整页横向滚动。
     *
     * 评审实测（375 宽）：顶栏右侧那一簇（主题切换器 94 + 日夜 36 + 游戏 76
     * + 两道 8px 间距）固定 222px，`ml-auto` 不给它收缩的余地，于是整份文档
     * 被撑到 561px —— 多出来的 186px 落在一个**不可滚**的裁切区里。加一条
     * 下限宽度之后，撑出去的部分至少能滚到。
     *
     * 为什么不是 `flex-wrap`：`nav` 已经是 `flex-wrap`，再让右边那簇也换行，
     * 375 宽上顶栏会长成三四行、每行一两个字（实测 nav 62px 宽 × 356px 高，
     * 六项各占 56px 高）。桌面工具在手机上「滚」比「碎成条」可读。
     */
    <div className={cn('flex min-h-screen flex-col', WORKSHOP_MIN_WIDTH_CLASS)}>
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        {/* v0.7.8 §10：`h-14` 写死高度 + 导航 `flex-wrap` 是一对矛盾 —— 窄屏
            导航换到第二行时会被 56px 的框裁掉、压在正文上。改 `min-h-14`：
            宽屏仍是 56px（36px 内容 + py-2 共 52 < 56，两者取大），窄屏自然长高。 */}
        <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center gap-5 px-6 py-2">
          <BrandLogo height={20} withWordmark suffix={config ? '' : ' · 工坊'} />

          {config ? (
            /*
             * v0.8.2：不再在品牌后面加一条 `/`。
             *
             * 斜杠是「面包屑」的语法 —— 它告诉读者右边这一段挂在左边那一段之下。
             * 可「系统配置」并不挂在「格物」之下，它是同一层级的另一处地方；而且
             * 品牌里已经有「· 格物」这个分隔符，紧跟一条斜杠等于一句话里打两个断。
             * 位置关系交给间距（父级 `gap-5`），这里只放它自己的名字。
             */
            <span
              className="flex items-center gap-1.5 text-sm text-muted-foreground"
              data-testid="config-crumb"
            >
              <Settings2 className="h-3.5 w-3.5" />
              系统配置
            </span>
          ) : (
            <nav className="flex flex-wrap items-center gap-1">
              {navItems.map(({ key, label }) => {
                const Icon = MODULE_ICONS[key];
                return (
                  <NavLink
                    key={key}
                    to={workspace ? workspace.href(key) : workshopPath(key)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        /*
                         * v0.7.8：选中态从「中性灰实心」换成 primary 淡染 + primary 字。
                         * 这里是全站唯一的「你在哪」提示 —— 冷蓝时代它是一片灰，整块
                         * 顶栏没有任何颜色，导航等于没有反馈。工具条（`--toolbar*`）保持
                         * 中性，因为画布上已经铺着 primary 的选框，两处都染色会打架。
                         */
                        isActive
                          ? 'bg-primary/10 text-primary hover:bg-primary/20'
                          : cn('text-muted-foreground hover:text-foreground', TOOLBAR_ICON_HOVER_CLASS),
                      )
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                );
              })}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            {config ? null : (
              /* v0.8.0 §18：主题切换器紧挨日夜开关 —— 两者都是「外壳的开关」，
                 一个换世界、一个换明暗，不该分居顶栏两端。 */
              <ThemeSwitcher />
            )}
            {/* v0.5.7: theme switch — every console page rides this header. */}
            <ThemeToggle className="h-9 w-9" />
            {/*
              * v0.8.2：配置页的「返回工坊」挪到日夜开关之后。
              *
              * 两个外壳的**右上角最后一位**从此是同一个位置：工坊是「游戏」，
              * 配置页是「返回工坊」—— 都是「离开这一处」的出口。原来它排在日夜
              * 开关前面，于是同一趟来回，出口会在顶栏里左右横跳一格。
              */}
            {config ? (
              /*
               * v0.8.3（docs/v0.8.3.md §13）：回工坊去**入口**，不自己拼地址。
               *
               * 原来这里写 `workshopPath('overview')`，也就是 `/记住的编码/overview`。
               * 可那个编码可能是刚被删掉的那一间 —— 系统配置正是「删主题」之后落脚的
               * 地方，于是点「返回工坊」得到的是「没有编码是 xxx 的主题」，明明还有
               * 别的工坊开着。
               *
               * `/` 是 `ThemeEntryRedirect`：它把记住的编码对着**现有主题列表**验
               * 一遍，失效就落到第一间，一间都没有才去配置页。判断只有那一处，
               * 这里只负责说「回去」。
               */
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link to="/">返回工坊</Link>
              </Button>
            ) : (
              /* v0.5.4 FEAT-O07 (docs/v0.5.4.md §4): the way into the player side. */
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => navigate('/play')}
                title="进入游戏首页"
              >
                游戏
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
