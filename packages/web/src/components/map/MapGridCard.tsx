import { SquarePen, Trash2 } from 'lucide-react';
import { MAP_COVER_ASPECT } from '@loredoku/shared';
import type { MapEntrySummary } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Card } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/lib/relativeTime';
import { EntryActionsMenu } from '@/components/common/EntryActionsMenu';
import { ClampedText } from '@/components/common/ClampedText';

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
 * 由 `MapEntryActionsMenu` 内部按 `entry.kind` 分流，卡片本身不掺和。
 */
interface MapGridCardProps {
  entry: MapEntrySummary;
  onOpen: (entry: MapEntrySummary) => void;
  /** v0.7.2：版本行的「编辑」（`?v=` fork 态）。卡片只服务草稿块，留着为了版式自洽。 */
  onEdit: (entry: MapEntrySummary) => void;
  onRename: (entry: MapEntrySummary) => void;
  onDuplicate: (entry: MapEntrySummary) => void;
  onDelete: (entry: MapEntrySummary) => void;
  /** 预览已发布版本；工作条目从未发布时该动作禁用。 */
  onPreview: (entry: MapEntrySummary) => void;
}

export function MapGridCard({
  entry,
  onOpen,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
  onPreview,
}: MapGridCardProps): JSX.Element {
  const initial = entry.name.trim().charAt(0) || '图';
  const isVersion = entry.kind === 'version';
  const size = entry.gridSize;

  return (
    <Card className="group flex flex-col overflow-hidden transition-colors hover:border-primary">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        title={`${isVersion ? '以此为底稿新建' : '进入编辑'}：${entry.name}`}
        // v0.10.2：封面框改成 `MAP_COVER_ASPECT`（16:10），与编辑器「基本信息」
        // 抽屉、新建 / 编辑对话框里的预览框**同一把尺**。此前这里是 `4/3`，
        // 于是同一张图在编辑器里看到的是 16:10 的裁切、在卡片上看到的是 4:3 的
        // 裁切 —— 用户配好封面回到列表，认不出是同一张。
        // 比例写进行内样式而不是 `aspect-[16/10]`：常量才是唯一真源，改一处
        // 三处一起变。
        style={{ aspectRatio: String(MAP_COVER_ASPECT) }}
        className="relative block w-full cursor-pointer overflow-hidden border-b bg-muted/40"
      >
        {entry.coverUrl ? (
          // v0.10.2：去掉默认的 `scale-[1.2]`。那一层放大只保留中间 83%，
          // 等于在 16:10 之上又裁一刀，卡片永远比预览框「更近一点」；
          // 要让「配置时看到的」和「卡片上看到的」逐像素一致，就不能有它。
          <img
            src={entry.coverUrl}
            alt={entry.name}
            draggable={false}
            className="h-full w-full object-cover"
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
              <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-2xs text-secondary-foreground tabular-nums">
                v{entry.versionNo}
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
