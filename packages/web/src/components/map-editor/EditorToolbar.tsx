import { ArrowLeft, Download, Eye, History, Map as MapIcon, Save, Send, Settings2, Upload } from 'lucide-react';
import type { MapStatus } from '@loredoku/shared';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { LoredokuTick } from '@/components/common/LoredokuLoader';

interface EditorToolbarProps {
  mapName: string;
  dirty: boolean;
  saving: boolean;
  /** FEAT-H05(c) (docs/v0.4.2.md §5.4): the publish request is in flight. */
  publishing: boolean;
  /**
   * 保存按钮能不能点。缺省按 `dirty` 判定 —— 但 fork 态（`?v=` 还没落库）下
   * 「保存」本身就是「生成新草稿」这个动作，没有 dirty 也必须有得点，
   * 否则「点编辑 → 点保存」什么都不会发生。
   */
  canSave?: boolean;
  /**
   * `null` = 这一屏还**不是**一张草稿 —— 版本条目的 fork 态，画布装的是
   * 已发布快照，库里既没有新草稿也没有可发布的东西，所以徽标整个不出现
   * （显示成「草稿」是谎报状态）。保存落库换成新草稿行后它才回来。
   */
  status: MapStatus | null;
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
  /**
   * v0.7.4 §3：「预览」—— 打开只读预览页。不传即不渲染（谜题编辑器没有这条动线：
   * 它预览的是谜题玩法，走谜题列表）。fork 态也不传，因为 `?v=` 那一屏的数据源是
   * 版本快照，预览页按 `:mapId` 读行，读不到这份草稿。
   */
  onPreview?: () => void;
  /**
   * v0.7.3 §3.1：「引入新地图」只属于谜题编辑器（换掉被引用的底图）。地图编辑器
   * 没有这个动作，不传即不渲染 —— 按钮不是这里的东西。
   */
  onImportMap?: () => void;
  onOpenMapInfo: () => void;
  onExport: () => void;
  onImport: () => void;
}

export function EditorToolbar({
  mapName,
  dirty,
  saving,
  publishing,
  canSave,
  status,
  currentVersionNo,
  mapInfoOpen,
  infoTitle = '地图基本信息（名称、描述、封面、方格大小、线宽颜色、区域标签字体与名称）',
  onBack,
  onSave,
  onPublish,
  onOpenVersions,
  onPreview,
  onImportMap,
  onOpenMapInfo,
  onExport,
  onImport,
}: EditorToolbarProps): JSX.Element {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
      <div className="flex min-w-0 items-center gap-3">
        <IconButton
          variant="ghost"
          icon={<ArrowLeft className="h-4 w-4" />}
          label="返回地图列表"
          side="bottom"
          onClick={onBack}
          disabled={saving}
        />
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold" title={mapName}>
            {mapName}
          </span>
          {status === null ? null : (
            <span
              className={
                status === 'published'
                  ? 'rounded bg-success/10 px-1.5 py-0.5 text-2xs text-success'
                  : 'rounded bg-secondary px-1.5 py-0.5 text-2xs text-secondary-foreground'
              }
            >
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
              /* v0.7.8：`amber-100 / amber-700` 定色换成 `warning` token —— 深色
                 配对不再靠手写 `dark:`，而且跟着调色板一起走（赭石，不是柠檬黄）。 */
              className="cursor-pointer rounded bg-warning/10 px-1.5 py-0.5 text-2xs font-medium text-warning disabled:cursor-not-allowed"
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
        <IconButton
          variant="ghost"
          icon={<Upload className="h-4 w-4" />}
          label="导入 JSON"
          onClick={onImport}
          disabled={saving}
        />
        <IconButton
          variant="ghost"
          icon={<Download className="h-4 w-4" />}
          label="导出 JSON"
          onClick={onExport}
          disabled={saving}
        />
        {onImportMap ? (
          <IconButton
            variant="ghost"
            icon={<MapIcon className="h-4 w-4" />}
            label="引入新地图"
            shortcut="只替换底图画布"
            onClick={onImportMap}
            disabled={saving}
          />
        ) : null}
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
        <IconButton
          variant="ghost"
          icon={<History className="h-4 w-4" />}
          label="版本历史"
          onClick={onOpenVersions}
          disabled={saving || !onOpenVersions}
          style={onOpenVersions ? undefined : { display: 'none' }}
        />
        {onPreview ? (
          <IconButton
            variant="ghost"
            icon={<Eye className="h-4 w-4" />}
            label="预览"
            shortcut="只读 · 先保存当前修改"
            onClick={onPreview}
            disabled={saving}
          />
        ) : null}

        <div className="mx-1 h-5 w-px bg-border" />

        {/*
         * FEAT-H05(c) §5.4（用户裁定）：保存与发布**不合并**。保存是这一屏的主
         * 动作（实心 primary），发布是描边次按钮，且不因 dirty 置灰 —— 能不能发
         * 由确认弹窗按 dirty 分形态处理。
         *
         * v0.5.0 Q17: the puzzle editor passes no `onPublish`, so the whole
         * button (not a disabled one) is left out.
         */}
        <Button size="sm" onClick={onSave} disabled={saving || !(canSave ?? dirty)}>
          {saving ? (
            <LoredokuTick className="mr-1" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          {saving ? '保存中…' : '保存'}
        </Button>
        {onPublish ? (
          <Button variant="outline" size="sm" onClick={onPublish} disabled={saving || publishing}>
            {publishing ? (
              <LoredokuTick className="mr-1" />
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
