import { useNavigate } from 'react-router-dom';
import {
  GAME_DIFFICULTY_COLORS,
  GAME_DIFFICULTY_LABELS,
  GAME_DIFFICULTY_TEXT_COLORS,
} from '@loredoku/shared';
import type { MapGameSummary } from '@loredoku/shared';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * FEAT-G01 (docs/v0.4.0.md §4): one deployed game as a card — cover, name,
 * difficulty badge and the `n×n` spec. The whole card is one button so a
 * mis-click anywhere on it starts the game.
 *
 * OPT-W04 (docs/v0.4.1.md §4.7): the card links to the game's access path.
 */

/**
 * 纸背光（v0.7.10 §10）：把指针在封面**内部**的坐标写进两个 CSS 变量，光斑画在
 * 哪儿完全由 CSS 读这两个值决定。
 *
 * 为什么不走 state：指针每秒移动几十次，每次 setState 都是一次 React 重渲染，
 * 而这张卡上挂着封面图、难度徽章、标题、尺寸四块内容 —— 一次重渲染要把它们
 * 全部重新 reconcile 一遍，换来的只是「光斑动了」。写 CSS 变量只让合成层重绘，
 * **整段悬停期间 React 一次都不渲染**。
 *
 * 为什么每次移动都重读一遍 rect 而不是「进入时缓存」：读之前没有写样式或改
 * DOM，布局是干净的，这次读不会触发重排；而缓存要在滚动、缩放、窗口尺寸变化、
 * 页面换页时各自失效一次，边界比省下的那点开销贵得多。
 *
 * v0.7.13 §10.11：顺带算出「收回」那个圆形取景框的半径。遮罩要不透明地盖住
 * 整个封面，半径就得等于**指针到最远那个角**的距离（在角上时是 1.41 倍边长，
 * 在正中时只有 0.71 倍），这个值随指针走，CSS 里算不出来。多加的羽化宽度也
 * 从同一个地方出 —— 两个数必须一致，否则边界会在静止时切进封面。
 */
const GLOW_FEATHER_MAX = 72;

function followPointerWithGlow(event: React.PointerEvent<HTMLDivElement>): void {
  const cover = event.currentTarget;
  const rect = cover.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  cover.style.setProperty('--glow-x', `${x}px`);
  cover.style.setProperty('--glow-y', `${y}px`);

  // 羽化按尺寸收一点：小卡片上 72px 就是半张封面，边界会软得看不出在收。
  const feather = Math.min(GLOW_FEATHER_MAX, rect.width * 0.2);
  const farthestX = Math.max(x, rect.width - x);
  const farthestY = Math.max(y, rect.height - y);
  cover.style.setProperty('--glow-feather', `${feather}px`);
  // +2px 是给「边界正好压在角上」留的余量：没有它，最远那个角的抗锯齿边缘
  // 会落在羽化区的第一个像素上，静止时暗角被削掉一丝。
  cover.style.setProperty('--glow-reach', `${Math.hypot(farthestX, farthestY) + feather + 2}px`);
}

/**
 * 两层光（v0.7.10 §10）。分开写是因为**一个元素只能有一个 `mix-blend-mode`**：
 * 暗角要 `multiply`（压暗），热斑要 `normal`（叠白）。顺序即叠放顺序，暗角必须
 * 在最底下 —— 它压的是封面本身，压在热斑上会把热斑弄脏。
 */
const LIGHT_LAYERS = ['paper-shade', 'paper-core'] as const;

/**
 * v0.8.0（docs/v0.8.0.md §16.6）：`href` 让同一张卡也能指向**主题里的**那一关
 * （`/play/theme/:slug/:key`）。不传就是原来的单局地址 —— 存档键在两个入口下
 * 都是 `game.slug`，所以两条路玩同一关仍是同一份进度。
 */
export function GameCard({
  game,
  href,
}: {
  game: MapGameSummary;
  href?: string;
}): JSX.Element {
  const navigate = useNavigate();
  const to = href ?? `/play/${game.slug}`;
  const initial = game.name.trim().charAt(0) || '游';

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => navigate(to)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(to);
        }
      }}
      className={cn(
        'group cursor-pointer overflow-hidden',
        // v0.7.13：卡片本身不位移，只留封面推进这一个几何动作。两个叠在一起
        // 时指针一扫过边缘就「往上抬 + 往外胀」同时起收，读起来是「抖」。
        'transition-[box-shadow,border-color] duration-base ease-out',
        'hover:border-primary/30 hover:shadow-lifted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {/* SPEC-N04 (docs/v0.5.3.md §3): a **square** cover — the board is
          `n × n`, so the exported cover is square and a 16:10 frame only cut
          its top and bottom off. */}
      <div
        data-testid="game-cover"
        onPointerMove={followPointerWithGlow}
        className="relative isolate aspect-square w-full overflow-hidden border-b bg-muted/50"
      >
        {game.coverUrl ? (
          // v0.7.13：封面推进回来了，卡片本身仍然不位移 —— 只留一个几何动作，
          // 指针扫过边缘时不会「往上抬 + 往外胀」同时发生。
          <img
            src={game.coverUrl}
            alt={game.name}
            draggable={false}
            className="no-drag h-full w-full object-cover transition-transform duration-image ease-in-out group-hover:scale-[1.1] group-focus-visible:scale-[1.1]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary/40 transition-transform duration-image ease-in-out group-hover:scale-[1.1] group-focus-visible:scale-[1.1]">
            <span className="text-4xl font-semibold text-muted-foreground/60">{initial}</span>
          </div>
        )}
        {/* 光的三层。`aria-hidden` + `pointer-events-none`：纯装饰，既不进
            无障碍树，也不会把指针事件从卡片手里抢走。 */}
        {LIGHT_LAYERS.map((layer) => (
          <div
            key={layer}
            aria-hidden="true"
            data-testid="game-glow"
            className={cn('paper-light pointer-events-none', layer)}
          />
        ))}
      </div>
      <div className="space-y-2 p-4">
        <h3 className="truncate font-medium" title={game.name}>
          {game.name}
        </h3>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span
            className="rounded px-2 py-0.5 font-medium"
            style={{
              backgroundColor: GAME_DIFFICULTY_COLORS[game.difficulty],
              color: GAME_DIFFICULTY_TEXT_COLORS[game.difficulty],
            }}
          >
            {GAME_DIFFICULTY_LABELS[game.difficulty]}
          </span>
          <span className="tabular-nums transition-colors duration-base group-hover:text-foreground group-focus-visible:text-foreground">
            {game.gridSize} × {game.gridSize}
          </span>
        </div>
      </div>
    </Card>
  );
}
