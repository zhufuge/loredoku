import { useRef, useState } from 'react';
import { CircleDashed, Trash2, Upload, X } from 'lucide-react';
import {
  GAME_TOOL_ICON_KINDS,
  GAME_TOOL_ICON_LABELS,
  fileUrlFromPath,
  type GameToolIconKind,
  type Theme,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ColorField } from '@/components/ui/color-input';
import { CardHead } from '@/components/theme-overview/ThemeOverviewParts';
import {
  useRemoveThemeMark,
  useRemoveThemeRing,
  useRemoveThemeToolIcon,
  useUploadThemeMark,
  useUploadThemeRing,
  useUploadThemeToolIcon,
  useUpdateThemeCheckStyle,
} from '@/hooks/useThemes';
import { resolveCheckColors } from '@/lib/checkStyle';
import { TOOL_ICON_FALLBACKS } from '@/lib/toolIcons';

/**
 * v0.9.5：**操作提示** —— 玩家在盘面上操作时看到的那些提示，都在这一张卡里。
 *
 * 五项：
 *
 * | 项 | 玩家看到它的地方 |
 * |---|---|
 * | 标记 | 标「这格排除」时画在格子里的那枚符号（谜题可以单独换一张） |
 * | 清除 / 回退 / 提交 | 游戏页右列那三枚按钮上的画 |
 * | 圆环 | 按住一格放头像的进度环、提交后逐人校验的结果环 |
 *
 * 为什么合成一张：它们回答的是同一个问题 —— **这个世界的操作手感长什么样**。
 * 分四张卡会让人以为四件事互不相干，而作者调的时候往往是一起调的。
 *
 * 五枚都是**读取时**兜底，不是「新建时抄一份」：换一张图，本主题下跟随的关卡
 * （含已发布的）下次打开就是新的。所以这里没有「保存」，选中文件即上传、
 * 点移除即清掉。已在谜题里单独上传过的仍用自己那张（覆盖）。
 *
 * 圆环那一项**同时管两处**：长按计时环与提交校验圈——玩家看到的都是「一圈绕着
 * 一格走」，配两张图只会让作者传两次、而且很难保证它们看起来是一家人。
 */
export function GameMarksCard({ theme }: { theme: Theme }): JSX.Element {
  const markInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const ringInputRef = useRef<HTMLInputElement>(null);
  const [pendingIcon, setPendingIcon] = useState<GameToolIconKind | null>(null);

  const uploadMark = useUploadThemeMark(theme.code);
  const removeMarkImage = useRemoveThemeMark(theme.code);
  const uploadIcon = useUploadThemeToolIcon(theme.code);
  const removeIcon = useRemoveThemeToolIcon(theme.code);
  const uploadRingImage = useUploadThemeRing(theme.code);
  const removeRingImage = useRemoveThemeRing(theme.code);
  const updateCheckStyle = useUpdateThemeCheckStyle(theme.code);

  const mark = theme.data.mark ?? null;
  const icons = theme.data.toolIcons ?? {};
  const ring = theme.data.ring?.image ?? null;
  const checkStyle = resolveCheckColors(theme.data.checkStyle);

  const markBusy = uploadMark.isPending || removeMarkImage.isPending;
  const ringBusy = uploadRingImage.isPending || removeRingImage.isPending;

  /** 一行的骨架：预览 + 名字与说明 + 右侧两枚按钮。五项共用，尺寸才一致。 */
  const row = (
    key: string,
    preview: JSX.Element,
    title: string,
    description: string,
    uploading: boolean,
    hasImage: boolean,
    onPick: () => void,
    onRemove: () => void,
    label: string,
  ): JSX.Element => (
    <li key={key} data-testid={`marks-row-${label}`} className="flex items-center gap-3 py-2">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30">
        {preview}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs">{title}</p>
        <p className="text-2xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={onPick}>
          <Upload className="mr-1 h-3.5 w-3.5" />
          {uploading ? '上传中…' : hasImage ? '更换' : '上传'}
        </Button>
        {hasImage ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={uploading}
            onClick={onRemove}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            移除
          </Button>
        ) : null}
      </div>
    </li>
  );

  return (
    <Card className="space-y-3 px-4 py-4">
      <CardHead title="操作提示" />
      <ul className="divide-y divide-border">
        {row(
          'mark',
          mark ? (
            <img
              src={fileUrlFromPath(mark.path)}
              alt="标记"
              className="h-full w-full object-contain"
            />
          ) : (
            <X className="h-4 w-4 text-muted-foreground" aria-hidden />
          ),
          '标记',
          mark ? '本主题里跟随的关卡都用这张' : '未配置，用内置的 ×',
          markBusy,
          mark !== null,
          () => markInputRef.current?.click(),
          () => removeMarkImage.mutate(),
          'mark',
        )}

        {GAME_TOOL_ICON_KINDS.map((kind) => {
          const current = icons[kind] ?? null;
          const Fallback = TOOL_ICON_FALLBACKS[kind];
          const uploading = uploadIcon.isPending && pendingIcon === kind;
          return row(
            kind,
            current ? (
              <img
                src={fileUrlFromPath(current.path)}
                alt={`${GAME_TOOL_ICON_LABELS[kind]}图标`}
                className="h-full w-full object-contain"
              />
            ) : (
              <Fallback className="h-4 w-4 text-muted-foreground" aria-hidden />
            ),
            GAME_TOOL_ICON_LABELS[kind],
            current ? '本主题里跟随的关卡都用这张' : '未配置，用内置图标',
            uploading,
            current !== null,
            () => {
              setPendingIcon(kind);
              iconInputRef.current?.click();
            },
            () => removeIcon.mutate(kind),
            kind,
          );
        })}

        {row(
          'ring',
          ring ? (
            <img
              src={fileUrlFromPath(ring.path)}
              alt="圆环"
              className="h-full w-full object-contain"
            />
          ) : (
            <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />
          ),
          '圆环',
          ring
            ? '按住放头像的进度环、提交后的校验环，都用这张'
            : '未配置，两处各用内置细弧',
          ringBusy,
          ring !== null,
          () => ringInputRef.current?.click(),
          () => removeRingImage.mutate(),
          'ring',
        )}
      </ul>

      {/*
       * 圆环那一项**同时管校验**，而校验还有两档颜色必须能改 —— 所以颜色紧跟在
       * 圆环下面，而不是另起一张卡：它们说的是同一件事（「怎么告诉你对错」）。
       */}
      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">校验通过</span>
          <ColorField
            label="校验通过色"
            value={checkStyle.passColor}
            commit={(next) => updateCheckStyle.mutate({ passColor: next })}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">校验未通过</span>
          <ColorField
            label="校验未通过色"
            value={checkStyle.failColor}
            commit={(next) => updateCheckStyle.mutate({ failColor: next })}
          />
        </div>
      </div>

      <p className="text-2xs leading-relaxed text-muted-foreground">
        谜题里单独上传过的仍用自己那张。圆环同时管「按住等放头像」与「提交后的校验」两处。
      </p>

      {/* 三个隐藏的 file input：一张图一个，按钮点它们、选完立刻上传。 */}
      <input
        ref={markInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          if (!file) return;
          uploadMark.mutate(file);
        }}
      />
      <input
        ref={iconInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          const kind = pendingIcon;
          setPendingIcon(null);
          if (!file || !kind) return;
          uploadIcon.mutate({ icon: kind, file });
        }}
      />
      <input
        ref={ringInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          if (!file) return;
          uploadRingImage.mutate(file);
        }}
      />
    </Card>
  );
}
