import {
  BoxSelect,
  Eraser,
  Grid3x3,
  Hand,
  Maximize,
  MousePointer2,
  Paintbrush,
  Package,
  Redo2,
  Ruler,
  Square,
  Undo2,
  User,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { EditorTool, RegionShape } from '@murdoku/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TOOLS: Array<{ id: EditorTool; label: string; hint: string; icon: typeof MousePointer2 }> = [
  { id: 'select', label: '选择 / 放置', hint: 'V', icon: MousePointer2 },
  { id: 'region', label: '区域选择', hint: 'R', icon: BoxSelect },
  { id: 'character', label: '放置角色', hint: 'C', icon: User },
  { id: 'eraser', label: '橡皮擦', hint: 'E', icon: Eraser },
  { id: 'pan', label: '平移画布', hint: 'Space', icon: Hand },
];

const SHAPES: Array<{ id: RegionShape; label: string; icon: typeof Square }> = [
  { id: 'rect', label: '矩形', icon: Square },
  { id: 'brush', label: '自由笔刷', icon: Paintbrush },
];

interface EditorBottomBarProps {
  activeTool: EditorTool;
  regionShape: RegionShape;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  gridSize: number;
  itemsOpen: boolean;
  rulerVisible: boolean;
  onSetTool: (tool: EditorTool) => void;
  onSetRegionShape: (shape: RegionShape) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  onToggleItems: () => void;
  onToggleRuler: () => void;
  onOpenResize: () => void;
}

export function EditorBottomBar({
  activeTool,
  regionShape,
  canUndo,
  canRedo,
  zoom,
  gridSize,
  itemsOpen,
  rulerVisible,
  onSetTool,
  onSetRegionShape,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFit,
  onToggleItems,
  onToggleRuler,
  onOpenResize,
}: EditorBottomBarProps): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-full border bg-white px-4 py-2 shadow-lg">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Button
              key={tool.id}
              variant={activeTool === tool.id ? 'secondary' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-full"
              title={`${tool.label} (${tool.hint})`}
              onClick={() => onSetTool(tool.id)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}

        {activeTool === 'region' ? (
          <>
            <span className="mx-1 h-6 w-px bg-border" />
            {SHAPES.map((shape) => {
              const Icon = shape.icon;
              return (
                <Button
                  key={shape.id}
                  variant={regionShape === shape.id ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  title={shape.label}
                  onClick={() => onSetRegionShape(shape.id)}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              );
            })}
          </>
        ) : null}

        <span className="mx-1 h-6 w-px bg-border" />

        <Button
          variant={itemsOpen ? 'secondary' : 'ghost'}
          size="sm"
          className="h-9 gap-1 rounded-full px-3 text-xs"
          title="物品抽屉"
          onClick={onToggleItems}
        >
          <Package className="h-4 w-4" />
          物品
        </Button>

        <span className="mx-1 h-6 w-px bg-border" />

        <Button
          variant={rulerVisible ? 'secondary' : 'ghost'}
          size="icon"
          className="h-9 w-9 rounded-full"
          title="显示 / 隐藏标尺"
          onClick={onToggleRuler}
        >
          <Ruler className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1 rounded-full px-3 text-xs tabular-nums"
          title="画布尺寸"
          onClick={onOpenResize}
        >
          <Grid3x3 className="h-4 w-4" />
          {gridSize}×{gridSize}
        </Button>

        <span className="mx-1 h-6 w-px bg-border" />

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          title="缩小"
          onClick={onZoomOut}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={onZoomReset}
          title="重置为 100%"
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
          title="放大"
          onClick={onZoomIn}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          title="适配画布"
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
