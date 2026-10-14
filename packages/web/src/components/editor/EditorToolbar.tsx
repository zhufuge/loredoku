import {
  ArrowLeft,
  Minus,
  Plus,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EditorToolbarProps {
  projectName: string;
  gridSize: number;
  zoom: number;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
}

export function EditorToolbar({
  projectName,
  gridSize,
  zoom,
  dirty,
  saving,
  canUndo,
  canRedo,
  onBack,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onUndo,
  onRedo,
  onSave,
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
            {dirty ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                未保存
              </span>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {gridSize} × {gridSize}
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
          title="重置缩放 (Ctrl+0)"
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

        <Button variant="outline" size="sm" onClick={onSave} disabled={saving || !dirty}>
          <Save className="mr-1 h-4 w-4" />
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </header>
  );
}
