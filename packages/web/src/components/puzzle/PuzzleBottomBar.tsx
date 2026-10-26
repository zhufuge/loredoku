import { Grid3x3, Maximize, Redo2, Ruler, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { TOOLBAR_ICON_ACTIVE_CLASS, TOOLBAR_ICON_HOVER_CLASS } from '@/lib/toolbarButtons';
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
      <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-full border bg-background px-4 py-2 shadow-lifted">
        <IconButton
          variant="ghost"
          icon={<Ruler className="h-4 w-4" />}
          label="显示 / 隐藏标尺"
          side="top"
          className={cn(
            'h-9 w-9 rounded-full',
            rulerVisible ? TOOLBAR_ICON_ACTIVE_CLASS : TOOLBAR_ICON_HOVER_CLASS,
          )}
          onClick={onToggleRuler}
        />

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

        <IconButton
          variant="ghost"
          icon={<ZoomOut className="h-4 w-4" />}
          label="缩小查看"
          shortcut="不改方格大小"
          side="top"
          className={cn('h-9 w-9 rounded-full', TOOLBAR_ICON_HOVER_CLASS)}
          onClick={onZoomOut}
        />
        <button
          type="button"
          onClick={onZoomReset}
          title="重置查看比例为 100%（不修改方格大小）"
          className={cn(
            'h-9 min-w-[3.5rem] rounded-full px-2 text-xs tabular-nums text-muted-foreground',
            TOOLBAR_ICON_HOVER_CLASS,
            'hover:text-foreground',
          )}
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton
          variant="ghost"
          icon={<ZoomIn className="h-4 w-4" />}
          label="放大查看"
          shortcut="不改方格大小"
          side="top"
          className={cn('h-9 w-9 rounded-full', TOOLBAR_ICON_HOVER_CLASS)}
          onClick={onZoomIn}
        />
        <IconButton
          variant="ghost"
          icon={<Maximize className="h-4 w-4" />}
          label="适应画布"
          shortcut="重算方格大小"
          side="top"
          className={cn('h-9 w-9 rounded-full', TOOLBAR_ICON_HOVER_CLASS)}
          onClick={onFit}
        />

        <span className="mx-1 h-6 w-px bg-border" />

        <IconButton
          variant="ghost"
          icon={<Undo2 className="h-4 w-4" />}
          label="撤销"
          shortcut="Ctrl+Z"
          side="top"
          className={cn('h-9 w-9 rounded-full', TOOLBAR_ICON_HOVER_CLASS)}
          disabled={!canUndo}
          onClick={onUndo}
        />
        <IconButton
          variant="ghost"
          icon={<Redo2 className="h-4 w-4" />}
          label="重做"
          shortcut="Ctrl+Shift+Z"
          side="top"
          className={cn('h-9 w-9 rounded-full', TOOLBAR_ICON_HOVER_CLASS)}
          disabled={!canRedo}
          onClick={onRedo}
        />
      </div>
    </div>
  );
}
