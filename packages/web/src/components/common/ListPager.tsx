import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ListPagerProps {
  page: number;
  totalPages: number;
  onPage: (next: number) => void;
}

/**
 * 地图 / 谜题列表的**紧凑分页条**。 只留「当前位置」一个信息：`‹ 1 / 2 ›`，条数交回 section 标题，块的分界靠间距与标题承担。 只有一页时整条不渲染 —— 「1 / 1」是噪音。
 */
export function ListPager({ page, totalPages, onPage }: ListPagerProps): JSX.Element | null {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="上一页"
        disabled={page <= 1}
        onClick={() => onPage(Math.max(1, page - 1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="下一页"
        disabled={page >= totalPages}
        onClick={() => onPage(Math.min(totalPages, page + 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
