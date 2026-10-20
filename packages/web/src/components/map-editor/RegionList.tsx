import { Trash2 } from 'lucide-react';
import type { DraftRegion } from '@loredoku/shared';
import { Button } from '@/components/ui/button';

/**
 * v0.7.0: 编辑入口删了 —— 点条目即在右边信息框里改（与点画布上的区域标签
 * 同一个面板），这里只留选择与删除。
 */
interface RegionListProps {
  regions: DraftRegion[];
  selectedRegionId: string | null;
  onSelect: (id: string | null) => void;
  onDelete: (region: DraftRegion) => void;
}

export function RegionList({
  regions,
  selectedRegionId,
  onSelect,
  onDelete,
}: RegionListProps): JSX.Element {
  if (regions.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        暂无区域，用「区域」工具在画布上涂抹创建。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {regions.map((region) => (
        <div
          key={region.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(region.id === selectedRegionId ? null : region.id)}
          onKeyDown={(event) => event.key === 'Enter' && onSelect(region.id)}
          className={
            'group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors ' +
            (region.id === selectedRegionId
              ? 'border-primary bg-accent'
              : 'border-transparent hover:bg-accent')
          }
        >
          <span className="min-w-0 flex-1 truncate">{region.name}</span>
          <span className="text-[10px] text-muted-foreground">{region.cells.length}格</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive opacity-0 hover:text-destructive group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(region);
            }}
            title="删除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
