import { Copy, Pencil, Trash2 } from 'lucide-react';
import type { ProjectDetail } from '@murdoku/shared';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';

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
  return (
    <div className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(project)}
        className="w-40 shrink-0 truncate text-left font-medium hover:underline"
      >
        {project.name}
      </button>
      <span className="w-24 text-sm text-muted-foreground">
        {project.gridSize} × {project.gridSize}
      </span>
      <span className="w-20 text-sm text-muted-foreground">卡片 {project.cardCount}</span>
      <span className="w-20 text-sm text-muted-foreground">区域 {project.regionCount}</span>
      <span className="flex-1 truncate text-sm text-muted-foreground">
        {project.description || '暂无描述'}
      </span>
      <span className="w-40 text-right text-xs text-muted-foreground">
        {formatDateTime(project.updatedAt)}
      </span>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" title="重命名" onClick={() => onRename(project)}>
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
