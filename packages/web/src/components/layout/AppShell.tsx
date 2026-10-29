import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Layers, Map, Package, Puzzle, Rocket, Settings2, Users } from 'lucide-react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeSwitcher } from '@/components/layout/ThemeSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { TOOLBAR_ICON_HOVER_CLASS } from '@/lib/toolbarButtons';
import { workshopPath, type ModuleKey } from '@/lib/workspace';
import { cn } from '@/lib/utils';

/**
 * 工坊导航（v0.8.0 §18）：概览 → 资源 → 地图 → 角色 → 谜题 → 部署。
 *
 * 顺序按「先看这个空间有什么、再备料、再画图、再安排人物、最后出题与上线」的
 * 工作流排。全部挂在当前主题编码之下（`/hlm/maps`）—— 「在哪个世界」由地址说，
 * 不再由一条可切换的横条说。
 */
const navItems: ReadonlyArray<{ key: ModuleKey; label: string; icon: typeof Package }> = [
  /*
   * v0.8.0 §18：第一项从「主题列表」换成「概览」。主题列表搬去了系统配置页 ——
   * 它是**换工作空间**的地方，不是任何一个空间内部的一页；把两者挤在同一个
   * 顶栏里，等于让「我在哪」和「去哪儿」共用一格。
   *
   * 图标仍是 `Layers`：一排叠起来的作品，正好是「这个世界」的形状。
   */
  { key: 'basic', label: '概览', icon: Layers },
  { key: 'assets', label: '资源', icon: Package },
  { key: 'maps', label: '地图', icon: Map },
  { key: 'characters', label: '角色', icon: Users },
  { key: 'puzzles', label: '谜题', icon: Puzzle },
  { key: 'deployments', label: '部署', icon: Rocket },
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
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        {/* v0.7.8 §10：`h-14` 写死高度 + 导航 `flex-wrap` 是一对矛盾 —— 窄屏
            导航换到第二行时会被 56px 的框裁掉、压在正文上。改 `min-h-14`：
            宽屏仍是 56px（36px 内容 + py-2 共 52 < 56，两者取大），窄屏自然长高。 */}
        <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center gap-5 px-6 py-2">
          <BrandLogo height={20} withWordmark suffix={config ? '' : ' · 工坊'} />

          {config ? (
            <span
              className="flex items-center gap-1.5 text-sm text-muted-foreground"
              data-testid="config-crumb"
            >
              <span aria-hidden className="text-border">
                /
              </span>
              <Settings2 className="h-3.5 w-3.5" />
              系统配置
            </span>
          ) : (
            <nav className="flex flex-wrap items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.key}
                  to={workspace ? workspace.href(item.key) : workshopPath(item.key)}
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
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            {config ? (
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link to={workshopPath('basic')}>返回工坊</Link>
              </Button>
            ) : (
              /* v0.8.0 §18：主题切换器紧挨日夜开关 —— 两者都是「外壳的开关」，
                 一个换世界、一个换明暗，不该分居顶栏两端。 */
              <ThemeSwitcher />
            )}
            {/* v0.5.7: theme switch — every console page rides this header. */}
            <ThemeToggle className="h-9 w-9" />
            {config ? null : (
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
