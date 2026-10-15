import { ArrowLeft, Download, History, Loader2, Save, Send, Settings2, Upload } from 'lucide-react';
import type { ProjectStatus } from '@murdoku/shared';
import { Button } from '@/components/ui/button';

interface EditorToolbarProps {
  projectName: string;
  dirty: boolean;
  saving: boolean;
  status: ProjectStatus;
  currentVersionNo: number | null;
  /** v0.3.8 FEAT-D01: toggles the 「地图基本信息」drawer. */
  mapInfoOpen: boolean;
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
  onOpenVersions: () => void;
  onOpenMapInfo: () => void;
  onExport: () => void;
  onImport: () => void;
}

export function EditorToolbar({
  projectName,
  dirty,
  saving,
  status,
  currentVersionNo,
  mapInfoOpen,
  onBack,
  onSave,
  onPublish,
  onOpenVersions,
  onOpenMapInfo,
  onExport,
  onImport,
}: EditorToolbarProps): JSX.Element {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          disabled={saving}
          title="返回项目列表"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-0 items-center gap-2">
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
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onImport} disabled={saving} title="导入 JSON">
          <Upload className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onExport} disabled={saving} title="导出 JSON">
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant={mapInfoOpen ? 'secondary' : 'ghost'}
          size="sm"
          className="h-9 gap-1 px-2 text-xs"
          onClick={onOpenMapInfo}
          disabled={saving}
          title="地图基本信息（方格大小、线宽颜色、区域名称、联动主题色）"
        >
          <Settings2 className="h-4 w-4" />
          基本信息
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenVersions}
          disabled={saving}
          title="作品历史"
        >
          <History className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button variant="outline" size="sm" onClick={onSave} disabled={saving || !dirty}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
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
