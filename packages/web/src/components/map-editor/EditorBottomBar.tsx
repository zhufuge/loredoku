import {
  BoxSelect,
  Eraser,
  Grid3x3,
  Hand,
  Maximize,
  MousePointer2,
  Package,
  Redo2,
  Ruler,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Asset, AssetForm, EditorTool } from '@loredoku/shared';
import { AssetThumbnail } from '@/components/asset/AssetThumbnail';
import { Button } from '@/components/ui/button';
import { TOOLBAR_ICON_ACTIVE_CLASS, TOOLBAR_ICON_HOVER_CLASS } from '@/lib/toolbarButtons';
import { cn } from '@/lib/utils';

const TOOLS: Array<{
  id: EditorTool;
  label: string;
  hint: string;
  tip?: string;
  icon: typeof MousePointer2;
}> = [
  { id: 'select', label: '选择 / 放置', hint: 'V', icon: MousePointer2 },
  { id: 'region', label: '区域选择', hint: 'R', icon: BoxSelect, tip: '自由笔刷：按住涂抹' },
  {
    id: 'eraser',
    label: '橡皮擦',
    hint: 'E',
    tip: '按 物品 → 背景 顺序逐层清除',
    icon: Eraser,
  },
  { id: 'pan', label: '平移', hint: 'H', tip: '拖动画布平移视图', icon: Hand },
  // OPT-H11: the character-placement button (C) is gone — since CLAR-603
  // characters never enter the map, so the entry point was a dead end.
  // Participants reach the board through the left 「角色」 tab → 加入 → drag from
  // the participant area. `EditorTool` keeps the `'character'` member on purpose
  // (§17 Q8).
];

interface EditorBottomBarProps {
  activeTool: EditorTool;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  gridSize: number;
  itemsOpen: boolean;
  rulerVisible: boolean;
  /** 当前将要放置的资源（左面板选中态解析出来的 asset + form；null = 未选中）。 */
  selectedAsset: Asset | null;
  selectedForm: AssetForm | null;
  onSetTool: (tool: EditorTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  onToggleItems: () => void;
  onToggleRuler: () => void;
  onOpenResize: () => void;
  /** 点「当前资源」芯片：把左面板找回来（收起态下唯一的选中资源指示器）。 */
  onRevealItems: () => void;
}

export function EditorBottomBar({
  activeTool,
  canUndo,
  canRedo,
  zoom,
  gridSize,
  itemsOpen,
  rulerVisible,
  selectedAsset,
  selectedForm,
  onSetTool,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFit,
  onToggleItems,
  onToggleRuler,
  onOpenResize,
  onRevealItems,
}: EditorBottomBarProps): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-full border bg-background px-4 py-2 shadow-lg">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          return (
            <Button
              key={tool.id}
              variant="ghost"
              size="icon"
              className={cn(
                'h-9 w-9 rounded-full',
                active && TOOLBAR_ICON_ACTIVE_CLASS,
              )}
              title={[`${tool.label} (${tool.hint})`, tool.tip].filter(Boolean).join(' · ')}
              onClick={() => onSetTool(tool.id)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}

        <span className="mx-1 h-6 w-px bg-border" />

        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-9 gap-1 rounded-full px-3 text-xs',
            itemsOpen ? TOOLBAR_ICON_ACTIVE_CLASS : TOOLBAR_ICON_HOVER_CLASS,
          )}
          title="物品抽屉"
          onClick={onToggleItems}
        >
          <Package className="h-4 w-4" />
          物品
        </Button>

        {/*
          当前放置资源：左面板收起后这里是唯一的选中指示。**未选中时整块不渲染**
          （没有占位框、也没有「未选择资源」文案）——工具条保持干净，槽位不存在
          也就无所谓跳动。选中态用与工具按钮同一档的实心淡灰。
        */}
        {selectedAsset && selectedForm ? (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-9 max-w-[12rem] gap-1.5 overflow-hidden rounded-full px-2 text-xs',
              TOOLBAR_ICON_ACTIVE_CLASS,
            )}
            title={`当前放置：${selectedAsset.name}${
              selectedAsset.forms.length > 1 ? ` · ${selectedForm.name}` : ''
            } · ${selectedForm.widthCells}×${selectedForm.heightCells}（点击展开资源面板）`}
            onClick={onRevealItems}
          >
            <AssetThumbnail
              appearance={selectedForm}
              name={selectedAsset.name}
              className="h-6 w-6 shrink-0"
            />
            <span className="min-w-0 truncate">{selectedAsset.name}</span>
            {selectedAsset.forms.length > 1 ? (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {selectedForm.name}
              </span>
            ) : null}
          </Button>
        ) : null}

        <span className="mx-1 h-6 w-px bg-border" />

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9 rounded-full',
            rulerVisible ? TOOLBAR_ICON_ACTIVE_CLASS : TOOLBAR_ICON_HOVER_CLASS,
          )}
          title="显示 / 隐藏标尺"
          onClick={onToggleRuler}
        >
          <Ruler className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={cn('h-9 gap-1 rounded-full px-3 text-xs tabular-nums', TOOLBAR_ICON_HOVER_CLASS)}
          title="画布尺寸 n（与「基本信息」中的 n 一致）"
          onClick={onOpenResize}
        >
          <Grid3x3 className="h-4 w-4" />
          {gridSize}×{gridSize}
        </Button>

        <span className="mx-1 h-6 w-px bg-border" />

        <Button
          variant="ghost"
          size="icon"
          className={cn('h-9 w-9 rounded-full', TOOLBAR_ICON_HOVER_CLASS)}
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
            'hover:bg-slate-200/70 hover:text-foreground dark:hover:bg-slate-700/70',
          )}
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-9 w-9 rounded-full', TOOLBAR_ICON_HOVER_CLASS)}
          title="整体放大查看（不修改方格大小）"
          onClick={onZoomIn}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-9 w-9 rounded-full', TOOLBAR_ICON_HOVER_CLASS)}
          title="适应画布（重算自适应方格大小并重置查看比例）"
          onClick={onFit}
        >
          <Maximize className="h-4 w-4" />
        </Button>

        <span className="mx-1 h-6 w-px bg-border" />

        <Button
          variant="ghost"
          size="icon"
          className={cn('h-9 w-9 rounded-full', TOOLBAR_ICON_HOVER_CLASS)}
          title="撤销 (Ctrl+Z)"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-9 w-9 rounded-full', TOOLBAR_ICON_HOVER_CLASS)}
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
