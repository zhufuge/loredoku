import { Copy, Eye, Pencil, Rocket, SquarePen, Trash2 } from 'lucide-react';
import type { PuzzleEntrySummary } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { entryPreviewable, entryPreviewTitle } from '@/components/common/EntryActionsMenu';
import { formatDateTime } from '@/lib/format';

/**
 * 谜题列表行：缩略图 + 名称 +（版本号）+ 部署 + 尺寸 + 底图 + 描述 + 时间 +
 * 操作。列序与 `MapListRow` 一致，只多两列「部署」与「底图」（谜题的画布是创建
 * 时复制来的，作者需要看到它来自哪张图的哪个版本）。
 *
 * 版本列只在版本条目上出现；草稿块里条条都是草稿，`v{n}` 不该重复。
 *
 * **「部署」是独立一列**（v0.7.2 §2.2）：徽标原先挤在名称右侧，名称一长就被
 * 挤出可视区，整列宽度还跟着名称浮动。草稿行也占这一列的空间 —— 两块的行宽要
 * 对得上。
 *
 * 操作：编辑信息 / 预览 / **编辑** / 复制 / 部署 / 删除。**编辑信息与复制只给
 * 草稿行**，「部署」只给版本行（草稿永远不满足「已发布」）。
 *
 * v0.7.2 §2.1：版本行的封面与名称点击 = **预览**，改版本走预览后面那个「编辑」
 * 按钮 —— 进 `?v=` 的 fork 态（进去不建行，保存才 fork）。
 */
interface PuzzleListRowProps {
  entry: PuzzleEntrySummary;
  onOpen: (entry: PuzzleEntrySummary) => void;
  /** v0.7.2：版本行的「编辑」—— 带 `?v=` 进编辑器的 fork 态。 */
  onEdit: (entry: PuzzleEntrySummary) => void;
  onRename: (entry: PuzzleEntrySummary) => void;
  onDuplicate: (entry: PuzzleEntrySummary) => void;
  onDelete: (entry: PuzzleEntrySummary) => void;
  onPreview: (entry: PuzzleEntrySummary) => void;
  onDeploy: (entry: PuzzleEntrySummary) => void;
}

export function PuzzleListRow({
  entry,
  onOpen,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
  onPreview,
  onDeploy,
}: PuzzleListRowProps): JSX.Element {
  const initial = entry.name.trim().charAt(0) || '谜';
  const previewable = entryPreviewable(entry);
  const isVersion = entry.kind === 'version';
  /** 版本行的封面 / 名称是「看」，草稿行的是「改」。 */
  const coverAction = (): void => (isVersion ? onPreview(entry) : onOpen(entry));
  const coverTitle = isVersion ? entryPreviewTitle(entry) : '进入编辑';

  return (
    <div className="flex items-center gap-4 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/60">
      <button
        type="button"
        onClick={coverAction}
        title={`${coverTitle}：${entry.name}`}
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
        onClick={coverAction}
        className="w-48 shrink-0 truncate text-left font-medium hover:underline"
        title={entry.name}
      >
        <span className="truncate">{entry.name}</span>
      </button>
      {entry.versionNo !== null ? (
        <span className="w-14 shrink-0 tabular-nums text-sm text-muted-foreground">
          v{entry.versionNo}
        </span>
      ) : (
        <span className="w-14 shrink-0" />
      )}
      {/* 部署列：固定宽度，两块都占位，行宽才对得上。 */}
      <span className="w-16 shrink-0">
        {entry.deployed ? (
          <span className="rounded bg-success/10 px-1.5 py-0.5 text-[11px] text-success">
            已部署
          </span>
        ) : null}
      </span>
      <span className="w-16 shrink-0 tabular-nums text-sm text-muted-foreground">
        {`${entry.gridSize} × ${entry.gridSize}`}
      </span>
      {/* 底图来源：创建时复制的那份地图版本，之后与地图再无联动。 */}
      <span className="w-36 shrink-0 truncate text-xs text-muted-foreground" title={entry.mapName}>
        {entry.mapName ? `${entry.mapName} v${entry.mapVersionNo}` : '—'}
      </span>
      <span className="flex-1 truncate text-sm text-muted-foreground">
        {entry.description ?? ''}
      </span>
      <span className="w-52 shrink-0 truncate text-right text-xs text-muted-foreground">
        {formatDateTime(entry.publishedAt ?? entry.updatedAt)}
      </span>
      <div className="flex w-40 shrink-0 items-center justify-end gap-1">
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
        {isVersion ? (
          <Button size="icon" variant="ghost" title="编辑此版本" onClick={() => onEdit(entry)}>
            <SquarePen className="h-4 w-4" />
          </Button>
        ) : null}
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
