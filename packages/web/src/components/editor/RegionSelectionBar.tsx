import { Button } from '@/components/ui/button';

interface RegionSelectionBarProps {
  count: number;
  anchored?: boolean;
  onClear: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RegionSelectionBar({
  count,
  anchored = false,
  onClear,
  onConfirm,
  onCancel,
}: RegionSelectionBarProps): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-white px-4 py-2 shadow-lg">
        <span className="text-xs font-medium text-muted-foreground">
          {anchored ? (
            <span>已选起点，请点击对角格或拖拽框选</span>
          ) : (
            <>
              已选 <span className="tabular-nums text-foreground">{count}</span> 格
            </>
          )}
        </span>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={onClear}
          disabled={count === 0}
        >
          清空
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={onConfirm}
        >
          确定创建
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={onCancel}
        >
          取消
        </Button>
      </div>
    </div>
  );
}
