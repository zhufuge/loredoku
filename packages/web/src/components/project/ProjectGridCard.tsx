import { Copy, ImageIcon, Pencil, Trash2 } from 'lucide-react';
import type { ProjectDetail } from '@murdoku/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';

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
  return (
    <Card className="flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={() => onOpen(project)}
        className="flex h-36 items-center justify-center overflow-hidden border-b bg-muted/40 transition-colors hover:bg-muted"
      >
        {project.coverUrl ? (
          <img src={project.coverUrl} alt={project.name} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )}
      </button>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex-1">
          <h3 className="truncate font-medium" title={project.name}>
            {project.name}
          </h3>
          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs text-muted-foreground">
            {project.description || '暂无描述'}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {project.gridSize} × {project.gridSize}
          </span>
          <span>卡片 {project.cardCount}</span>
          <span>区域 {project.regionCount}</span>
        </div>
        <p className="text-xs text-muted-foreground">更新于 {formatDateTime(project.updatedAt)}</p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => onOpen(project)}>
            编辑
          </Button>
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
    </Card>
  );
}
