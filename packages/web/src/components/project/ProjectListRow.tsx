import { Copy, Pencil, Trash2 } from 'lucide-react';
import type { ProjectDetail } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';

/**
 * OPT-H04 §4.2c (docs/v0.4.2.md §4): the list view keeps the absolute time (a
 * table wants exact values, not 「3 天前」) but gains the same cover thumbnail,
 * and drops the 「卡片 N」/「区域 N」 columns the card also lost.
 *
 * Column order: 封面 → 名称 → n × n → 描述 → 更新时间 → 操作.
 */
interface ProjectListRowProps {
  project: ProjectDetail;
  onOpen: (project: ProjectDetail) => void;
  onRename: (project: ProjectDetail) => void;
  onDuplicate: (project: ProjectDetail) => void;
  onDelete: (project: ProjectDetail) => void;
}

export function ProjectListRow({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: ProjectListRowProps): JSX.Element {
  const initial = project.name.trim().charAt(0) || '图';

  return (
    <div className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(project)}
        title={project.name}
        className="h-10 w-16 shrink-0 cursor-pointer overflow-hidden rounded border bg-muted/40"
      >
        {project.coverUrl ? (
          <img
            src={project.coverUrl}
            alt={project.name}
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
        onClick={() => onOpen(project)}
        className="w-40 shrink-0 truncate text-left font-medium hover:underline"
      >
        {project.name}
      </button>
      <span className="w-20 shrink-0 tabular-nums text-sm text-muted-foreground">
        {project.gridSize} × {project.gridSize}
      </span>
      <span className="flex-1 truncate text-sm text-muted-foreground">
        {project.description ?? ''}
      </span>
      <span className="w-40 shrink-0 text-right text-xs text-muted-foreground">
        {formatDateTime(project.updatedAt)}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="icon" variant="ghost" title="编辑信息" onClick={() => onRename(project)}>
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
  );
}
