import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
  MAP_STYLE_RULER_FONT_MAX,
  MAP_STYLE_RULER_FONT_MIN,
  MAP_STYLE_RULER_GAP_MAX,
  MAP_STYLE_RULER_GAP_MIN,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  type CharacterSlotEntry,
  type MapStyle,
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
  clampRulerFontSize,
  clampRulerGap,
  countLinkageColorUsage,
  isValidShadowColor,
  isValidStyleColor,
  mapStyleEquals,
  nextLinkageKey,
} from '@/lib/mapStyle';

/** Suggested colours for newly added palette entries (FEAT-D04). */
const NEW_COLOR_SUGGESTIONS = ['#FFD166', '#A5D6A7', '#F48FB1', '#B0BEC5', '#CE93D8', '#80DEEA'];

/** Imperative surface used by `EditorPage` to gate drawer switches. */
export interface MapInfoDrawerHandle {
  /** True while the draft differs from the committed style. */
  isDirty: () => boolean;
  /** Commits the draft (same as pressing 保存). */
  save: () => void;
  /** Drops the draft and re-reads the committed style. */
  discard: () => void;
}

interface MapInfoDrawerProps {
  open: boolean;
  gridSize: number;
  /** The value the adaptive pass currently computes (FEAT-D03 default). */
  autoCellSize: number;
  /** The committed style — the drawer edits a copy of it. */
  style: MapStyle;
  characterSlots: Array<CharacterSlotEntry | null>;
  /**
   * FEAT-E01: the drawer never closes itself. Both × and 取消 call this, and
   * `EditorPage` decides whether to prompt for unsaved edits first.
   */
  onRequestClose: () => void;
  /** Applies the draft. `EditorPage` closes the drawer afterwards. */
  onCommit: (style: MapStyle) => void;
  /** FEAT-D02: `n` reuses the toolbar's resize flow (with the removal preview). */
  onRequestResize: (gridSize: number) => void;
  /** FEAT-E01: reports the dirty flag so the parent can gate drawer switches. */
  onDirtyChange?: (dirty: boolean) => void;
}

/** Draft-then-commit wrapper so the store is only touched on 保存. */
function useDraft<T>(source: T, open: boolean): [T, (next: T | ((current: T) => T)) => void] {
  const [draft, setDraft] = useState<T>(source);
  useEffect(() => {
    // Re-seed on every open so a cancelled edit never leaks into the next one.
    if (open) setDraft(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return [draft, setDraft];
}

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
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[11px] font-normal text-muted-foreground" title={hint}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="space-y-2 border-b px-4 py-3 last:border-b-0">
      <h3 className="text-xs font-semibold text-foreground" title={hint}>
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/**
 * v0.3.8 FEAT-D01/D02 + v0.3.9 FEAT-E01 (docs/v0.3.9.md §3): the
 * 「地图基本信息」drawer.
 *
 * The drawer is a **form**: every control edits a local draft, the canvas only
 * changes when 保存 is pressed, and 取消 / × / switching to another info panel
 * ask for confirmation first (the parent owns that dialog). Layer names follow
 * 《画布图层优先级规范》§1.
 */
export const MapInfoDrawer = forwardRef<MapInfoDrawerHandle, MapInfoDrawerProps>(
  function MapInfoDrawer(
    {
      open,
      gridSize,
      autoCellSize,
      style,
      characterSlots,
      onRequestClose,
      onCommit,
      onRequestResize,
      onDirtyChange,
    },
    ref,
  ): JSX.Element {
    const [draft, setDraft] = useDraft<MapStyle>(style, open);
    const [deleteColorKey, setDeleteColorKey] = useState<string | null>(null);
    /**
     * Set while committing / discarding. `style` only reaches this component on
     * the next render, so without this the (stale) dirty flag would still read
     * `true` when the parent immediately runs a deferred switch.
     */
    const settledRef = useRef(false);

    const dirty = !mapStyleEquals(draft, style);
    const latest = useRef({ draft, style, dirty });
    latest.current = { draft, style, dirty };

    useEffect(() => {
      if (open) settledRef.current = false;
    }, [open]);

    useEffect(() => {
      onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    useImperativeHandle(
      ref,
      () => ({
        isDirty: () => !settledRef.current && latest.current.dirty,
        save: () => {
          const { draft: current, dirty: isDirty } = latest.current;
          settledRef.current = true;
          if (isDirty) onCommit(current);
          else onRequestClose();
        },
        discard: () => {
          settledRef.current = true;
          setDraft(latest.current.style);
        },
      }),
      [onCommit, onRequestClose, setDraft],
    );

    const patch = (updater: (current: MapStyle) => MapStyle): void =>
      setDraft((current) => updater(current));

    const cellSizeValue = draft.cellSize ?? autoCellSize;
    const linkageColors = draft.linkageColors;
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

    const addColor = (): void => {
      if (linkageColors.length >= LINKAGE_COLOR_MAX_COUNT) return;
      const suggestion = NEW_COLOR_SUGGESTIONS[linkageColors.length % NEW_COLOR_SUGGESTIONS.length]!;
      patch((current) => ({
        ...current,
        linkageColors: [
          ...current.linkageColors,
          {
            key: nextLinkageKey(current.linkageColors),
            label: `色 ${current.linkageColors.length + 1}`,
            color: suggestion,
          },
        ],
      }));
    };

    const renameColor = (key: string, label: string): void =>
      patch((current) => ({
        ...current,
        linkageColors: current.linkageColors.map((entry) =>
          entry.key === key
            ? { ...entry, label: label.slice(0, LINKAGE_COLOR_LABEL_MAX_LENGTH) || entry.key }
            : entry,
        ),
      }));

    const recolor = (key: string, color: string): void =>
      patch((current) => ({
        ...current,
        linkageColors: current.linkageColors.map((entry) =>
          entry.key === key ? { ...entry, color } : entry,
        ),
      }));

    const removeColor = (key: string): void =>
      patch((current) => ({
        ...current,
        linkageColors: current.linkageColors.filter((entry) => entry.key !== key),
      }));

    return (
      <aside
        aria-hidden={!open}
        data-testid="map-info-drawer"
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
            onClick={onRequestClose}
            title="关闭（有未保存修改时会先确认）"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* ---- 画布 ---- */}
          <Section title="画布">
            <Row label="画布尺寸" hint="Canvas Size">
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
            </Row>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              调整画布尺寸会先弹出确认，确认时会先保存草稿。
            </p>
            <Row label="方格大小" hint="Cell Size">
              <div className="flex items-center gap-1">
                <NumberField
                  id="map-info-cell-size"
                  value={cellSizeValue}
                  min={MAP_STYLE_CELL_SIZE_MIN}
                  max={MAP_STYLE_CELL_SIZE_MAX}
                  suffix="px"
                  commit={(value) =>
                    patch((current) => ({ ...current, cellSize: clampCellSize(value) }))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title={
                    draft.cellSize === null
                      ? '当前已是自适应'
                      : `恢复自适应（当前自适应值 ${autoCellSize}px）`
                  }
                  disabled={draft.cellSize === null}
                  onClick={() => patch((current) => ({ ...current, cellSize: null }))}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Row>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              自适应计算值 {autoCellSize}px；范围 {MAP_STYLE_CELL_SIZE_MIN}~
              {MAP_STYLE_CELL_SIZE_MAX}px。
              {draft.cellSize === null
                ? ' 当前为自适应，窗口尺寸变化会重新计算。'
                : ' 已手动指定，窗口尺寸变化不再改变方格大小。'}
            </p>
          </Section>

          {/* ---- 线条 ---- */}
          <Section title="线条">
            <Row label="画布外框" hint="Canvas Frame — the board's outermost frame">
              <div className="flex items-center gap-1">
                <NumberField
                  id="map-info-frame-width"
                  value={draft.canvasFrame.width}
                  min={MAP_STYLE_LINE_WIDTH_MIN}
                  max={MAP_STYLE_LINE_WIDTH_MAX}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      canvasFrame: { ...current.canvasFrame, width: clampLineWidth(value) },
                    }))
                  }
                />
                <ColorField
                  id="map-info-frame-color"
                  value={draft.canvasFrame.color}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      canvasFrame: { ...current.canvasFrame, color: value },
                    }))
                  }
                />
              </div>
            </Row>

            <Row label="网格分隔线" hint="Grid Separator — the lines between cells">
              <div className="flex items-center gap-1">
                <NumberField
                  id="map-info-grid-separator-width"
                  value={draft.gridSeparator.width}
                  min={MAP_STYLE_LINE_WIDTH_MIN}
                  max={MAP_STYLE_LINE_WIDTH_MAX}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      gridSeparator: { ...current.gridSeparator, width: clampLineWidth(value) },
                    }))
                  }
                />
                <ColorField
                  id="map-info-grid-separator-color"
                  value={draft.gridSeparator.color}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      gridSeparator: { ...current.gridSeparator, color: value },
                    }))
                  }
                />
              </div>
            </Row>

            <div className="space-y-1.5 rounded-md border p-2">
              <span className="text-[11px] font-medium" title="Mouse Cursor Box">
                鼠标光标框
              </span>
              <Row label="线宽">
                <NumberField
                  id="map-info-mouse-width"
                  value={draft.mouseCursorBox.width}
                  min={MAP_STYLE_LINE_WIDTH_MIN}
                  max={MAP_STYLE_LINE_WIDTH_MAX}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      mouseCursorBox: { ...current.mouseCursorBox, width: clampLineWidth(value) },
                    }))
                  }
                />
              </Row>
              <Row label="颜色">
                <ColorField
                  id="map-info-mouse-color"
                  value={draft.mouseCursorBox.color}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      mouseCursorBox: { ...current.mouseCursorBox, color: value },
                    }))
                  }
                />
              </Row>
              <Row label="阻挡色">
                <ColorField
                  id="map-info-mouse-blocked"
                  value={draft.mouseCursorBox.blockedColor}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      mouseCursorBox: { ...current.mouseCursorBox, blockedColor: value },
                    }))
                  }
                />
              </Row>
              <Row label="阴影环">
                <div className="flex items-center gap-1">
                  <input
                    type="color"
                    value={
                      isValidStyleColor(draft.mouseCursorBox.shadowColor)
                        ? draft.mouseCursorBox.shadowColor
                        : '#000000'
                    }
                    onChange={(event) =>
                      patch((current) => ({
                        ...current,
                        mouseCursorBox: {
                          ...current.mouseCursorBox,
                          shadowColor: event.target.value.toUpperCase(),
                        },
                      }))
                    }
                    className="h-7 w-8 cursor-pointer rounded border bg-transparent"
                    aria-label="阴影环颜色"
                  />
                  <Input
                    value={draft.mouseCursorBox.shadowColor}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!isValidShadowColor(value)) return;
                      patch((current) => ({
                        ...current,
                        mouseCursorBox: { ...current.mouseCursorBox, shadowColor: value },
                      }));
                    }}
                    className="h-7 w-24 font-mono text-[11px]"
                  />
                </div>
              </Row>
            </div>

            <div className="space-y-1.5 rounded-md border p-2">
              <span className="text-[11px] font-medium" title="Operation Cursor Box">
                操作光标框
              </span>
              <Row label="线宽">
                <NumberField
                  id="map-info-op-width"
                  value={draft.operationCursorBox.width}
                  min={MAP_STYLE_LINE_WIDTH_MIN}
                  max={MAP_STYLE_LINE_WIDTH_MAX}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      operationCursorBox: {
                        ...current.operationCursorBox,
                        width: clampLineWidth(value),
                      },
                    }))
                  }
                />
              </Row>
              <Row label="颜色">
                <ColorField
                  id="map-info-op-color"
                  value={draft.operationCursorBox.color}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      operationCursorBox: { ...current.operationCursorBox, color: value },
                    }))
                  }
                />
              </Row>
              <Row label="外扩距离">
                <NumberField
                  id="map-info-op-offset"
                  value={draft.operationCursorBox.offset}
                  min={MAP_STYLE_OPERATION_OFFSET_MIN}
                  max={MAP_STYLE_OPERATION_OFFSET_MAX}
                  suffix="px"
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      operationCursorBox: {
                        ...current.operationCursorBox,
                        offset: clampOperationOffset(value),
                      },
                    }))
                  }
                />
              </Row>
            </div>

            <Row label="区域轮廓线" hint="Region Outline — the contour of a region">
              <div className="flex items-center gap-1">
                <NumberField
                  id="map-info-region-outline-width"
                  value={draft.regionOutline.width}
                  min={REGION_BORDER_WIDTH_MIN}
                  max={REGION_BORDER_WIDTH_MAX}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      regionOutline: {
                        ...current.regionOutline,
                        width: clampRegionBorderWidth(value),
                      },
                    }))
                  }
                />
                <ColorField
                  id="map-info-region-outline-color"
                  value={draft.regionOutline.color}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      regionOutline: { ...current.regionOutline, color: value },
                    }))
                  }
                />
              </div>
            </Row>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              区域轮廓线为地图级样式：改色对所有区域生效；改线宽会同步写入所有现存区域，并成为新建区域的
              缺省值。区域自身的颜色仍用于区域填充。
            </p>

            <Row label="区域高亮线" hint="Region Highlight — shown while a region is active">
              <div className="flex items-center gap-1">
                <NumberField
                  id="map-info-region-highlight-width"
                  value={draft.regionHighlight.width}
                  min={MAP_STYLE_LINE_WIDTH_MIN}
                  max={MAP_STYLE_LINE_WIDTH_MAX}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      regionHighlight: {
                        ...current.regionHighlight,
                        width: clampLineWidth(value),
                      },
                    }))
                  }
                />
                <ColorField
                  id="map-info-region-highlight-color"
                  value={draft.regionHighlight.color}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      regionHighlight: { ...current.regionHighlight, color: value },
                    }))
                  }
                />
              </div>
            </Row>
          </Section>

          {/* ---- 区域标签 ---- */}
          <Section title="区域标签" hint="Region Label">
            <Row label="字体大小">
              <NumberField
                id="map-info-label-font"
                value={draft.regionLabel.fontSize}
                min={MAP_STYLE_REGION_LABEL_FONT_MIN}
                max={MAP_STYLE_REGION_LABEL_FONT_MAX}
                suffix="px"
                commit={(value) =>
                  patch((current) => ({
                    ...current,
                    regionLabel: {
                      ...current.regionLabel,
                      fontSize: clampRegionLabelFont(value),
                    },
                  }))
                }
              />
            </Row>
            <Row label="描边大小">
              <NumberField
                id="map-info-label-stroke"
                value={draft.regionLabel.strokeWidth}
                min={MAP_STYLE_REGION_LABEL_STROKE_MIN}
                max={MAP_STYLE_REGION_LABEL_STROKE_MAX}
                suffix="px"
                commit={(value) =>
                  patch((current) => ({
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
                value={draft.regionLabel.color}
                commit={(value) =>
                  patch((current) => ({
                    ...current,
                    regionLabel: { ...current.regionLabel, color: value },
                  }))
                }
              />
            </Row>
            <Row label="描边颜色">
              <ColorField
                id="map-info-label-stroke-color"
                value={draft.regionLabel.strokeColor}
                commit={(value) =>
                  patch((current) => ({
                    ...current,
                    regionLabel: { ...current.regionLabel, strokeColor: value },
                  }))
                }
              />
            </Row>
            <Row label="高亮字体大小">
              <NumberField
                id="map-info-label-hover-font"
                value={draft.regionLabel.hoverFontSize}
                min={MAP_STYLE_REGION_LABEL_FONT_MIN}
                max={MAP_STYLE_REGION_LABEL_FONT_MAX}
                suffix="px"
                commit={(value) =>
                  patch((current) => ({
                    ...current,
                    regionLabel: {
                      ...current.regionLabel,
                      hoverFontSize: clampRegionLabelFont(value),
                    },
                  }))
                }
              />
            </Row>
            <Row label="高亮字体颜色">
              <ColorField
                id="map-info-label-hover-color"
                value={draft.regionLabel.hoverColor}
                commit={(value) =>
                  patch((current) => ({
                    ...current,
                    regionLabel: { ...current.regionLabel, hoverColor: value },
                  }))
                }
              />
            </Row>
            <Row label="高亮描边颜色">
              <ColorField
                id="map-info-label-hover-stroke"
                value={draft.regionLabel.hoverStrokeColor}
                commit={(value) =>
                  patch((current) => ({
                    ...current,
                    regionLabel: { ...current.regionLabel, hoverStrokeColor: value },
                  }))
                }
              />
            </Row>
          </Section>

          {/* ---- 标尺 ---- */}
          <Section title="标尺" hint="Ruler">
            <Row label="文本大小" hint="Ruler Font Size">
              <NumberField
                id="map-info-ruler-font"
                value={draft.ruler.fontSize}
                min={MAP_STYLE_RULER_FONT_MIN}
                max={MAP_STYLE_RULER_FONT_MAX}
                suffix="px"
                commit={(value) =>
                  patch((current) => ({
                    ...current,
                    ruler: { ...current.ruler, fontSize: clampRulerFontSize(value) },
                  }))
                }
              />
            </Row>
            <Row label="文本到地图的间距" hint="Ruler Gap — text→board distance">
              <NumberField
                id="map-info-ruler-gap"
                value={draft.ruler.gap}
                min={MAP_STYLE_RULER_GAP_MIN}
                max={MAP_STYLE_RULER_GAP_MAX}
                suffix="px"
                commit={(value) =>
                  patch((current) => ({
                    ...current,
                    ruler: { ...current.ruler, gap: clampRulerGap(value) },
                  }))
                }
              />
            </Row>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              标尺文本随方格尺寸等比缩放；操作格所在行列比普通文本大 2px。
            </p>
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
                      removeColor(entry.key);
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
              默认至少包含红、蓝两项。删除被联动引用的颜色前会先确认。
            </p>
          </Section>
        </div>

        {/* ---- FEAT-E01: 取消 / 保存 并列固定在底部 ---- */}
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t bg-background px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onRequestClose}>
            取消
          </Button>
          <Button type="button" size="sm" disabled={!dirty} onClick={() => onCommit(draft)}>
            保存
          </Button>
        </footer>

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
                」。删除后这些联动会失去颜色，请在保存前为它们重新指定。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleteColorKey) removeColor(deleteColorKey);
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
  },
);
