import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import type { MapGameSummary, ThemeDifficultyTier } from '@loredoku/shared';
import { Card } from '@/components/ui/card';
import { DifficultyBadge } from '@/components/game/DifficultyBadge';
import { CompletionOverlay, CompletionTime } from '@/components/game/GameCompletionMark';
import type { GameCompletion } from '@/lib/gameCompletion';
import { cn } from '@/lib/utils';

/** FEAT-G01（docs/v0.4.0.md §4）：一张已部署游戏卡 —— 封面、名称、难度徽章、`n×n`，整卡是一个按钮（误点任意处都能开始）；OPT-W04（docs/v0.4.1.md §4.7）起卡链接到游戏的 access path。 */

/** 纸背光（v0.7.10 §10）：指针在封面内的坐标写进两个 CSS 变量，光斑位置全由 CSS 读；不走 state（整段悬停 React 一次都不渲染），每次移动重读 rect（读前没有写样式，不触发重排；缓存的失效边界更贵）。v0.7.13 §10.11：半径 = 指针到最远那个角的距离 + 羽化 + 2，两个数必须一致，否则边界会在静止时切进封面。 */
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

/** 两层光（v0.7.10 §10）：一个元素只能有一个 `mix-blend-mode` —— 暗角 `multiply` 必须压在最底下（压在热斑 `normal` 上会把热斑弄脏），数组顺序即叠放顺序。 */
const LIGHT_LAYERS = ['paper-shade', 'paper-core'] as const;

/** v0.8.0（docs/v0.8.0.md §16.6）：`href` 让同一张卡也能指向主题里的那一关（`/play/theme/:slug/:key`）；两个入口的存档键都是 `game.slug`，玩同一关是同一份进度。 */
/** v0.9.0 §6：卡片真正读到的就这五个字段 —— 播放器的关卡清单来自 `manifest.games`，没有 `MapGameSummary` 的 id / 时间戳（卡片本来也没用过），收窄成 `Pick` 后两条路共用同一张卡。 */
export type GameCardData = Pick<
  MapGameSummary,
  'slug' | 'name' | 'coverUrl' | 'difficulty' | 'gridSize'
>;

export function GameCard({
  game,
  href,
  tiers,
  completion,
  lastLeftAt,
  lastLeftElapsedMs,
}: {
  game: GameCardData;
  href?: string;
  /** v0.8.6 §3.6：这一关所属主题的分级。播放页在工作空间外面，`DifficultyBadge` 自己读不到主题 —— 由页面查好传下来；不传仍是老行为（工作空间 / 内置五档）。 */
  tiers?: readonly ThemeDifficultyTier[];
  /** 这一关的通过记录（`lib/gameCompletion.ts`）：有值时封面盖印、页脚写完成用时。由**页面**读好传进来 —— 卡片是纯展示，「哪些关通过了」是列表页要一次算清的事。 */
  completion?: GameCompletion | null;
  /** **最后离开时间**（ISO）：没有完成记录时那一格显示它。与 completion 分开传 —— 完成是既成事实、离开是上次玩到几点，合并会让「有完成时该不该继续更新」变成选择题。 */
  lastLeftAt?: string | null;
  /** 最后离开时的计时读数（毫秒）—— 卡片那一格显示的是它。 */
  lastLeftElapsedMs?: number | null;
}): JSX.Element {
  const navigate = useNavigate();
  const to = href ?? `/play/${game.slug}`;
  const initial = game.name.trim().charAt(0) || '游';
  const completed = completion ?? null;

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
        // 卡片本身不位移，只留封面推进这一个几何动作。两个叠在一起
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
        /* 已结案的卡片不演鼠标光源 —— 那一层是「挑关卡时找手感」的，
           定案卡是既成事实，指针扫过去不该再亮一下。 */
        onPointerMove={completed ? undefined : followPointerWithGlow}
        className="relative isolate aspect-square w-full overflow-hidden border-b bg-muted/50"
      >
        {game.coverUrl ? (
          // 封面推进，卡片本身不位移 —— 只留一个几何动作，
          // 指针扫过边缘时不会「往上抬 + 往外胀」同时发生。
          <img
            src={game.coverUrl}
            alt={game.name}
            draggable={false}
            /* 定案卡也演 hover 放大 —— 几何推进是「这张卡可点」的通用手感，结案卡仍能点进去看成绩，不该独缺这一下。 */
            className={cn(
              'no-drag h-full w-full object-cover transition-transform duration-image ease-in-out',
              'group-hover:scale-[1.1] group-focus-visible:scale-[1.1]',
            )}
          />
        ) : (
          <div
            className={cn(
              'flex h-full w-full items-center justify-center bg-secondary/40 transition-transform duration-image ease-in-out',
              'group-hover:scale-[1.1] group-focus-visible:scale-[1.1]',
            )}
          >
            <span className="text-3xl font-semibold text-muted-foreground/60 sm:text-4xl">{initial}</span>
          </div>
        )}
        {/* 纯装饰：`aria-hidden` + `pointer-events-none`，不进无障碍树、也不抢指针；定案卡整组不画 —— 盖着「定案 + 印」的封面上再浮光斑，两件装饰抢同一块地方。 */}
        {completed
          ? null
          : LIGHT_LAYERS.map((layer) => (
              <div
                key={layer}
                aria-hidden="true"
                data-testid="game-glow"
                className={cn('paper-light pointer-events-none', layer)}
              />
            ))}
        {/* 结案那层放在封面里、光的三层之后：它压的是**封面本身**（含纸光），不是压整张卡片 —— 标题与页脚仍要读得清。 */}
        {completed ? <CompletionOverlay completion={completed} /> : null}
      </div>
      <div className="space-y-2 p-3 sm:p-4">
        {/* 定案卡标题降一档颜色：结论已经写在封面上，和没做过的卡一样黑会读成「还能再挑一次」；名字仍要看得清，只退到 muted。 */}
        <h3
          className={cn('truncate font-medium', completed ? 'text-muted-foreground' : undefined)}
          title={game.name}
        >
          {game.name}
        </h3>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {/* 页脚：左「n × n」+ 难度，右时间图标 + 时间（完成优先，否则取最后离开，见 `CompletionTime`）。 */}
          <span className="flex items-baseline gap-2">
            <span className="tabular-nums transition-colors duration-base group-hover:text-foreground group-focus-visible:text-foreground">
              {game.gridSize} × {game.gridSize}
            </span>
            <DifficultyBadge difficulty={game.difficulty} tiers={tiers} className="rounded" />
          </span>
          {/* 时间格分两种：已完成 = 时钟图标 + 完成用时（图标说「这是一份成绩」）；只玩过 = 只写「3 分钟前」，**不画图标**（会读成计时读数）；没玩过 = 整格不出现。 */}
          {completed || lastLeftAt ? (
            <span className="flex items-center gap-1">
              {completed ? <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              <CompletionTime
                completion={completed}
                lastLeftAt={lastLeftAt ?? null}
                lastLeftElapsedMs={lastLeftElapsedMs ?? null}
                className="transition-colors duration-base group-hover:text-foreground group-focus-visible:text-foreground"
              />
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
