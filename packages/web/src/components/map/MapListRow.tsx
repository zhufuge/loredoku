import { Copy, Eye, Pencil, SquarePen, Trash2 } from 'lucide-react';
import type { MapEntrySummary } from '@loredoku/shared';
import { IconButton } from '@/components/ui/icon-button';
import { formatDateTime } from '@/lib/format';
import { ClampedText } from '@/components/common/ClampedText';
import { entryPreviewable, entryPreviewTitle } from '@/components/common/EntryActionsMenu';

/**
 * 列表行：缩略图 + 名称 +（版本号）+ 尺寸 + 描述 + 时间 + 操作图标。
 *
 * 草稿行不渲染版本列，也不挂徽标 —— 草稿块里条条都是草稿；`v{n}` 只在版本
 * 条目上出现。尺寸列两块都有，未初始化时打 `—` 占位（列表得按列对齐）。
 *
 * 操作列：编辑信息 / 预览 / **编辑** / 复制 / 删除。**「复制」与「编辑信息」
 * 都只属于工作条目** —— 版本是冻结快照，想基于某版本继续做走「编辑」。
 *
 * v0.7.2：版本行的封面与名称**点击即预览**（与眼睛按钮同一个动作），改版本
 * 走预览后面那个「编辑」按钮 —— 看和改分成两个入口，误点封面不会再直接进
 * 编辑态。草稿行的封面 / 名称点击仍是「进编辑器」。
 */
interface MapListRowProps {
  entry: MapEntrySummary;
  onOpen: (entry: MapEntrySummary) => void;
  /** v0.7.2：版本行的「编辑」—— 带 `?v=` 进编辑器的 fork 态。 */
  onEdit: (entry: MapEntrySummary) => void;
  onRename: (entry: MapEntrySummary) => void;
  onDuplicate: (entry: MapEntrySummary) => void;
  onDelete: (entry: MapEntrySummary) => void;
  onPreview: (entry: MapEntrySummary) => void;
}

export function MapListRow({
  entry,
  onOpen,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
  onPreview,
}: MapListRowProps): JSX.Element {
  const initial = entry.name.trim().charAt(0) || '图';
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
      {/* 版本列：**只有版本条目才有** —— 草稿块里这一列恒为「草稿」，整列不渲染
          （v0.5.8 第五阶段）。单独一列、左对齐、等宽数字，让 v9 / v10 不错位。 */}
      {entry.versionNo !== null ? (
        <span className="w-14 shrink-0 tabular-nums text-sm text-muted-foreground">
          v{entry.versionNo}
        </span>
      ) : null}
      {/* 尺寸列（v0.5.8 第七阶段）：草稿与版本两块都要。未初始化时打 `—` 而不是
          整列不渲染 —— 列表行要按列对齐，缺一格会让下面的描述/时间跟着漂。 */}
      <span className="w-16 shrink-0 tabular-nums text-sm text-muted-foreground">
        {entry.gridSize !== null ? `${entry.gridSize} × ${entry.gridSize}` : '—'}
      </span>
      {entry.description ? (
        <ClampedText
          text={entry.description}
          lines={1}
          className="flex-1 text-sm text-muted-foreground"
        />
      ) : (
        <span className="flex-1" />
      )}
      {/* 时间：右对齐、固定宽度，两行条目的小数秒也不会把操作列推走。 */}
      <span className="w-52 shrink-0 truncate text-right text-xs text-muted-foreground">
        {formatDateTime(entry.publishedAt ?? entry.updatedAt)}
      </span>
      <div className="flex w-40 shrink-0 items-center justify-end gap-1">
        {/* v0.5.8 第三阶段（设计 §11 第 9 条）：版本条目的快照列不可改 ——
            改名 / 改描述会破坏「版本不可变」，所以这块只给工作条目。 */}
        {!isVersion ? (
          <IconButton
            variant="ghost"
            icon={<Pencil className="h-4 w-4" />}
            label="编辑信息"
            onClick={() => onRename(entry)}
          />
        ) : null}
        <IconButton
          variant="ghost"
          icon={<Eye className="h-4 w-4" />}
          label={entryPreviewTitle(entry)}
          disabled={!previewable}
          onClick={() => onPreview(entry)}
        />
        {isVersion ? (
          <IconButton
            variant="ghost"
            icon={<SquarePen className="h-4 w-4" />}
            label="编辑此版本"
            onClick={() => onEdit(entry)}
          />
        ) : null}
        {!isVersion ? (
          <IconButton
            variant="ghost"
            icon={<Copy className="h-4 w-4" />}
            label="复制"
            onClick={() => onDuplicate(entry)}
          />
        ) : null}
        <IconButton
          variant="ghost"
          icon={<Trash2 className="h-4 w-4" />}
          label="删除"
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(entry)}
        />
      </div>
    </div>
  );
}
