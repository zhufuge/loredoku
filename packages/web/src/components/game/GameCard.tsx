import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import type { MapGameSummary, ThemeDifficultyTier } from '@loredoku/shared';
import { Card } from '@/components/ui/card';
import { DifficultyBadge } from '@/components/game/DifficultyBadge';
import { CompletionOverlay, CompletionTime } from '@/components/game/GameCompletionMark';
import type { GameCompletion } from '@/lib/gameCompletion';
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
/**
 * v0.9.0 §6：卡片真正读到的就这五个字段。
 *
 * 播放器（`/loredoku/:code/play`）的关卡清单来自包里的 `manifest.games`，
 * 它没有 `MapGameSummary` 里那些 id / 时间戳 —— 而卡片本来也没用过它们。
 * 收窄成 `Pick` 之后两条路共用同一张卡，`MapGameSummary` 结构上天然兼容，
 * 线上那边的调用一行都不用改。
 */
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
  /**
   * v0.8.6 §3.6：这一关所属主题的分级。播放页在工作空间外面，`DifficultyBadge`
   * 自己读不到主题 —— 由页面查好传下来。不传就还是老行为（工作空间 / 内置五档）。
   */
  tiers?: readonly ThemeDifficultyTier[];
  /**
   * v0.9.5：这一关的通过记录（`lib/gameCompletion.ts`）。有值时封面盖一层印、
   * 页脚写出完成用时。
   *
   * 由**页面**读好传进来，不在卡片里自己读 localStorage：卡片是纯展示，
   * 而「哪些关通过了」是列表页要一次算清的一件事（它还顺手决定定案卡的
   * 「下一关」跳哪儿）。两个列表页（`/play`、播放器的 `/:code/play`）都已经
   * 握着 `gridSize`，指纹那一半也不必再问卡片要。
   */
  completion?: GameCompletion | null;
  /**
   * v0.9.6：**最后离开时间**（ISO）—— 没有完成记录时那一格显示它。
   *
   * 与 completion 分开传：它们是两份不同的记录（完成是既成事实、离开是上次
   * 玩到几点），合并成一个「时间」字段会让「有完成记录时该不该继续更新它」
   * 变成一道选择题。
   */
  lastLeftAt?: string | null;
  /** v0.9.6：最后离开时的计时读数（毫秒）—— 卡片那一格显示的是它。 */
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
        /* v0.9.7：已结案的卡片不演鼠标光源 —— 那一层是「挑关卡时找手感」的，
           定案卡是既成事实，指针扫过去不该再亮一下。 */
        onPointerMove={completed ? undefined : followPointerWithGlow}
        className="relative isolate aspect-square w-full overflow-hidden border-b bg-muted/50"
      >
        {game.coverUrl ? (
          // v0.7.13：封面推进回来了，卡片本身仍然不位移 —— 只留一个几何动作，
          // 指针扫过边缘时不会「往上抬 + 往外胀」同时发生。
          <img
            src={game.coverUrl}
            alt={game.name}
            draggable={false}
            /*
             * v0.9.8：定案卡也演 hover 放大 —— 与封面光源不同，几何推进是
             * 「这张卡可点」的通用手感，结案卡仍能点进去看成绩，不该独缺这一下。
             */
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
        {/* 光的三层。`aria-hidden` + `pointer-events-none`：纯装饰，既不进
            无障碍树，也不会把指针事件从卡片手里抢走。
            v0.9.7：定案卡整组不画 —— 盖着「定案 + 印」的封面上再浮一层光斑，
            两件装饰抢同一块地方，也让「结案」读起来像还能再玩一次。 */}
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
        {/*
          v0.9.5：结案的那一层。放在封面里、光的三层之后 —— 它压的是**封面本身**
          （含那层纸光），而不是压住整张卡片：标题与页脚仍要读得清，玩家在挑关卡时
          还得看得见这一关叫什么、多难。
        */}
        {completed ? <CompletionOverlay completion={completed} /> : null}
      </div>
      <div className="space-y-2 p-3 sm:p-4">
        <h3 className="truncate font-medium" title={game.name}>
          {game.name}
        </h3>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {/*
            v0.9.6：页脚按用户给的版式重排 ——
            左边「n × n」+ 难度，右边【时间图标】+ 时间。
            时间取「完成优先，否则最后离开」，见 `CompletionTime`。
          */}
          <span className="flex items-baseline gap-2">
            <span className="tabular-nums transition-colors duration-base group-hover:text-foreground group-focus-visible:text-foreground">
              {game.gridSize} × {game.gridSize}
            </span>
            <DifficultyBadge difficulty={game.difficulty} tiers={tiers} className="rounded" />
          </span>
          {/*
            v0.9.7：**时间格分两种** ——
            - 已完成：时钟图标 + 完成用时（图标说的是「这是一份成绩」）；
            - 只玩过、没完成：只写「3 分钟前」这样的相对时间，**不画图标**。
              相对时间本身就说清了「什么时候」，再挂一枚时钟会把它读成一份
              计时读数；图标在这里反而是噪音。
            - 没玩过：整格不出现。
          */}
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
