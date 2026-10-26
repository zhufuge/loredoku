import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ViewMode } from '@/hooks/useStoredView';

/**
 * 网格 / 列表分段控件。
 *
 * v0.7.9 §1.1（修正）：它只管**草稿块** —— 版本是冻结快照，恒为列表行。所以它从
 * 工具条下沉到「草稿」标题右侧：作用域由位置说明，不靠文案解释，也就不会再有
 * 「切了网格却还看到一列版本行」的误判。
 *
 * 两个按钮互斥、状态本身就是信息，因此不套 `IconButton` 的悬浮提示（见
 * `docs/design-system.md` §3.4 的三条例外），选中态走 `aria-pressed`。
 *
 * 外框 `h-8`：它现在长在 section 标题行里，跟着标题的 24px 行高走，
 * 不再需要为了跟搜索框对齐而撑到 40px。
 */
interface ViewToggleProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps): JSX.Element {
  return (
    <div className="flex h-8 items-center gap-0.5 rounded-md border p-0.5">
      <Button
        size="icon"
        className="h-7 w-7"
        variant={value === 'grid' ? 'secondary' : 'ghost'}
        title="网格视图"
        aria-pressed={value === 'grid'}
        onClick={() => onChange('grid')}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        className="h-7 w-7"
        variant={value === 'list' ? 'secondary' : 'ghost'}
        title="列表视图"
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
}
