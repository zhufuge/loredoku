import { Copy, Pencil, Trash2 } from 'lucide-react';
import type { ProjectDetail } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/lib/relativeTime';

/**
 * FEAT-H03 + OPT-H04 (docs/v0.4.2.md §3.2d / §4.2b): the map card, rebuilt.
 *
 * - the cover is the card's **head**, fixed at 16:10, and clicking it opens the
 *   editor; without artwork the name's first character stands in (the same
 *   placeholder the game card uses)
 * - 「卡片 N」/「区域 N」 are gone — the spec and the update time are all a
 *   browsing author needs
 * - an empty description collapses the line instead of printing 「暂无描述」
 * - the update time is **relative** on the card (absolute on hover, and in the
 *   list view), so "how fresh is this" is readable at a glance
 */
interface ProjectGridCardProps {
  project: ProjectDetail;
  onOpen: (project: ProjectDetail) => void;
  onRename: (project: ProjectDetail) => void;
  onDuplicate: (project: ProjectDetail) => void;
  onDelete: (project: ProjectDetail) => void;
}

export function ProjectGridCard({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: ProjectGridCardProps): JSX.Element {
  const initial = project.name.trim().charAt(0) || '图';
  const updatedAt = project.updatedAt;

  return (
    <Card className="flex flex-col overflow-hidden transition-colors hover:border-primary">
      <button
        type="button"
        onClick={() => onOpen(project)}
        className="relative block aspect-[16/10] w-full cursor-pointer overflow-hidden border-b bg-muted/40"
      >
        {project.coverUrl ? (
          <img
            src={project.coverUrl}
            alt={project.name}
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-secondary/40 text-4xl font-semibold text-muted-foreground/60">
            {initial}
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex-1 space-y-1">
          <h3 className="truncate font-medium" title={project.name}>
            {project.name}
          </h3>
          {project.description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="tabular-nums">
            {project.gridSize} × {project.gridSize}
          </span>
          <span className="px-1">·</span>
          <span title={formatDateTime(updatedAt)}>{formatRelativeTime(updatedAt)}更新</span>
        </p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => onOpen(project)}>
            编辑
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="编辑信息"
            className="ml-auto"
            onClick={() => onRename(project)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" title="复制" onClick={() => onDuplicate(project)}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="删除"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(project)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
