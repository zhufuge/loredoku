import { Button } from '@/components/ui/button';

/** 区域格子编辑的浮动工具条：与创建区域时的 `RegionSelectionBar` 同处同一副样子；多出的两件事是点名「在编辑哪一块」和把**差量**（加几格 / 减几格）摆出来 —— 编辑是改已有区域，作者要确认的是差量不是总数。 */
interface RegionCellEditBarProps {
  regionName: string;
  total: number;
  added: number;
  removed: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RegionCellEditBar({
  regionName,
  total,
  added,
  removed,
  onCancel,
  onConfirm,
}: RegionCellEditBarProps): JSX.Element {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-4"
      data-testid="region-cell-edit-bar"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-background px-4 py-2 shadow-lifted">
        <span className="max-w-[10rem] truncate text-xs font-medium" title={regionName}>
          编辑「{regionName}」
        </span>
        <span className="mx-1 h-5 w-px bg-border" />
        <span className="text-xs text-muted-foreground">
          {added > 0 ? (
            <span className="tabular-nums text-foreground">+{added}</span>
          ) : (
            <span className="tabular-nums">+0</span>
          )}
          <span className="mx-1">/</span>
          {removed > 0 ? (
            <span className="tabular-nums text-destructive">−{removed}</span>
          ) : (
            <span className="tabular-nums">−0</span>
          )}
          <span className="mx-1">·</span>共 <span className="tabular-nums">{total}</span> 格
        </span>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={onCancel}
        >
          取消
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={onConfirm}
        >
          保存格子
        </Button>
      </div>
    </div>
  );
}
