import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Map, Package, Puzzle, Rocket, Users } from 'lucide-react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { TOOLBAR_ICON_HOVER_CLASS } from '@/lib/toolbarButtons';
import { cn } from '@/lib/utils';

/**
 * 工坊导航（v0.7.1）：资源 → 地图 → 角色 → 谜题 → 部署。
 *
 * 顺序按「先备料、再画图、再安排人物、最后出题与上线」的工作流排；`/` 落到
 * `/maps`（见 `router.tsx`），所以从根路径进来默认亮的是「地图」。
 */
const navItems = [
  { to: '/assets', label: '资源', icon: Package },
  { to: '/maps', label: '地图', icon: Map },
  { to: '/characters', label: '角色', icon: Users },
  { to: '/puzzles', label: '谜题', icon: Puzzle },
  { to: '/deployments', label: '部署', icon: Rocket },
];

const WORKSHOP_SUFFIX = ' · 工坊';

export function AppShell(): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        {/* v0.7.8 §10：`h-14` 写死高度 + 导航 `flex-wrap` 是一对矛盾 —— 窄屏
            导航换到第二行时会被 56px 的框裁掉、压在正文上。改 `min-h-14`：
            宽屏仍是 56px（36px 内容 + py-2 共 52 < 56，两者取大），窄屏自然长高。 */}
        <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center gap-6 px-6 py-2">
          <BrandLogo height={20} withWordmark suffix={WORKSHOP_SUFFIX} />
          {/* 五项时窄屏会挤，允许换行（不做折叠菜单）。 */}
          <nav className="flex flex-wrap items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
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
          <div className="ml-auto flex items-center gap-2">
            {/* v0.5.7: theme switch — every console page rides this header. */}
            <ThemeToggle className="h-9 w-9" />
            {/* v0.5.4 FEAT-O07 (docs/v0.5.4.md §4): the way into the player side. */}
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
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
