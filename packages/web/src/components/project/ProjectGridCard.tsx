import { Trash2 } from 'lucide-react';
import type { MapEntrySummary } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/lib/relativeTime';
import { EntryActionsMenu } from './EntryActionsMenu';

/**
 * 卡片：封面 + 名称 + 描述 + 「尺寸 … 时间」一行。
 *
 * 卡片目前只服务草稿块，所以名称后没有徽标；`v{n}` 只出现在版本条目上。
 * 副信息行尺寸贴左、时间贴右，未初始化时尺寸位打 `—` 占位。
 *
 *
 * 主按钮按 kind 分叉：工作条目进编辑器，版本条目走「以此为底稿新建」——
 * 同样进编辑器，但带 `?v={n}` 装载版本快照，**保存时才生成草稿**。
 *
 * 三点菜单里的「复制」与「编辑信息」都只属于工作条目（版本是冻结快照），
 * 由 `EntryActionsMenu` 内部按 `entry.kind` 分流，卡片本身不掺和。
 */
interface ProjectGridCardProps {
  entry: MapEntrySummary;
  onOpen: (entry: MapEntrySummary) => void;
  onRename: (entry: MapEntrySummary) => void;
  onDuplicate: (entry: MapEntrySummary) => void;
  onDelete: (entry: MapEntrySummary) => void;
  /** 预览已发布版本；工作条目从未发布时该动作禁用。 */
  onPreview: (entry: MapEntrySummary) => void;
}

export function ProjectGridCard({
  entry,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onPreview,
}: ProjectGridCardProps): JSX.Element {
  const initial = entry.name.trim().charAt(0) || '图';
  const isVersion = entry.kind === 'version';
  const size = entry.gridSize;

  return (
    <Card className="group flex flex-col overflow-hidden transition-colors hover:border-primary">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        title={`${isVersion ? '以此为底稿新建' : '进入编辑'}：${entry.name}`}
        // 封面是 4:3 缩略图 —— 正方形在四列网格里高得压住了文字区，而封面
        // 只是缩略图，4:3 足够辨认。
        className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden border-b bg-muted/40"
      >
        {entry.coverUrl ? (
          // 默认放大 1.2 裁中间（overflow-hidden 切掉四边），hover 时缩回
          // 原尺寸展示全部。
          <img
            src={entry.coverUrl}
            alt={entry.name}
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-200 ease-out scale-[1.2] group-hover:scale-100"
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
            {/* v0.5.8 第五阶段：草稿块里的每张卡都是草稿，「草稿」二字纯属重复 ——
                徽标只在版本条目上出现（卡片目前只服务草稿块，留着是为了版式自洽）。 */}
            {entry.versionNo !== null ? (
              <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground tabular-nums">
                v{entry.versionNo}
              </span>
            ) : null}
          </h3>
          {entry.description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{entry.description}</p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="shrink-0 tabular-nums">
            {size !== null ? `${size} × ${size}` : '—'}
          </span>
          <span className="truncate" title={formatDateTime(entry.publishedAt ?? entry.updatedAt)}>
            {formatRelativeTime(entry.publishedAt ?? entry.updatedAt)}更新
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* v0.5.8 §13: 版本条目的主去处是「以此为底稿新建」的编辑器。 */}
          <Button size="sm" variant="secondary" onClick={() => onOpen(entry)}>
            {isVersion ? '以此为底稿新建' : '进入编辑'}
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <EntryActionsMenu
              entry={entry}
              onEditInfo={onRename}
              onPreview={onPreview}
              onDuplicate={onDuplicate}
            />
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
      </div>
    </Card>
  );
}
