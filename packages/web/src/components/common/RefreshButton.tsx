import { RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PANEL_ICON_BUTTON_CLASS } from '@/lib/toolbarButtons';
import { cn } from '@/lib/utils';

interface RefreshButtonProps {
  /** Re-fetch the list behind the panel. */
  onRefresh: () => void;
  /**
   * True while the query is fetching (including the first load). The icon spins
   * and the button is disabled, so a double click cannot stack requests.
   */
  refreshing?: boolean;
  /** Tooltip + accessible name, e.g. 「刷新资源」. */
  label: string;
  className?: string;
}

/**
 * v0.7.7: a panel-local refresh. The editors' left panels read two shared lists
 * (资源 / 角色) that other pages can change; before this there was no way to pull
 * the new rows without reloading the whole editor and losing the undo stack.
 *
 * A plain `<button>`, not `<Button size="icon">`: the panel headers are 40px
 * tall and every other control there is a 28px hit box, which the shared sizes
 * (`icon` = 40px) would overflow.
 *
 * v0.7.9 §5：`title` 换成统一的 Tooltip —— 同一个提示在工坊里只该有一种长相。
 */
export function RefreshButton({
  onRefresh,
  refreshing = false,
  label,
  className,
}: RefreshButtonProps): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-busy={refreshing || undefined}
          disabled={refreshing}
          onClick={onRefresh}
          className={cn(
            PANEL_ICON_BUTTON_CLASS,
            'shrink-0 disabled:pointer-events-none disabled:opacity-60',
            className,
          )}
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{refreshing ? `${label}中…` : label}</TooltipContent>
    </Tooltip>
  );
}
