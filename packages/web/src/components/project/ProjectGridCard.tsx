import { Trash2 } from 'lucide-react';
import type { MapEntrySummary } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/lib/relativeTime';
import { EntryActionsMenu } from './EntryActionsMenu';

/**
 * v0.5.8 §2: 工作条目与版本条目**展示相同** —— 名称后跟同一个徽标
 * （`v{n}`，没有版本号的工作条目显示「草稿」），操作也同一套：
 * 进入编辑（主按钮）+ 三点菜单（编辑信息 / 预览 / 复制）+ 删除。
 *
 * 与 v0.5.7 及以前的差异：
 * - 徽标不再写「已发布 v3」/「地图 v3」，版本号只出现在名称后那一格；
 * - 「查看效果 / 新建谜题 / 编辑此版本」三个按 kind 分叉的按钮合并成同一组；
 *   版本条目的「编辑此版本」（fork）不再从卡片进入，版本历史面板里仍有入口；
 * - 封面矮一档（`aspect-[4/3]`，v0.5.3 起是正方形），hover 时向内缩小。
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
  const versionNo = entry.versionNo ?? entry.currentVersionNo;
  const badge = versionNo !== null ? `v${versionNo}` : '草稿';
  const size = entry.gridSize;

  return (
    <Card className="group flex flex-col overflow-hidden transition-colors hover:border-primary">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        title={`进入编辑：${entry.name}`}
        // v0.5.8: 封面小一档。不再用正方形 —— 正方形在四列网格里高得压住了
        // 文字区，而封面只是缩略图，4:3 足够辨认。
        className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden border-b bg-muted/40"
      >
        {entry.coverUrl ? (
          // v0.5.8: hover 卡片 → 封面向内缩小一点（scale < 1）。
          <img
            src={entry.coverUrl}
            alt={entry.name}
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-95"
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
            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
              {badge}
            </span>
          </h3>
          {entry.description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{entry.description}</p>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {/* v0.5.8: 尺寸可能还没初始化（创建时不填），此时整段不渲染。 */}
          {size !== null ? (
            <>
              <span className="tabular-nums">
                {size} × {size}
              </span>
              <span className="px-1">·</span>
            </>
          ) : null}
          {entry.versionCount > 0 ? (
            <>
              共 {entry.versionCount} 个版本
              <span className="px-1">·</span>
            </>
          ) : null}
          <span title={formatDateTime(entry.publishedAt ?? entry.updatedAt)}>
            {formatRelativeTime(entry.publishedAt ?? entry.updatedAt)}更新
          </span>
        </p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => onOpen(entry)}>
            进入编辑
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
