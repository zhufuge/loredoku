import { Copy, Eye, Pencil, Trash2 } from 'lucide-react';
import type { MapEntrySummary } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { previewVersionNo } from './EntryActionsMenu';

/**
 * v0.5.8 §2: 列表视图的列结构重排 —— 封面 → 名称 → 版本/草稿 → 描述 →
 * 时间 → 操作，其中**版本列、时间列、操作列各自对齐**（固定宽度 + 同一
 * text-align），不再让 n × n 单独占一列（创建时不再有尺寸，列会经常是空的）。
 *
 * 操作列四个图标，两类条目完全相同：编辑信息 / 预览 / 复制 / 删除。
 * 预览对「从没发布过的工作条目」禁用。
 */
interface ProjectListRowProps {
  entry: MapEntrySummary;
  onOpen: (entry: MapEntrySummary) => void;
  onRename: (entry: MapEntrySummary) => void;
  onDuplicate: (entry: MapEntrySummary) => void;
  onDelete: (entry: MapEntrySummary) => void;
  onPreview: (entry: MapEntrySummary) => void;
}

export function ProjectListRow({
  entry,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onPreview,
}: ProjectListRowProps): JSX.Element {
  const initial = entry.name.trim().charAt(0) || '图';
  const versionNo = entry.versionNo ?? entry.currentVersionNo;
  const badge = versionNo !== null ? `v${versionNo}` : '草稿';
  const previewable = previewVersionNo(entry) !== null;

  return (
    <div className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        title={`进入编辑：${entry.name}`}
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
        className="w-48 shrink-0 truncate text-left font-medium hover:underline"
        title={entry.name}
      >
        <span className="truncate">{entry.name}</span>
      </button>
      {/* 版本/草稿：单独一列、左对齐、等宽数字，让 v9 / v10 不错位。 */}
      <span className="w-14 shrink-0 tabular-nums text-sm text-muted-foreground">{badge}</span>
      <span className="flex-1 truncate text-sm text-muted-foreground">
        {entry.description ?? ''}
      </span>
      {/* 时间：右对齐、固定宽度，两行条目的小数秒也不会把操作列推走。 */}
      <span className="w-52 shrink-0 truncate text-right text-xs text-muted-foreground">
        {formatDateTime(entry.publishedAt ?? entry.updatedAt)}
      </span>
      <div className="flex w-32 shrink-0 items-center justify-end gap-1">
        <Button size="icon" variant="ghost" title="编辑信息" onClick={() => onRename(entry)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title={previewable ? '预览已发布版本' : '还没有已发布的版本可预览'}
          disabled={!previewable}
          onClick={() => onPreview(entry)}
        >
          <Eye className="h-4 w-4" />
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
      </div>
    </div>
  );
}
