import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Map, Package, Puzzle, Users } from 'lucide-react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  // v0.5.4 FEAT-O06 / SPEC-O19 (docs/v0.5.4.md §4): the module moved to
  // `/maps`, but it still **speaks** 地图 — 琢玉台 is only the header suffix the
  // page adds to the wordmark.
  { to: '/maps', label: '地图', icon: Map },
  { to: '/items', label: '物品', icon: Package },
  { to: '/characters', label: '角色', icon: Users },
  { to: '/puzzles', label: '谜题', icon: Puzzle },
];

/**
 * FEAT-O05 §4.2 / SPEC-O19: the header's wordmark gains a third segment —
 * 「图标 · 格物 · 琢玉台」 — while the console is on the map page. 琢玉台 is
 * the **maker-side name of the console**, so it rides the wordmark; the page
 * title, the nav label and `document.title` all keep speaking 地图.
 */
const ZHUYUTAI_SUFFIX = ' · 琢玉台';

export function AppShell(): JSX.Element {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onMaps = pathname === '/maps' || pathname.startsWith('/maps/');

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-6">
          {/* v0.5.3 FEAT-N02 (docs/v0.5.3.md §2): 「图标 · 格物」. */}
          <BrandLogo height={20} withWordmark suffix={onMaps ? ZHUYUTAI_SUFFIX : undefined} />
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          {/* v0.5.4 FEAT-O07 (docs/v0.5.4.md §4): the way into the player side. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => navigate('/play')}
            title="进入游戏首页"
          >
            入局
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
