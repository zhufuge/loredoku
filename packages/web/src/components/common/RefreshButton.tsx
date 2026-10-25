import { RefreshCw } from 'lucide-react';
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
 */
export function RefreshButton({
  onRefresh,
  refreshing = false,
  label,
  className,
}: RefreshButtonProps): JSX.Element {
  return (
    <button
      type="button"
      title={refreshing ? `${label}中…` : label}
      aria-label={label}
      aria-busy={refreshing || undefined}
      disabled={refreshing}
      onClick={onRefresh}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors',
        'hover:bg-slate-200/70 hover:text-foreground dark:hover:bg-slate-700/70',
        'disabled:pointer-events-none disabled:opacity-60',
        className,
      )}
    >
      <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
    </button>
  );
}
