import { Trash2 } from 'lucide-react';
import type { MapEntrySummary } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/lib/relativeTime';
import { EntryActionsMenu } from './EntryActionsMenu';

/**
 * v0.5.8 §2: 工作条目与版本条目**展示相同** —— 名称后跟同一个徽标，
 * 操作也几乎同一套：主按钮 + 三点菜单 + 删除。
 *
 * v0.5.9 §2/§3/§6:
 * - 徽标只看 `versionNo`：**版本条目**才显示 `v{n}`，工作条目一律「草稿」
 *   （v0.5.8 用 `versionNo ?? currentVersionNo`，发布过的工作条目也会顶个
 *   `v3`，与「草稿」的语义相反）；
 * - 「共 N 个版本」元信息删除（版本列已经说清是哪一版，计数没有用处）；
 * - 封面默认 `scale-[1.2]`：放大裁中间，只露局部；hover 卡片时缩回
 *   `scale-100` 展示全部（v0.5.8 是 1 → 0.95，幅度太小看不出动效）；
 * - 主按钮按 kind 分叉：工作条目进编辑器，版本条目走「以此为底稿新建」——
 *   同样进编辑器，但带 `?v={n}` 装载版本快照，**保存时才生成草稿**
 *   （v0.5.8 §13）。
 *
 * v0.5.8 §13 裁定: 三点菜单里的「复制」**只属于工作条目**（版本条目是冻结
 * 快照，复制它既不能改也产不出有用的新图），由 `EntryActionsMenu` 内部按
 * `entry.kind` 分流，卡片本身不掺和。
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
  const badge = entry.versionNo !== null ? `v${entry.versionNo}` : '草稿';
  const size = entry.gridSize;

  return (
    <Card className="group flex flex-col overflow-hidden transition-colors hover:border-primary">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        title={`${isVersion ? '以此为底稿新建' : '进入编辑'}：${entry.name}`}
        // v0.5.8: 封面小一档。不再用正方形 —— 正方形在四列网格里高得压住了
        // 文字区，而封面只是缩略图，4:3 足够辨认。
        className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden border-b bg-muted/40"
      >
        {entry.coverUrl ? (
          // v0.5.9 §3: 默认放大 1.2 裁中间（overflow-hidden 切掉四边），
          // hover 时缩回原尺寸展示全部 —— 动效比 v0.5.8 的 0.95 明显。
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
          <span title={formatDateTime(entry.publishedAt ?? entry.updatedAt)}>
            {formatRelativeTime(entry.publishedAt ?? entry.updatedAt)}更新
          </span>
        </p>
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
