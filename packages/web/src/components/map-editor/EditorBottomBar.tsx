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
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Asset, AssetVariant, EditorTool } from '@loredoku/shared';
import { AssetThumbnail } from '@/components/asset/AssetThumbnail';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
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
  /** 当前将要放置的资源（左面板选中态解析出来的 asset + variant；null = 未选中）。 */
  selectedAsset: Asset | null;
  selectedVariant: AssetVariant | null;
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
  /**
   * v0.7.7: 芯片右侧的 ×，取消当前选中资源 —— 不用再去左面板里点同一张瓦片，
   * 也不用把面板展开（面板收起时本来也点不到）。
   */
  onClearSelection: () => void;
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
  selectedVariant,
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
  onClearSelection,
}: EditorBottomBarProps): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-full border bg-background px-4 py-2 shadow-lifted">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          return (
            <IconButton
              key={tool.id}
              variant="ghost"
              icon={<Icon className="h-4 w-4" />}
              label={[tool.label, tool.tip].filter(Boolean).join(' · ')}
              shortcut={tool.hint}
              side="top"
              className={cn('h-9 w-9 rounded-full', active && TOOLBAR_ICON_ACTIVE_CLASS)}
              onClick={() => onSetTool(tool.id)}
            />
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

          v0.7.7: 芯片拆成两段可点区 —— 左边（缩略图 + 名字）展开资源面板，
          右边的 × 取消选中。拆开而不是整块加 × 是因为面板收起时点不到瓦片，
          没有 × 就只能靠快捷键猜。
        */}
        {selectedAsset && selectedVariant ? (
          <div
            className={cn(
              'flex h-9 max-w-[13rem] items-center overflow-hidden rounded-full text-xs',
              TOOLBAR_ICON_ACTIVE_CLASS,
            )}
          >
            <button
              type="button"
              className="flex h-9 min-w-0 items-center gap-1.5 pl-2 pr-1 text-left"
              title={`当前放置：${selectedAsset.name}${
                selectedAsset.variants.length > 1 ? ` · ${selectedVariant.name}` : ''
              }（点击展开资源面板）`}
              onClick={onRevealItems}
            >
              <AssetThumbnail
                appearance={selectedVariant}
                name={selectedAsset.name}
                className="h-6 w-6 shrink-0"
              />
              <span className="min-w-0 truncate">{selectedAsset.name}</span>
              {selectedAsset.variants.length > 1 ? (
                <span className="shrink-0 text-2xs text-muted-foreground">
                  {selectedVariant.name}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              title="取消选中资源"
              aria-label="取消选中资源"
              onClick={onClearSelection}
              className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-toolbar-hover hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <span className="mx-1 h-6 w-px bg-border" />

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
