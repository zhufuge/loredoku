import { Copy, Eye, Pencil, Rocket, Trash2 } from 'lucide-react';
import type { PuzzleEntrySummary } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { entryPreviewable, entryPreviewTitle } from '@/components/common/EntryActionsMenu';
import { formatDateTime } from '@/lib/format';

/**
 * 谜题列表行：缩略图 + 名称（+ 已部署徽标）+（版本号）+ 尺寸 + 底图 + 描述 +
 * 时间 + 操作。列序与 `MapListRow` 一致，只多一列「底图」（谜题的画布是创建时
 * 复制来的，作者需要看到它来自哪张图的哪个版本）。
 *
 * 版本列只在版本条目上出现；草稿块里条条都是草稿，`v{n}` 不该重复。
 *
 * 操作：编辑信息 / 预览 / 复制 / 部署 / 删除。**编辑信息与复制只给草稿行**，
 * 「部署」只给版本行（草稿永远不满足「已发布」）。
 */
interface PuzzleListRowProps {
  entry: PuzzleEntrySummary;
  onOpen: (entry: PuzzleEntrySummary) => void;
  onRename: (entry: PuzzleEntrySummary) => void;
  onDuplicate: (entry: PuzzleEntrySummary) => void;
  onDelete: (entry: PuzzleEntrySummary) => void;
  onPreview: (entry: PuzzleEntrySummary) => void;
  onDeploy: (entry: PuzzleEntrySummary) => void;
}

export function PuzzleListRow({
  entry,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onPreview,
  onDeploy,
}: PuzzleListRowProps): JSX.Element {
  const initial = entry.name.trim().charAt(0) || '谜';
  const previewable = entryPreviewable(entry);
  const isVersion = entry.kind === 'version';
  const openTitle = isVersion ? '编辑此版本' : '进入编辑';

  return (
    <div className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        title={`${openTitle}：${entry.name}`}
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
        onClick={() => onOpen(entry)}
        className="flex w-48 shrink-0 items-center gap-1.5 text-left font-medium hover:underline"
        title={entry.name}
      >
        <span className="truncate">{entry.name}</span>
        {entry.deployed ? (
          <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
            已部署
          </span>
        ) : null}
      </button>
      {entry.versionNo !== null ? (
        <span className="w-14 shrink-0 tabular-nums text-sm text-muted-foreground">
          v{entry.versionNo}
        </span>
      ) : null}
      <span className="w-16 shrink-0 tabular-nums text-sm text-muted-foreground">
        {`${entry.gridSize} × ${entry.gridSize}`}
      </span>
      {/* 底图来源：创建时复制的那份地图版本，之后与地图再无联动。 */}
      <span className="w-40 shrink-0 truncate text-xs text-muted-foreground" title={entry.mapName}>
        {entry.mapName ? `${entry.mapName} v${entry.mapVersionNo}` : '—'}
      </span>
      <span className="flex-1 truncate text-sm text-muted-foreground">
        {entry.description ?? ''}
      </span>
      <span className="w-52 shrink-0 truncate text-right text-xs text-muted-foreground">
        {formatDateTime(entry.publishedAt ?? entry.updatedAt)}
      </span>
      <div className="flex w-48 shrink-0 items-center justify-end gap-1">
        {!isVersion ? (
          <Button size="icon" variant="ghost" title="编辑信息" onClick={() => onRename(entry)}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          title={entryPreviewTitle(entry)}
          disabled={!previewable}
          onClick={() => onPreview(entry)}
        >
          <Eye className="h-4 w-4" />
        </Button>
        {!isVersion ? (
          <Button size="icon" variant="ghost" title="复制" onClick={() => onDuplicate(entry)}>
            <Copy className="h-4 w-4" />
          </Button>
        ) : null}
        {isVersion ? (
          <Button
            size="icon"
            variant="ghost"
            title={entry.deployed ? '重新部署为游戏' : '部署为游戏'}
            onClick={() => onDeploy(entry)}
          >
            <Rocket className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          title="删除"
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(entry)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
