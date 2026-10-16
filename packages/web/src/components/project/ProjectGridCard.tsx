import { Copy, Eye, Pencil, Puzzle, RotateCcw, Trash2 } from 'lucide-react';
import type { MapEntrySummary } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/lib/relativeTime';

/**
 * FEAT-K09 (docs/v0.5.0.md §7.1): the map list shows the **union of entries**,
 * so one card renders either kind:
 *
 * - a **work entry** (`kind: 'draft'`) — the editable row, badge 「草稿」 (or
 *   `已发布 v{n}` once the lineage has a version), with the editing actions;
 * - a **version entry** (`kind: 'version'`) — an immutable published snapshot,
 *   badge `v{n}`, with the read-only actions only (查看效果 / 新建谜题 /
 *   编辑此版本 / 删除). It is **not** renamable and has no cover editor
 *   (SPEC-K11: a version is never edited in place).
 *
 * The cover is still the card's head — square since v0.5.3 SPEC-N04 — and
 * clicking it opens the editor
 * — for a version entry that button is 「编辑此版本」 instead, which forks a new
 * work entry (§7.3).
 */
interface ProjectGridCardProps {
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

export function ProjectGridCard({
  entry,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onPreview,
  onNewPuzzle,
  onEditVersion,
}: ProjectGridCardProps): JSX.Element {
  const initial = entry.name.trim().charAt(0) || '图';
  const isVersion = entry.kind === 'version';

  const badge = isVersion
    ? `v${entry.versionNo ?? ''}`
    : entry.currentVersionNo !== null
      ? `已发布 v${entry.currentVersionNo}`
      : '草稿';

  return (
    <Card className="flex flex-col overflow-hidden transition-colors hover:border-primary">
      <button
        type="button"
        onClick={() => (isVersion ? onEditVersion?.(entry) : onOpen(entry))}
        // SPEC-N04 (docs/v0.5.3.md §3): square, like the game card's — the
        // board is `n × n`, so a square frame is the only one that shows the
        // whole cover.
        className="relative block aspect-square w-full cursor-pointer overflow-hidden border-b bg-muted/40"
        title={isVersion ? '编辑此版本（将新增一个条目）' : entry.name}
      >
        {entry.coverUrl ? (
          <img
            src={entry.coverUrl}
            alt={entry.name}
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-secondary/40 text-4xl font-semibold text-muted-foreground/60">
            {initial}
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex-1 space-y-1">
          <h3 className="flex items-center gap-1.5 truncate font-medium" title={entry.name}>
            <span className="truncate">{entry.name}</span>
            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
              {badge}
            </span>
          </h3>
          {entry.description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{entry.description}</p>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="tabular-nums">
            {entry.gridSize} × {entry.gridSize}
          </span>
          <span className="px-1">·</span>
          {isVersion ? (
            <>
              {/* §7.1 第 2 条：版本条目副信息补血缘版本总数。 */}
              该地图共 {entry.versionCount} 个版本
              <span className="px-1">·</span>
              <span title={formatDateTime(entry.publishedAt ?? entry.updatedAt)}>
                发布于 {formatDateTime(entry.publishedAt ?? entry.updatedAt)}
              </span>
            </>
          ) : (
            <>
              {entry.currentVersionNo !== null ? (
                <>
                  <span className="tabular-nums">地图 v{entry.currentVersionNo}</span>
                  <span className="px-1">·</span>
                </>
              ) : null}
              <span title={formatDateTime(entry.updatedAt)}>
                {formatRelativeTime(entry.updatedAt)}更新
              </span>
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {isVersion ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => onPreview?.(entry)}>
                <Eye className="mr-1 h-3.5 w-3.5" />
                查看效果
              </Button>
              <Button size="sm" variant="outline" onClick={() => onNewPuzzle?.(entry)}>
                <Puzzle className="mr-1 h-3.5 w-3.5" />
                新建谜题
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="编辑此版本（将新增一个条目）"
                className="ml-auto"
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
              <Button size="sm" variant="secondary" onClick={() => onOpen(entry)}>
                编辑
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="编辑信息"
                className="ml-auto"
                onClick={() => onRename(entry)}
              >
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
    </Card>
  );
}
