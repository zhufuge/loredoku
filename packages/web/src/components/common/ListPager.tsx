import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ListPagerProps {
  page: number;
  totalPages: number;
  onPage: (next: number) => void;
}

/**
 * v0.7.9：地图 / 谜题列表的**紧凑分页条**。
 *
 * 之前每个块各印一行「第 1 / 2 页 · 共 30 个」+ 两个描边按钮，一页上出现两行，
 * 且条数在 section 标题里已经写过一次。现在只留「当前位置」一个信息：
 * `‹ 1 / 2 ›`，条数交回标题，块的分界靠 `space-y-8` 与标题承担。
 *
 * 只有一页时整条不渲染 —— 「1 / 1」是噪音。
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
