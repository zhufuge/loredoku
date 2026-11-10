import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { RotateCcw, X } from 'lucide-react';
import {
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  MAP_STYLE_CELL_SIZE_MAX,
  MAP_STYLE_CELL_SIZE_MIN,
  MAP_STYLE_ITEM_OUTLINE_WIDTH_MAX,
  MAP_STYLE_ITEM_OUTLINE_WIDTH_MIN,
  MAP_STYLE_LINE_WIDTH_MAX,
  MAP_STYLE_LINE_WIDTH_MIN,
  MAP_STYLE_OPERATION_OFFSET_MAX,
  MAP_STYLE_OPERATION_OFFSET_MIN,
  MAP_STYLE_RULER_FONT_MAX,
  MAP_STYLE_RULER_FONT_MIN,
  MAP_STYLE_RULER_GAP_MAX,
  MAP_STYLE_RULER_GAP_MIN,
  MAP_STYLE_SHADOW_OFFSET_MAX,
  MAP_STYLE_SHADOW_OFFSET_MIN,
  UI_Z,
  type MapStyle,
  type RegionStyle,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { ColorInput } from '@/components/ui/color-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CoverPicker } from '@/components/common/CoverPicker';
import { ColorField } from '@/components/ui/color-input';
import { Hint, NumberField, Row } from '@/components/map-editor/StyleFields';
import { RegionStyleEditor } from '@/components/map-editor/RegionStyleEditor';
import { ThemeStyleRow } from '@/components/map-editor/ThemeStyleRow';
import {
  clampCanvasShadowOffset,
  clampCellSize,
  clampItemOutlineWidth,
  clampLineWidth,
  clampOperationOffset,
  clampRulerFontSize,
  clampRulerGap,
  isValidShadowColor,
  isValidStyleColor,
  mapStyleEquals,
} from '@/lib/mapStyle';

/** Imperative surface used by `MapEditorPage` to gate drawer switches. */
export interface MapInfoDrawerHandle {
  /** True while the draft differs from the committed style / grid size / map info. */
  isDirty: () => boolean;
  /** Commits the draft (same as pressing 保存). `false` = the name is invalid. */
  save: () => boolean;
  /** Drops the draft and re-reads the committed style / grid size / map info. */
  discard: () => void;
}

/**
 * 名称 / 描述 / 封面 —— 条目行上的字段，与画布无关。
 *
 * 它们和样式一样只是**本地草稿**：抽屉的「保存」把它们交给页面，页面更新本地
 * 显示并标脏，真正的请求等右上角「保存」一起发（用户裁定：抽屉不触发请求）。
 */
export interface MapInfoEntryDraft {
  name: string;
  description: string;
  /** A freshly picked file, or `null` to keep the stored one. */
  coverFile: File | null;
  /** The stored cover should be dropped on save. */
  coverRemoved: boolean;
}

interface MapInfoDrawerProps {
  open: boolean;
  gridSize: number;
  /**
   * v0.8.0 §16.8：这张地图属于哪个主题。抽屉底部那一行「风格来自主题…」靠它
   * 去读主题的缺省风格。
   */
  /** v0.8.0 §19：这张图所属主题的**编码**（`MapEntry.themeCode`）。 */
  themeCode: string;
  /** The value the adaptive pass currently computes (FEAT-D03 default). */
  autoCellSize: number;
  /** The committed style — the drawer edits a copy of it. */
  style: MapStyle;
  /** Committed (or already-applied-but-unsaved) map name. */
  name: string;
  /** Committed map description ('' when it has none). */
  description: string;
  /** The cover currently on the server (`null` when it has none). */
  coverUrl: string | null;
  /** A cover file already applied to the local state but not uploaded yet. */
  coverFile: File | null;
  /** The local state already marks the stored cover as removed. */
  coverRemoved: boolean;
  /**
   * FEAT-E01: the drawer never closes itself. Both × and 取消 call this, and
   * `MapEditorPage` decides whether to prompt for unsaved edits first.
   */
  onRequestClose: () => void;
  /**
   * v0.3.10 FIX-F01 + 「保存不请求」：applies the whole draft locally — style,
   * canvas size and the map's own fields. `MapEditorPage` closes the drawer and
   * writes everything on the toolbar's 保存.
   */
  onCommit: (style: MapStyle, gridSize: number, entry: MapInfoEntryDraft) => void;
  /** FEAT-E01: reports the dirty flag so the parent can gate drawer switches. */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Draft-then-commit wrapper so the store is only touched on 保存.
 */
function useDraft<T>(source: T, open: boolean): [T, (next: T | ((current: T) => T)) => void] {
  const [draft, setDraft] = useState<T>(source);
  useEffect(() => {
    // Re-seed on every open so a cancelled edit never leaks into the next one.
    if (open) setDraft(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return [draft, setDraft];
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
      <h3 className="flex items-center text-xs font-semibold text-foreground">
        <span>{title}</span>
        {hint ? <Hint text={hint} /> : null}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/**
 * v0.3.8 FEAT-D01/D02 + v0.3.9 FEAT-E01 + v0.3.10 FIX-F01/FIX-F02/FIX-F04/FIX-F05/SPEC-F01:
 * the 「地图基本信息」drawer.
 *
 * The drawer is a **form**: every control edits a local draft (written through in
 * real time), the canvas only changes when 保存 is pressed, and 取消 / × /
 * switching to another info panel ask for confirmation first (the parent owns
 * that dialog). 画布尺寸 is part of the same draft since v0.3.10.
 *
 * 名称 / 描述 / 封面 也在这个草稿里。抽屉的「保存」只把草稿交给页面 ——
 * **不发请求**；落库统一等右上角「保存」。这样一次编辑只产生一次写库，
 * 也不会出现「点了保存却只改了一半」的半成品状态。
 * Layer names follow 《画布图层优先级规范》§1.
 */
export const MapInfoDrawer = forwardRef<MapInfoDrawerHandle, MapInfoDrawerProps>(
  function MapInfoDrawer(
    {
      open,
      gridSize,
      themeCode,
      autoCellSize,
      style,
      name,
      description,
      coverUrl,
      coverFile,
      coverRemoved,
      onRequestClose,
      onCommit,
      onDirtyChange,
    },
    ref,
  ): JSX.Element | null {
    const [draft, setDraft] = useDraft<MapStyle>(style, open);
    const [draftGridSize, setDraftGridSize] = useDraft<number>(gridSize, open);
    const [draftName, setDraftName] = useDraft<string>(name, open);
    const [draftDescription, setDraftDescription] = useDraft<string>(description, open);
    const [draftCover, setDraftCover] = useDraft<File | null>(coverFile, open);
    const [draftCoverRemoved, setDraftCoverRemoved] = useDraft<boolean>(coverRemoved, open);
    /**
     * Set while committing / discarding. `style` only reaches this component on
     * the next render, so without this the (stale) dirty flag would still read
     * `true` when the parent immediately runs a deferred switch.
     */
    const settledRef = useRef(false);

    const trimmedName = draftName.trim();
    const trimmedDescription = draftDescription.trim();
    const nameError = trimmedName.length === 0 ? '请输入地图名称' : null;

    const styleDirty = !mapStyleEquals(draft, style) || draftGridSize !== gridSize;
    const entryDirty =
      trimmedName !== name.trim() ||
      trimmedDescription !== description.trim() ||
      draftCover !== coverFile ||
      draftCoverRemoved !== coverRemoved;
    const dirty = styleDirty || entryDirty;
    /** An empty name is the one value the server would reject — block 保存. */
    const canSave = dirty && nameError === null;
    const latest = useRef({ draft, draftGridSize, style, gridSize, dirty });
    latest.current = { draft, draftGridSize, style, gridSize, dirty };

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
          const { draft: current, draftGridSize: size, dirty: isDirty } = latest.current;
          if (isDirty && !canSave) return false;
          settledRef.current = true;
          if (isDirty) {
            onCommit(current, size, {
              name: trimmedName,
              description: trimmedDescription,
              coverFile: draftCover,
              coverRemoved: draftCoverRemoved,
            });
          } else {
            onRequestClose();
          }
          return true;
        },
        discard: () => {
          settledRef.current = true;
          setDraft(latest.current.style);
          setDraftGridSize(latest.current.gridSize);
          setDraftName(name);
          setDraftDescription(description);
          setDraftCover(coverFile);
          setDraftCoverRemoved(coverRemoved);
        },
      }),
      [
        canSave,
        coverFile,
        coverRemoved,
        description,
        draftCover,
        draftCoverRemoved,
        name,
        onCommit,
        onRequestClose,
        setDraft,
        setDraftCover,
        setDraftCoverRemoved,
        setDraftDescription,
        setDraftGridSize,
        setDraftName,
        trimmedDescription,
        trimmedName,
      ],
    );

    const patch = (updater: (current: MapStyle) => MapStyle): void =>
      setDraft((current) => updater(current));

    /** The footer's 保存 — one local commit, zero requests. */
    const commit = (): void => {
      settledRef.current = true;
      onCommit(draft, draftGridSize, {
        name: trimmedName,
        description: trimmedDescription,
        coverFile: draftCover,
        coverRemoved: draftCoverRemoved,
      });
    };

    const cellSizeValue = draft.cellSize ?? autoCellSize;
    const cellSizeHint = `方格边长（px），可指定 ${MAP_STYLE_CELL_SIZE_MIN} ~ ${MAP_STYLE_CELL_SIZE_MAX}，未指定时按窗口自适应。${
      draft.cellSize === null
        ? `当前为自适应（本次计算值 ${autoCellSize}px），窗口尺寸变化会重新计算。`
        : '当前已手动指定，窗口尺寸变化不再改变方格大小。'
    }`;

    /**
     * v0.7.4 (docs/v0.7.4.md §4): 面板**占据**编辑区右侧一块空间，关掉时不渲染
     * 任何东西（不再留一条 `translate-x-full` 的浮层）。关掉不丢东西：草稿本来
     * 就在 `open` 变 true 时重新播种（`useDraft`），关掉只可能是「放弃」或
     * 「已提交」。
     */
    if (!open) return null;

    return (
      <aside
        data-testid="map-info-drawer"
        className="relative flex h-full w-80 max-w-[50vw] shrink-0 flex-col border-l bg-background"
        // 高于信息抽屉的 8px 展开条（`UI_Z.infoDrawer`）—— 两者都开时窄条不该
        // 压在本面板上。
        style={{ zIndex: UI_Z.drawer }}
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
          {/* ---- 基本 ---- */}
          <Section
            title="基本"
            hint="Info — 名称、描述与封面。这里的「保存」只应用到页面，写入数据库等右上角「保存」。"
          >
            <div className="grid gap-1.5">
              <Label
                htmlFor="map-info-name"
                className="text-2xs font-normal text-muted-foreground"
              >
                名称
              </Label>
              <Input
                id="map-info-name"
                value={draftName}
                maxLength={100}
                onChange={(event) => setDraftName(event.target.value)}
                className="h-7 text-xs"
              />
              {nameError ? <p className="text-2xs text-destructive">{nameError}</p> : null}
            </div>
            <div className="grid gap-1.5">
              <Label
                htmlFor="map-info-description"
                className="text-2xs font-normal text-muted-foreground"
              >
                描述
              </Label>
              <Textarea
                id="map-info-description"
                value={draftDescription}
                maxLength={500}
                rows={2}
                placeholder="选填"
                onChange={(event) => setDraftDescription(event.target.value)}
                className="min-h-16 text-xs"
              />
            </div>
            <CoverPicker
              storedUrl={coverUrl}
              file={draftCover}
              removed={draftCoverRemoved}
              layout="stack"
              onPick={(picked) => {
                setDraftCover(picked);
                if (picked) setDraftCoverRemoved(false);
              }}
              onRemove={() => {
                setDraftCover(null);
                setDraftCoverRemoved(true);
              }}
              onRestore={() => setDraftCoverRemoved(false)}
            />
          </Section>

          {/* ---- 画布 ---- */}
          <Section title="画布" hint="Canvas — 画布的几何尺寸。">
            <Row
              label="画布尺寸"
              hint="画布的边长（格数），最少 2 格、最多 24 格。修改随「保存」一起写入，缩小尺寸时越界的内容会被移除。"
            >
              <NumberField
                id="map-info-grid-size"
                value={draftGridSize}
                min={GRID_SIZE_MIN}
                max={GRID_SIZE_MAX}
                commit={(value) =>
                  setDraftGridSize(
                    Math.min(GRID_SIZE_MAX, Math.max(GRID_SIZE_MIN, Math.round(value))),
                  )
                }
              />
            </Row>
            <Row label="方格大小" hint={cellSizeHint}>
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
          </Section>

          {/* ---- 线条 ---- */}
          <Section
            title="线条"
            hint="Lines — 各图层的线宽与颜色、画布纸片投下的硬影，以及物品描边。所有数值都是「基准值」，随方格尺寸等比缩放，不随画布缩放变化。"
          >
            <Row
              label="画布外框"
              hint="Canvas Frame — 整张画布最外圈的边框线，绘制在画布矩形之外，与格内内容不重叠。"
            >
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

            {/* v0.9.1 §2：画布纸片的投影 —— 偏移 + 颜色，默认 36px。 */}
            <Row
              label="画布阴影"
              hint="Canvas Shadow — 画布纸片向右下投下的硬影（无模糊），偏移量随缩放一起变。0 就是不投阴影；颜色只收 #RRGGBB，渲染时统一压 30% 透明度。"
            >
              <div className="flex items-center gap-1">
                <NumberField
                  id="map-info-shadow-offset"
                  value={draft.canvasShadow.offset}
                  min={MAP_STYLE_SHADOW_OFFSET_MIN}
                  max={MAP_STYLE_SHADOW_OFFSET_MAX}
                  suffix="px"
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      canvasShadow: {
                        ...current.canvasShadow,
                        offset: clampCanvasShadowOffset(value),
                      },
                    }))
                  }
                />
                <ColorField
                  id="map-info-shadow-color"
                  value={draft.canvasShadow.color}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      canvasShadow: { ...current.canvasShadow, color: value },
                    }))
                  }
                />
              </div>
            </Row>

            <Row
              label="网格分隔线"
              hint="Grid Separator — 方格之间的内部分隔线。相邻两格共享同一条线，因此 n × n 的画布只有 n − 1 条横线与 n − 1 条竖线。"
            >
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
              <span className="flex items-center text-2xs font-medium">
                <span>鼠标光标框</span>
                <Hint text="Mouse Cursor Box — 跟随指针移动的方格提示框，是画布的最高层，任何内容都盖不住它。" />
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
                  <ColorInput
                    value={
                      isValidStyleColor(draft.mouseCursorBox.shadowColor)
                        ? draft.mouseCursorBox.shadowColor
                        : '#000000'
                    }
                    onChange={(value) =>
                      patch((current) => ({
                        ...current,
                        mouseCursorBox: {
                          ...current.mouseCursorBox,
                          shadowColor: value,
                        },
                      }))
                    }
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
                    className="h-7 w-24 font-mono text-2xs"
                  />
                </div>
              </Row>
            </div>

            <div className="space-y-1.5 rounded-md border p-2">
              <span className="flex items-center text-2xs font-medium">
                <span>操作光标框</span>
                <Hint text="Operation Cursor Box — 固定在「当前操作方格」上的提示框，以外描边形式画在网格分隔线外侧，不参与布局。" />
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

            {/* v0.9.1 §5：物品描边 —— 默认宽度 0（不描边）。 */}
            <div className="space-y-1.5 rounded-md border p-2">
              <span className="flex items-center text-2xs font-medium">
                <span>物品描边</span>
                <Hint text="Item Outline — 沿物品图片的轮廓画一圈描边（剪影，不是矩形框），用来把物品从底纹里拔出来。宽度 0 就是不描边（出厂默认）；宽度是基准值，随方格尺寸等比缩放。" />
              </span>
              <Row label="宽度">
                <NumberField
                  id="map-info-item-outline-width"
                  value={draft.itemOutline.width}
                  min={MAP_STYLE_ITEM_OUTLINE_WIDTH_MIN}
                  max={MAP_STYLE_ITEM_OUTLINE_WIDTH_MAX}
                  suffix="px"
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      itemOutline: {
                        ...current.itemOutline,
                        width: clampItemOutlineWidth(value),
                      },
                    }))
                  }
                />
              </Row>
              <Row label="颜色">
                <ColorField
                  id="map-info-item-outline-color"
                  value={draft.itemOutline.color}
                  commit={(value) =>
                    patch((current) => ({
                      ...current,
                      itemOutline: { ...current.itemOutline, color: value },
                    }))
                  }
                />
              </Row>
            </div>

          </Section>

          {/* ---- 区域 ---- */}
          <Section
            title="区域"
            hint="Region — 区域外观的缺省值。区域信息框默认填入这里的数值，只有与缺省不同的字段才会记到区域自己身上。"
          >
            <RegionStyleEditor
              idPrefix="map-info-region"
              value={{
                outline: draft.regionOutline,
                highlight: draft.regionHighlight,
                label: draft.regionLabel,
                // v0.9.6：地图级没有标签偏移这一项（它只属于某一块区域），
                // 这里给 0 占位；`showOffset` 不开，所以它不会出现在这一屏。
                labelOffset: { x: 0, y: 0 },
              }}
              onChange={(next) =>
                patch((current) => ({
                  ...current,
                  regionOutline: next.outline,
                  regionHighlight: next.highlight,
                  regionLabel: next.label,
                }))
              }
            />
          </Section>

          {/* ---- 标尺 ---- */}
          <Section
            title="标尺"
            hint="Ruler — 沿画布上边缘与左边缘的行列标尺，透明、无边框、无下划线。"
          >
            <Row
              label="文本大小"
              hint="标尺文本大小（9 ~ 32px，基准值，随方格尺寸等比缩放）；操作格所在行列比普通文本大 2px。"
            >
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
            <Row
              label="文本到地图的间距"
              hint="Ruler Gap — 标尺文本与画布之间的距离（0 ~ 32px）。间距会同时参与标尺条厚度的计算。"
            >
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
          </Section>

          {/* ---- 主题风格（v0.8.0 §16.8） ---- */}
          <Section
            title="主题风格"
            hint="Theme — 主题的地图初始样式。它只在**新建地图那一刻**被拷进草稿（§5 的快照式），之后两边各走各的：改主题风格不会追溯改动已经画好的图。"
          >
            <ThemeStyleRow
              themeCode={themeCode}
              style={draft}
              // 只是灌进抽屉草稿，落库仍等右上角「保存」—— 与这里其它控件完全一致。
              onApplyThemeStyle={(next) => setDraft(next)}
            />
          </Section>
        </div>

        {/* ---- FEAT-E01: 取消 / 保存 并列固定在底部 ---- */}
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t bg-background px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onRequestClose}>
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            onClick={commit}
          >
            保存
          </Button>
        </footer>
      </aside>
    );
  },
);
