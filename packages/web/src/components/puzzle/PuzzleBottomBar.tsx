import { Grid3x3, Maximize, Redo2, Ruler, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PuzzleBottomBarProps {
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  gridSize: number;
  rulerVisible: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  onToggleRuler: () => void;
}

/**
 * SPEC-K07 (docs/v0.5.0.md §4.4): the puzzle's bottom bar.
 *
 * The canvas is a **read-only reference** (§5.1), so every tool that would
 * write to it is gone: 选择 / 放置, 区域选择 (and its 矩形 / 自由笔刷 shapes),
 * 橡皮擦 and the 物品 drawer button. The page therefore never switches
 * `activeTool` away from `select`, which is also what keeps the read-only cell
 * info box reachable (§15 Q1).
 *
 * 尺寸 n×n stays but is **display only** — a `<span>`, no click, no hover state,
 * and no 「调整画布尺寸」 dialog anywhere on this screen: the size comes from the
 * referenced map version and cannot be changed here.
 */
export function PuzzleBottomBar({
  canUndo,
  canRedo,
  zoom,
  gridSize,
  rulerVisible,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFit,
  onToggleRuler,
}: PuzzleBottomBarProps): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-full border bg-white px-4 py-2 shadow-lg">
        <Button
          variant={rulerVisible ? 'secondary' : 'ghost'}
          size="icon"
          className="h-9 w-9 rounded-full"
          title="显示 / 隐藏标尺"
          onClick={onToggleRuler}
        >
          <Ruler className="h-4 w-4" />
        </Button>

        {/* SPEC-K07: 纯展示 —— 无 onClick、无 hover 态。 */}
        <span
          data-testid="puzzle-canvas-size"
          className="flex h-9 items-center gap-1 rounded-full px-3 text-xs tabular-nums text-muted-foreground"
          title="画布尺寸由所选地图版本决定，不可修改"
        >
          <Grid3x3 className="h-4 w-4" />
          {gridSize}×{gridSize}
        </span>

        <span className="mx-1 h-6 w-px bg-border" />

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          title="整体缩小查看（不修改方格大小）"
          onClick={onZoomOut}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={onZoomReset}
          title="重置查看比例为 100%（不修改方格大小）"
          className={cn(
            'h-9 min-w-[3.5rem] rounded-full px-2 text-xs tabular-nums text-muted-foreground',
            'hover:bg-accent hover:text-foreground',
          )}
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          title="整体放大查看（不修改方格大小）"
          onClick={onZoomIn}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          title="适应画布（重算自适应方格大小并重置查看比例）"
          onClick={onFit}
        >
          <Maximize className="h-4 w-4" />
        </Button>

        <span className="mx-1 h-6 w-px bg-border" />

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          title="撤销 (Ctrl+Z)"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          title="重做 (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
