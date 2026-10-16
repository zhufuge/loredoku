import { ArrowLeft, Download, History, Loader2, Save, Send, Settings2, Upload } from 'lucide-react';
import type { ProjectStatus } from '@loredoku/shared';
import { Button } from '@/components/ui/button';

interface EditorToolbarProps {
  projectName: string;
  dirty: boolean;
  saving: boolean;
  /** FEAT-H05(c) (docs/v0.4.2.md §5.4): the publish request is in flight. */
  publishing: boolean;
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
  publishing,
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
          title="返回地图列表"
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
            /*
             * FEAT-H05(c) §5.4: the amber badge is both the standing indicator
             * and a shortcut — clicking it saves, which is the one action the
             * badge implies.
             */
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              title="有未保存的修改，点击立即保存"
              className="cursor-pointer rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 disabled:cursor-not-allowed"
            >
              未保存
            </button>
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

        {/*
         * FEAT-H05(c) §5.4（用户裁定）：保存与发布**不合并**。保存是这一屏的主
         * 动作（实心 primary），发布退为描边次按钮 —— 它不再承担「能不能发」的
         * 判断（那由确认弹窗按 dirty 分形态处理），所以**不再因 dirty 置灰**。
         */}
        <Button size="sm" onClick={onSave} disabled={saving || !dirty}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button variant="outline" size="sm" onClick={onPublish} disabled={saving || publishing}>
          {publishing ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1 h-4 w-4" />
          )}
          {publishing ? '发布中…' : '发布'}
        </Button>
      </div>
    </header>
  );
}
