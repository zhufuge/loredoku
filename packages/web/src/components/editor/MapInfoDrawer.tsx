import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus, RotateCcw, Trash2, X } from 'lucide-react';
import {
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  LINKAGE_COLOR_LABEL_MAX_LENGTH,
  LINKAGE_COLOR_MAX_COUNT,
  LINKAGE_COLOR_MIN_COUNT,
  MAP_STYLE_CELL_SIZE_MAX,
  MAP_STYLE_CELL_SIZE_MIN,
  MAP_STYLE_LINE_WIDTH_MAX,
  MAP_STYLE_LINE_WIDTH_MIN,
  MAP_STYLE_OPERATION_OFFSET_MAX,
  MAP_STYLE_OPERATION_OFFSET_MIN,
  MAP_STYLE_REGION_LABEL_FONT_MAX,
  MAP_STYLE_REGION_LABEL_FONT_MIN,
  MAP_STYLE_REGION_LABEL_STROKE_MAX,
  MAP_STYLE_REGION_LABEL_STROKE_MIN,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  type CharacterSlotEntry,
  type MapLinkageColor,
  type MapStyle,
  type MapStyleLine,
} from '@murdoku/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  clampCellSize,
  clampLineWidth,
  clampOperationOffset,
  clampRegionBorderWidth,
  clampRegionLabelFont,
  clampRegionLabelStroke,
  countLinkageColorUsage,
  isValidStyleColor,
  nextLinkageKey,
} from '@/lib/mapStyle';

/** Suggested colours for newly added palette entries (FEAT-D04). */
const NEW_COLOR_SUGGESTIONS = ['#FFD166', '#A5D6A7', '#F48FB1', '#B0BEC5', '#CE93D8', '#80DEEA'];

interface MapInfoDrawerProps {
  open: boolean;
  onClose: () => void;
  gridSize: number;
  /** The value the adaptive pass currently computes (FEAT-D03 default). */
  autoCellSize: number;
  style: MapStyle;
  characterSlots: Array<CharacterSlotEntry | null>;
  onSetStyle: (updater: (style: MapStyle) => MapStyle) => void;
  onSetCellSize: (value: number | null) => void;
  onApplyRegionBorder: (patch: Partial<MapStyleLine>) => void;
  onSetLinkageColors: (colors: MapLinkageColor[]) => void;
  onRemoveLinkageColor: (key: string) => void;
  /** FEAT-D02: `n` reuses the toolbar's resize flow (with the removal preview). */
  onRequestResize: (gridSize: number) => void;
}

/**
 * A number input that keeps a local draft while typing and commits once the
 * field loses focus (or Enter is pressed), so a single edit is a single undo
 * step instead of one per keystroke.
 */
function NumberField({
  id,
  value,
  min,
  max,
  step = 1,
  suffix,
  commit,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  commit: (value: number) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const flush = (): void => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    commit(parsed);
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={flush}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            flush();
          }
        }}
        className="h-7 w-16 text-xs tabular-nums"
      />
      {suffix ? <span className="text-[10px] text-muted-foreground">{suffix}</span> : null}
    </div>
  );
}

/**
 * A short text input with the same draft-then-commit behaviour as
 * {@link NumberField} — the palette label must not push one undo step per
 * keystroke.
 */
function TextField({
  value,
  maxLength,
  ariaLabel,
  commit,
}: {
  value: string;
  maxLength?: number;
  ariaLabel?: string;
  commit: (value: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const flush = (): void => {
    const next = draft.trim();
    if (next.length === 0 || next === value) {
      setDraft(value);
      return;
    }
    commit(next);
  };

  return (
    <Input
      value={draft}
      maxLength={maxLength}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={flush}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          flush();
        }
      }}
      className="h-7 w-16 text-xs"
    />
  );
}

/** `#RRGGBB` swatch with a native picker. */
function ColorField({
  id,
  value,
  commit,
}: {
  id: string;
  value: string;
  commit: (value: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const flush = (): void => {
    if (isValidStyleColor(draft)) commit(draft.trim().toUpperCase());
    else setDraft(value);
  };

  return (
    <div className="flex items-center gap-1">
      <input
        id={id}
        type="color"
        value={isValidStyleColor(value) ? value : '#000000'}
        onChange={(event) => commit(event.target.value.toUpperCase())}
        className="h-7 w-8 cursor-pointer rounded border bg-transparent"
        aria-label="选择颜色"
      />
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={flush}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            flush();
          }
        }}
        className="h-7 w-24 font-mono text-[11px]"
      />
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[11px] font-normal text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="space-y-2 border-b px-4 py-3 last:border-b-0">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/**
 * v0.3.8 FEAT-D01/D02 (docs/v0.3.8.md §2): the 「地图基本信息」drawer. Every
 * control writes the map-level default and is undoable.
 */
export function MapInfoDrawer({
  open,
  onClose,
  gridSize,
  autoCellSize,
  style,
  characterSlots,
  onSetStyle,
  onSetCellSize,
  onApplyRegionBorder,
  onSetLinkageColors,
  onRemoveLinkageColor,
  onRequestResize,
}: MapInfoDrawerProps): JSX.Element {
  const [deleteColorKey, setDeleteColorKey] = useState<string | null>(null);

  const cellSizeValue = style.cellSize ?? autoCellSize;
  const linkageColors = style.linkageColors;
  const usage = useMemo(
    () =>
      new Map(
        linkageColors.map((entry) => [
          entry.key,
          countLinkageColorUsage(characterSlots, entry.key),
        ]),
      ),
    [linkageColors, characterSlots],
  );
  const deleteUsage = deleteColorKey ? (usage.get(deleteColorKey) ?? 0) : 0;

  const patchLine = (
    key: 'canvasFrame' | 'border' | 'regionHighlight',
    patch: Partial<MapStyleLine>,
  ): void =>
    onSetStyle((current) => {
      if (key === 'canvasFrame') {
        return { ...current, canvasFrame: { ...current.canvasFrame, ...patch } };
      }
      if (key === 'border') {
        return { ...current, border: { ...current.border, ...patch } };
      }
      return { ...current, regionHighlight: { ...current.regionHighlight, ...patch } };
    });

  const addColor = (): void => {
    if (linkageColors.length >= LINKAGE_COLOR_MAX_COUNT) return;
    const suggestion = NEW_COLOR_SUGGESTIONS[linkageColors.length % NEW_COLOR_SUGGESTIONS.length]!;
    onSetLinkageColors([
      ...linkageColors,
      { key: nextLinkageKey(linkageColors), label: `色 ${linkageColors.length + 1}`, color: suggestion },
    ]);
  };

  const renameColor = (key: string, label: string): void =>
    onSetLinkageColors(
      linkageColors.map((entry) =>
        entry.key === key
          ? { ...entry, label: label.slice(0, LINKAGE_COLOR_LABEL_MAX_LENGTH) || entry.key }
          : entry,
      ),
    );

  const recolor = (key: string, color: string): void =>
    onSetLinkageColors(
      linkageColors.map((entry) => (entry.key === key ? { ...entry, color } : entry)),
    );

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        'absolute inset-y-0 right-0 z-30 flex w-80 max-w-[85vw] flex-col border-l bg-background/95 shadow-xl backdrop-blur transition-transform duration-200',
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
      )}
    >
      <header className="flex h-11 shrink-0 items-center justify-between border-b px-4">
        <span className="text-sm font-semibold">地图基本信息</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
          title="关闭"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ---- 画布 ---- */}
        <Section title="画布">
          <Row label="画布尺寸 n">
            <div className="flex items-center gap-1">
              <NumberField
                id="map-info-grid-size"
                value={gridSize}
                min={GRID_SIZE_MIN}
                max={GRID_SIZE_MAX}
                commit={(value) => {
                  const next = Math.min(GRID_SIZE_MAX, Math.max(GRID_SIZE_MIN, Math.round(value)));
                  if (next !== gridSize) onRequestResize(next);
                }}
              />
              <span className="text-[10px] text-muted-foreground">
                {GRID_SIZE_MIN}~{GRID_SIZE_MAX}
              </span>
            </div>
          </Row>
          <Row label="方格大小">
            <div className="flex items-center gap-1">
              <NumberField
                id="map-info-cell-size"
                value={cellSizeValue}
                min={MAP_STYLE_CELL_SIZE_MIN}
                max={MAP_STYLE_CELL_SIZE_MAX}
                suffix="px"
                commit={(value) => onSetCellSize(clampCellSize(value))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={
                  style.cellSize === null ? '当前已是自适应' : `恢复自适应（当前自适应值 ${autoCellSize}px）`
                }
                disabled={style.cellSize === null}
                onClick={() => onSetCellSize(null)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Row>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            自适应计算值 {autoCellSize}px，范围 {MAP_STYLE_CELL_SIZE_MIN}~{MAP_STYLE_CELL_SIZE_MAX}px。
            {style.cellSize === null
              ? ' 当前为自适应，窗口尺寸变化会重新计算。'
              : ' 已手动指定，窗口尺寸变化不再改变方格大小。'}
          </p>
        </Section>

        {/* ---- 线条 ---- */}
        <Section title="线条">
          <Row label="地图最外边框">
            <div className="flex items-center gap-1">
              <NumberField
                id="map-info-frame-width"
                value={style.canvasFrame.width}
                min={MAP_STYLE_LINE_WIDTH_MIN}
                max={MAP_STYLE_LINE_WIDTH_MAX}
                commit={(value) => patchLine('canvasFrame', { width: clampLineWidth(value) })}
              />
              <ColorField
                id="map-info-frame-color"
                value={style.canvasFrame.color}
                commit={(value) => patchLine('canvasFrame', { color: value })}
              />
            </div>
          </Row>

          <Row label="边框 border">
            <div className="flex items-center gap-1">
              <NumberField
                id="map-info-border-width"
                value={style.border.width}
                min={MAP_STYLE_LINE_WIDTH_MIN}
                max={MAP_STYLE_LINE_WIDTH_MAX}
                commit={(value) => patchLine('border', { width: clampLineWidth(value) })}
              />
              <ColorField
                id="map-info-border-color"
                value={style.border.color}
                commit={(value) => patchLine('border', { color: value })}
              />
            </div>
          </Row>

          <div className="space-y-1.5 rounded-md border p-2">
            <span className="text-[11px] font-medium">当前鼠标所在框</span>
            <Row label="线宽">
              <NumberField
                id="map-info-mouse-width"
                value={style.mouseCursor.width}
                min={MAP_STYLE_LINE_WIDTH_MIN}
                max={MAP_STYLE_LINE_WIDTH_MAX}
                commit={(value) =>
                  onSetStyle((current) => ({
                    ...current,
                    mouseCursor: { ...current.mouseCursor, width: clampLineWidth(value) },
                  }))
                }
              />
            </Row>
            <Row label="颜色">
              <ColorField
                id="map-info-mouse-color"
                value={style.mouseCursor.color}
                commit={(value) =>
                  onSetStyle((current) => ({
                    ...current,
                    mouseCursor: { ...current.mouseCursor, color: value },
                  }))
                }
              />
            </Row>
            <Row label="阻挡色">
              <ColorField
                id="map-info-mouse-blocked"
                value={style.mouseCursor.blockedColor}
                commit={(value) =>
                  onSetStyle((current) => ({
                    ...current,
                    mouseCursor: { ...current.mouseCursor, blockedColor: value },
                  }))
                }
              />
            </Row>
            <Row label="阴影环">
              <ColorField
                id="map-info-mouse-shadow"
                value={
                  isValidStyleColor(style.mouseCursor.shadowColor)
                    ? style.mouseCursor.shadowColor
                    : '#000000'
                }
                commit={(value) =>
                  onSetStyle((current) => ({
                    ...current,
                    mouseCursor: { ...current.mouseCursor, shadowColor: value },
                  }))
                }
              />
            </Row>
          </div>

          <div className="space-y-1.5 rounded-md border p-2">
            <span className="text-[11px] font-medium">当前操作方格框</span>
            <Row label="线宽">
              <NumberField
                id="map-info-op-width"
                value={style.operationCursor.width}
                min={MAP_STYLE_LINE_WIDTH_MIN}
                max={MAP_STYLE_LINE_WIDTH_MAX}
                commit={(value) =>
                  onSetStyle((current) => ({
                    ...current,
                    operationCursor: {
                      ...current.operationCursor,
                      width: clampLineWidth(value),
                    },
                  }))
                }
              />
            </Row>
            <Row label="颜色">
              <ColorField
                id="map-info-op-color"
                value={style.operationCursor.color}
                commit={(value) =>
                  onSetStyle((current) => ({
                    ...current,
                    operationCursor: { ...current.operationCursor, color: value },
                  }))
                }
              />
            </Row>
            <Row label="外扩距离">
              <NumberField
                id="map-info-op-offset"
                value={style.operationCursor.offset}
                min={MAP_STYLE_OPERATION_OFFSET_MIN}
                max={MAP_STYLE_OPERATION_OFFSET_MAX}
                suffix="px"
                commit={(value) =>
                  onSetStyle((current) => ({
                    ...current,
                    operationCursor: {
                      ...current.operationCursor,
                      offset: clampOperationOffset(value),
                    },
                  }))
                }
              />
            </Row>
          </div>

          <Row label="区域边界线">
            <div className="flex items-center gap-1">
              <NumberField
                id="map-info-region-border-width"
                value={style.regionBorder.width}
                min={REGION_BORDER_WIDTH_MIN}
                max={REGION_BORDER_WIDTH_MAX}
                commit={(value) =>
                  onApplyRegionBorder({ width: clampRegionBorderWidth(value) })
                }
              />
              <ColorField
                id="map-info-region-border-color"
                value={style.regionBorder.color}
                commit={(value) => onApplyRegionBorder({ color: value })}
              />
            </div>
          </Row>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            区域边界线为地图级样式：改色对所有区域立即生效；改线宽会同步写入所有现存区域，
            并成为新建区域的缺省值。区域颜色仍用于区域填充。
          </p>

          <Row label="区域高亮线">
            <div className="flex items-center gap-1">
              <NumberField
                id="map-info-region-highlight-width"
                value={style.regionHighlight.width}
                min={MAP_STYLE_LINE_WIDTH_MIN}
                max={MAP_STYLE_LINE_WIDTH_MAX}
                commit={(value) =>
                  patchLine('regionHighlight', { width: clampLineWidth(value) })
                }
              />
              <ColorField
                id="map-info-region-highlight-color"
                value={style.regionHighlight.color}
                commit={(value) => patchLine('regionHighlight', { color: value })}
              />
            </div>
          </Row>
        </Section>

        {/* ---- 区域名称 ---- */}
        <Section title="区域名称">
          <Row label="字体大小">
            <NumberField
              id="map-info-label-font"
              value={style.regionLabel.fontSize}
              min={MAP_STYLE_REGION_LABEL_FONT_MIN}
              max={MAP_STYLE_REGION_LABEL_FONT_MAX}
              suffix="px"
              commit={(value) =>
                onSetStyle((current) => ({
                  ...current,
                  regionLabel: { ...current.regionLabel, fontSize: clampRegionLabelFont(value) },
                }))
              }
            />
          </Row>
          <Row label="描边大小">
            <NumberField
              id="map-info-label-stroke"
              value={style.regionLabel.strokeWidth}
              min={MAP_STYLE_REGION_LABEL_STROKE_MIN}
              max={MAP_STYLE_REGION_LABEL_STROKE_MAX}
              suffix="px"
              commit={(value) =>
                onSetStyle((current) => ({
                  ...current,
                  regionLabel: {
                    ...current.regionLabel,
                    strokeWidth: clampRegionLabelStroke(value),
                  },
                }))
              }
            />
          </Row>
          <Row label="字体颜色">
            <ColorField
              id="map-info-label-color"
              value={style.regionLabel.color}
              commit={(value) =>
                onSetStyle((current) => ({
                  ...current,
                  regionLabel: { ...current.regionLabel, color: value },
                }))
              }
            />
          </Row>
          <Row label="描边颜色">
            <ColorField
              id="map-info-label-stroke-color"
              value={style.regionLabel.strokeColor}
              commit={(value) =>
                onSetStyle((current) => ({
                  ...current,
                  regionLabel: { ...current.regionLabel, strokeColor: value },
                }))
              }
            />
          </Row>
          <Row label="高亮字体颜色">
            <ColorField
              id="map-info-label-hover-color"
              value={style.regionLabel.hoverColor}
              commit={(value) =>
                onSetStyle((current) => ({
                  ...current,
                  regionLabel: { ...current.regionLabel, hoverColor: value },
                }))
              }
            />
          </Row>
          <Row label="高亮描边颜色">
            <ColorField
              id="map-info-label-hover-stroke"
              value={style.regionLabel.hoverStrokeColor}
              commit={(value) =>
                onSetStyle((current) => ({
                  ...current,
                  regionLabel: { ...current.regionLabel, hoverStrokeColor: value },
                }))
              }
            />
          </Row>
          <Row label="高亮字体大小">
            <NumberField
              id="map-info-label-hover-font"
              value={style.regionLabel.hoverFontSize}
              min={MAP_STYLE_REGION_LABEL_FONT_MIN}
              max={MAP_STYLE_REGION_LABEL_FONT_MAX}
              suffix="px"
              commit={(value) =>
                onSetStyle((current) => ({
                  ...current,
                  regionLabel: {
                    ...current.regionLabel,
                    hoverFontSize: clampRegionLabelFont(value),
                  },
                }))
              }
            />
          </Row>
        </Section>

        {/* ---- 联动主题色 ---- */}
        <Section title="联动主题色">
          <ul className="space-y-1.5">
            {linkageColors.map((entry) => (
              <li key={entry.key} className="flex items-center gap-1">
                <ColorField
                  id={`map-info-linkage-${entry.key}`}
                  value={entry.color}
                  commit={(value) => recolor(entry.key, value)}
                />
                <TextField
                  value={entry.label}
                  maxLength={LINKAGE_COLOR_LABEL_MAX_LENGTH}
                  ariaLabel={`${entry.key} 名称`}
                  commit={(next) => renameColor(entry.key, next)}
                />
                <span className="w-14 shrink-0 font-mono text-[10px] text-muted-foreground">
                  {entry.key}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  title={
                    linkageColors.length <= LINKAGE_COLOR_MIN_COUNT
                      ? `至少保留 ${LINKAGE_COLOR_MIN_COUNT} 项`
                      : '删除该颜色'
                  }
                  disabled={linkageColors.length <= LINKAGE_COLOR_MIN_COUNT}
                  onClick={() => {
                    if (countLinkageColorUsage(characterSlots, entry.key) > 0) {
                      setDeleteColorKey(entry.key);
                      return;
                    }
                    onRemoveLinkageColor(entry.key);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-full text-[11px]"
            disabled={linkageColors.length >= LINKAGE_COLOR_MAX_COUNT}
            onClick={addColor}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            新增颜色（{linkageColors.length}/{LINKAGE_COLOR_MAX_COUNT}）
          </Button>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            默认至少包含红、蓝两项。删除被联动引用的颜色时会把相关联动改指向剩余的第一项。
          </p>
        </Section>
      </div>

      <AlertDialog
        open={deleteColorKey !== null}
        onOpenChange={(next) => !next && setDeleteColorKey(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该联动主题色？</AlertDialogTitle>
            <AlertDialogDescription>
              已有 {deleteUsage} 处联动使用「
              {linkageColors.find((entry) => entry.key === deleteColorKey)?.label ?? deleteColorKey}
              」，删除后这些联动会改为使用剩余的第一项颜色。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteColorKey) onRemoveLinkageColor(deleteColorKey);
                setDeleteColorKey(null);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
