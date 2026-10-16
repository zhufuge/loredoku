import { Pencil, Trash2 } from 'lucide-react';
import type { DraftRegion } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RegionListProps {
  regions: DraftRegion[];
  selectedRegionId: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (region: DraftRegion) => void;
  onDelete: (region: DraftRegion) => void;
}

export function RegionList({
  regions,
  selectedRegionId,
  onSelect,
  onEdit,
  onDelete,
}: RegionListProps): JSX.Element {
  if (regions.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        暂无区域，使用「框选区域」工具在画布上拖拽创建。
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
          <span
            className="h-4 w-4 shrink-0 rounded-full border"
            style={{ backgroundColor: region.color, borderColor: region.color }}
          />
          <span className="min-w-0 flex-1 truncate">{region.name}</span>
          <span className="text-[10px] text-muted-foreground">{region.cells.length}格</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(region);
            }}
            title="编辑"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
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
