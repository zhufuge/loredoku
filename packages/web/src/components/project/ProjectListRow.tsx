import { Copy, Eye, Pencil, Puzzle, RotateCcw, Trash2 } from 'lucide-react';
import type { MapEntrySummary } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';

/**
 * OPT-H04 §4.2c (docs/v0.4.2.md §4): the list view keeps the absolute time (a
 * table wants exact values, not 「3 天前」) but gains the same cover thumbnail,
 * and drops the 「卡片 N」/「区域 N」 columns the card also lost.
 *
 * v0.5.0 FEAT-K09 §7.1: a row is either a **work entry** or a **version
 * entry** of the same blood lineage, so the badge and the actions follow
 * `entry.kind` — see {@link ProjectGridCard} for the full rationale.
 *
 * Column order: 封面 → 名称（含徽标）→ n × n → 描述 → 时间 → 操作.
 */
interface ProjectListRowProps {
  entry: MapEntrySummary;
  onOpen: (entry: MapEntrySummary) => void;
  onRename: (entry: MapEntrySummary) => void;
  onDuplicate: (entry: MapEntrySummary) => void;
  onDelete: (entry: MapEntrySummary) => void;
  /** Version entries only: read-only canvas preview. */
  onPreview?: (entry: MapEntrySummary) => void;
  /** Version entries only: create a puzzle on this version (§2.4). */
  onNewPuzzle?: (entry: MapEntrySummary) => void;
  /** Version entries only: fork a new work entry from this version (§7.3). */
  onEditVersion?: (entry: MapEntrySummary) => void;
}

export function ProjectListRow({
  entry,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onPreview,
  onNewPuzzle,
  onEditVersion,
}: ProjectListRowProps): JSX.Element {
  const initial = entry.name.trim().charAt(0) || '图';
  const isVersion = entry.kind === 'version';

  const badge = isVersion
    ? `v${entry.versionNo ?? ''}`
    : entry.currentVersionNo !== null
      ? `已发布 v${entry.currentVersionNo}`
      : '草稿';

  return (
    <div className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => (isVersion ? onEditVersion?.(entry) : onOpen(entry))}
        title={isVersion ? '编辑此版本（将新增一个条目）' : entry.name}
        className="h-10 w-16 shrink-0 cursor-pointer overflow-hidden rounded border bg-muted/40"
      >
        {entry.coverUrl ? (
          <img
            src={entry.coverUrl}
            alt={entry.name}
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-secondary/40 text-sm font-semibold text-muted-foreground/60">
            {initial}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => (isVersion ? onEditVersion?.(entry) : onOpen(entry))}
        className="w-48 shrink-0 truncate text-left font-medium hover:underline"
      >
        <span className="truncate">{entry.name}</span>
        <span className="ml-1.5 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-normal text-secondary-foreground">
          {badge}
        </span>
      </button>
      <span className="w-20 shrink-0 tabular-nums text-sm text-muted-foreground">
        {entry.gridSize} × {entry.gridSize}
      </span>
      <span className="flex-1 truncate text-sm text-muted-foreground">
        {entry.description ?? ''}
      </span>
      <span className="w-52 shrink-0 truncate text-right text-xs text-muted-foreground">
        {isVersion ? (
          <>该地图共 {entry.versionCount} 个版本 · 发布于 {formatDateTime(entry.publishedAt ?? entry.updatedAt)}</>
        ) : (
          formatDateTime(entry.updatedAt)
        )}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {isVersion ? (
          <>
            <Button size="sm" variant="secondary" className="h-8" onClick={() => onPreview?.(entry)}>
              <Eye className="mr-1 h-3.5 w-3.5" />
              查看效果
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => onNewPuzzle?.(entry)}>
              <Puzzle className="mr-1 h-3.5 w-3.5" />
              新建谜题
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title="编辑此版本（将新增一个条目）"
              onClick={() => onEditVersion?.(entry)}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title="删除该版本"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(entry)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button size="icon" variant="ghost" title="编辑信息" onClick={() => onRename(entry)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" title="复制" onClick={() => onDuplicate(entry)}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title="删除"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(entry)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
