import { SquarePen, Trash2 } from 'lucide-react';
import type { PuzzleEntrySummary } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { EntryActionsMenu } from '@/components/common/EntryActionsMenu';
import { ClampedText } from '@/components/common/ClampedText';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/lib/relativeTime';

/**
 * 谜题卡片（网格视图，服务草稿块）：封面 + 名称 + 描述 + 「尺寸 · 编码 · 时间」
 * 一行 + 主按钮。
 *
 * 主按钮按 kind 分叉：草稿行进编辑器，版本行走「编辑此版本」（`?v=` fork 态 ——
 * 进去不建行，保存才 fork）。三点菜单里的可见项同理由 `EntryActionsMenu` 按
 * `entry.kind` 分流，卡片本身不掺和。
 *
 * 版本块恒为列表行，所以卡片上这条分支平时用不到，留着是为了两块行为一致。
 */
interface PuzzleGridCardProps {
  entry: PuzzleEntrySummary;
  onOpen: (entry: PuzzleEntrySummary) => void;
  /** v0.7.2：版本行的「编辑」（`?v=` fork 态）。 */
  onEdit: (entry: PuzzleEntrySummary) => void;
  onRename: (entry: PuzzleEntrySummary) => void;
  onDuplicate: (entry: PuzzleEntrySummary) => void;
  onDelete: (entry: PuzzleEntrySummary) => void;
  onPreview: (entry: PuzzleEntrySummary) => void;
  /** 只有版本条目会走到这里（草稿行不渲染「部署」）。 */
  onDeploy: (entry: PuzzleEntrySummary) => void;
}

export function PuzzleGridCard({
  entry,
  onOpen,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
  onPreview,
  onDeploy,
}: PuzzleGridCardProps): JSX.Element {
  const initial = entry.name.trim().charAt(0) || '谜';
  const isVersion = entry.kind === 'version';

  return (
    <Card className="group flex flex-col overflow-hidden transition-colors hover:border-primary">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        title={`${isVersion ? '编辑此版本' : '进入编辑'}：${entry.name}`}
        className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden border-b bg-muted/40"
      >
        {entry.coverUrl ? (
          <img
            src={entry.coverUrl}
            alt={entry.name}
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-image ease-in-out scale-[1.2] group-hover:scale-100"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-secondary/40 text-3xl font-semibold text-muted-foreground/60">
            {initial}
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex-1 space-y-1">
          <h3 className="flex items-center gap-1.5 truncate font-medium" title={entry.name}>
            <span className="truncate">{entry.name}</span>
            {entry.versionNo !== null ? (
              <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-2xs text-secondary-foreground tabular-nums">
                v{entry.versionNo}
              </span>
            ) : null}
            {entry.deployed ? (
              <span className="shrink-0 rounded bg-success/10 px-1.5 py-0.5 text-2xs text-success">
                已部署
              </span>
            ) : null}
          </h3>
          {entry.description ? (
            /* v0.7.12：描述被截断时，悬停 / 触碰可看全文。 */
            <ClampedText text={entry.description} lines={2} className="text-xs text-muted-foreground" />
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="shrink-0 tabular-nums">
            {entry.gridSize} × {entry.gridSize}
          </span>
          {/* v0.8.5 §6：这里原来是底图来源（`地图名 vN`），换成编码 —— 见 PuzzleListRow 同处。 */}
          <span className="truncate font-mono" title={entry.code ?? undefined}>
            {entry.code ?? '—'}
          </span>
          <span className="shrink-0" title={formatDateTime(entry.publishedAt ?? entry.updatedAt)}>
            {formatRelativeTime(entry.publishedAt ?? entry.updatedAt)}更新
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => onOpen(entry)}>
            {isVersion ? '编辑此版本' : '进入编辑'}
          </Button>
          <div className="ml-auto flex items-center gap-1">
            {isVersion ? (
              <IconButton
                variant="ghost"
                icon={<SquarePen className="h-4 w-4" />}
                label="编辑此版本"
                onClick={() => onEdit(entry)}
              />
            ) : null}
            <EntryActionsMenu
              entry={entry}
              onEditInfo={onRename}
              onPreview={onPreview}
              onDuplicate={onDuplicate}
              onDeploy={onDeploy}
            />
            <IconButton
              variant="ghost"
              icon={<Trash2 className="h-4 w-4" />}
              label="删除"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(entry)}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
