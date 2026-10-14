import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Download,
  History,
  Minus,
  Plus,
  Redo2,
  Save,
  Send,
  Undo2,
  Upload,
} from 'lucide-react';
import { GRID_SIZE_MAX, GRID_SIZE_MIN, type ProjectStatus } from '@murdoku/shared';
import { Button } from '@/components/ui/button';

interface EditorToolbarProps {
  projectName: string;
  gridSize: number;
  zoom: number;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  status: ProjectStatus;
  currentVersionNo: number | null;
  onBack: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onPublish: () => void;
  onOpenVersions: () => void;
  onExport: () => void;
  onImport: () => void;
  onResize: (gridSize: number) => void;
}

export function EditorToolbar({
  projectName,
  gridSize,
  zoom,
  dirty,
  saving,
  canUndo,
  canRedo,
  status,
  currentVersionNo,
  onBack,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onUndo,
  onRedo,
  onSave,
  onPublish,
  onOpenVersions,
  onExport,
  onImport,
  onResize,
}: EditorToolbarProps): JSX.Element {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} title="返回项目列表">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold" title={projectName}>
              {projectName}
            </span>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
              {status === 'published' ? `已发布 v${currentVersionNo ?? ''}` : '草稿'}
            </span>
            {dirty ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                未保存
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>画布</span>
            <GridSizeInput gridSize={gridSize} onResize={onResize} />
            <span>× {gridSize}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onZoomOut} title="缩小">
          <Minus className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={onResetZoom}
          title="重置视图 (Ctrl+0)"
          className="w-14 rounded px-2 py-1 text-center text-sm tabular-nums text-muted-foreground hover:bg-accent"
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button variant="ghost" size="icon" onClick={onZoomIn} title="放大">
          <Plus className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} title="撤销 (Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRedo}
          disabled={!canRedo}
          title="重做 (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button variant="ghost" size="icon" onClick={onImport} title="导入 JSON">
          <Upload className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onExport} title="导出 JSON">
          <Download className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onOpenVersions} title="版本历史">
          <History className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button variant="outline" size="sm" onClick={onSave} disabled={saving || !dirty}>
          <Save className="mr-1 h-4 w-4" />
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button size="sm" onClick={onPublish} disabled={saving || dirty}>
          <Send className="mr-1 h-4 w-4" />
          发布
        </Button>
      </div>
    </header>
  );
}

interface GridSizeInputProps {
  gridSize: number;
  onResize: (gridSize: number) => void;
}

function GridSizeInput({ gridSize, onResize }: GridSizeInputProps): JSX.Element {
  const [value, setValue] = useState(String(gridSize));

  useEffect(() => {
    setValue(String(gridSize));
  }, [gridSize]);

  const commit = (): void => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setValue(String(gridSize));
      return;
    }
    const clamped = Math.min(GRID_SIZE_MAX, Math.max(GRID_SIZE_MIN, Math.round(parsed)));
    setValue(String(clamped));
    if (clamped !== gridSize) onResize(clamped);
  };

  return (
    <input
      type="number"
      min={GRID_SIZE_MIN}
      max={GRID_SIZE_MAX}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
      className="h-6 w-14 rounded border border-input bg-background px-1 text-xs"
    />
  );
}

