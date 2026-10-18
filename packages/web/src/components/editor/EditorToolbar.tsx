import { ArrowLeft, Download, History, Loader2, Save, Send, Settings2, Upload } from 'lucide-react';
import type { ProjectStatus } from '@loredoku/shared';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';

interface EditorToolbarProps {
  projectName: string;
  dirty: boolean;
  saving: boolean;
  /** FEAT-H05(c) (docs/v0.4.2.md §5.4): the publish request is in flight. */
  publishing: boolean;
  /**
   * `null` = 这一屏还**不是**一张草稿 —— 版本条目的 fork 态，画布装的是
   * 已发布快照，库里既没有新草稿也没有可发布的东西，所以徽标整个不出现
   * （显示成「草稿」是谎报状态）。保存落库换成新草稿行后它才回来。
   */
  status: ProjectStatus | null;
  currentVersionNo: number | null;
  /** v0.3.8 FEAT-D01: toggles the 「地图基本信息」drawer. */
  mapInfoOpen: boolean;
  /**
   * the same button opens the **puzzle**'s 基本信息 on the puzzle
   * editor, so its tooltip has to say what that drawer actually holds.
   */
  infoTitle?: string;
  onBack: () => void;
  onSave: () => void;
  /**
   * v0.5.0 SPEC-K12 / Q17 (docs/v0.5.0.md §2.5): 发布 belongs to the map
   * module. A puzzle has no versions, so the puzzle editor omits `onPublish`
   * and the button is not rendered at all (a hidden-but-present button would
   * still be a dead control in the DOM).
   */
  onPublish?: () => void;
  onOpenVersions?: () => void;
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
  infoTitle = '地图基本信息（方格大小、线宽颜色、区域名称）',
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
          {status === null ? null : (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
              {status === 'published' ? `已发布 v${currentVersionNo ?? ''}` : '草稿'}
            </span>
          )}
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
        {/* v0.5.7: 编辑器是独立全屏路由，没有 AppShell 的头部，主题开关挂这里。
            三组用分隔线断开：环境设置 | 文档操作 | 保存/发布。 */}
        <ThemeToggle />
        <div className="mx-1 h-5 w-px bg-border" />
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
          title={infoTitle}
        >
          <Settings2 className="h-4 w-4" />
          基本信息
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenVersions}
          disabled={saving || !onOpenVersions}
          title="版本历史"
          style={onOpenVersions ? undefined : { display: 'none' }}
        >
          <History className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        {/*
         * FEAT-H05(c) §5.4（用户裁定）：保存与发布**不合并**。保存是这一屏的主
         * 动作（实心 primary），发布是描边次按钮，且不因 dirty 置灰 —— 能不能发
         * 由确认弹窗按 dirty 分形态处理。
         *
         * v0.5.0 Q17: the puzzle editor passes no `onPublish`, so the whole
         * button (not a disabled one) is left out.
         */}
        <Button size="sm" onClick={onSave} disabled={saving || !dirty}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          {saving ? '保存中…' : '保存'}
        </Button>
        {onPublish ? (
          <Button variant="outline" size="sm" onClick={onPublish} disabled={saving || publishing}>
            {publishing ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            {publishing ? '发布中…' : '发布'}
          </Button>
        ) : null}
      </div>
    </header>
  );
}
