import { Copy, Eye, Pencil, Trash2 } from 'lucide-react';
import type { MapEntrySummary } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { previewVersionNo } from './EntryActionsMenu';

/**
 * v0.5.9 §2: 徽标只看 `versionNo` —— 版本条目显示 `v{n}`，工作条目一律
 * 「草稿」（v0.5.8 的 `versionNo ?? currentVersionNo` 会让发布过的工作条目
 * 也顶个版本号，与「草稿」语义相反）。
 *
 * 操作列：编辑信息 / 预览 / 复制 / 删除四个图标。**「复制」只属于工作条目**
 * （v0.5.8 §13 裁定：版本是冻结快照，复制它既不能改也产不出有用的新图，
 * 想基于某版本继续做事走编辑器内版本历史面板的 fork）。**「编辑信息」同样只
 * 属于工作条目**（v0.5.8 第三阶段：合并后版本行有快照列，但冻结不可改）。
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
  const badge = entry.versionNo !== null ? `v${entry.versionNo}` : '草稿';
  const previewable = previewVersionNo(entry) !== null;
  /**
   * v0.5.8 §13: 版本条目的主点击是「以此为底稿新建」—— 带 `?v={n}` 进编辑器，
   * 保存时才生成草稿；只读预览留给眼睛图标。
   */
  const openTitle = entry.kind === 'version' ? '以此为底稿新建' : '进入编辑';

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
        {/* v0.5.8 第三阶段（设计 §11 第 9 条）：版本条目的快照列不可改 ——
            改名 / 改描述会破坏「版本不可变」，所以这块只给工作条目。 */}
        {entry.kind !== 'version' ? (
          <Button size="icon" variant="ghost" title="编辑信息" onClick={() => onRename(entry)}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          title={previewable ? '预览已发布版本' : '还没有已发布的版本可预览'}
          disabled={!previewable}
          onClick={() => onPreview(entry)}
        >
          <Eye className="h-4 w-4" />
        </Button>
        {entry.kind !== 'version' ? (
          <Button size="icon" variant="ghost" title="复制" onClick={() => onDuplicate(entry)}>
            <Copy className="h-4 w-4" />
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
