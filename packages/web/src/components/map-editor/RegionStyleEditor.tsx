import type { RegionStyle } from '@loredoku/shared';
import {
  MAP_STYLE_LINE_WIDTH_MAX,
  MAP_STYLE_LINE_WIDTH_MIN,
  MAP_STYLE_REGION_LABEL_FONT_MAX,
  MAP_STYLE_REGION_LABEL_FONT_MIN,
  MAP_STYLE_REGION_LABEL_STROKE_MAX,
  MAP_STYLE_REGION_LABEL_STROKE_MIN,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
} from '@loredoku/shared';
import {
  clampLineWidth,
  clampRegionBorderWidth,
  clampRegionLabelFont,
  clampRegionLabelOffset,
  clampRegionLabelStroke,
} from '@/lib/mapStyle';
import { ColorField } from '@/components/ui/color-input';
import { Hint, NumberField, Row } from '@/components/map-editor/StyleFields';
import { fontFamilyOptions, hasBundledFonts } from '@/lib/fonts';
import { Select } from '@/components/ui/select';

/**
 * v0.7.0 (docs/v0.7.0.md §5) — the one layout both info boxes use for a
 * region's display style.
 *
 * The map-level block in 「地图基本信息」 is the **default**; a region stores
 * only what differs from it (`DraftRegion.style`). Editing therefore always
 * happens on **resolved** values — the region box seeds itself from the
 * map-level defaults — and the store re-derives the minimal override on save
 * (`regionStyleOverride`), so a field left at the default never reaches the
 * region record.
 *
 * The label block mirrors the map-level names: 字体（具体字体，v0.7.4）/ 字号 /
 * 描边 / 高亮 / 高亮描边，后四行各是一个大小 + 一个颜色。
 */
export function RegionStyleEditor({
  idPrefix,
  value,
  onChange,
  showOffset = false,
}: {
  idPrefix: string;
  /** Resolved values — the region's own override already merged over the map default. */
  value: RegionStyle;
  onChange: (next: RegionStyle) => void;
  /**
   * v0.9.6：**位置偏移只在区域信息里出现**。
   *
   * 偏移是「这块区域的标签该往哪挪一点」—— 它只对某一块区域有意义，地图级缺省
   * 里没有这一项（`MapStyle.regionLabel` 不带 offset）。所以编辑器在「地图基本
   * 信息」那一处不画这两格，在两个入口共用同一个组件的前提下多加一个开关，
   * 而不是把组件抄一份。
   */
  showOffset?: boolean;
}): JSX.Element {
  const patchLabel = (
    patch: Partial<RegionStyle['label']>,
    options: { keepHoverAboveFont?: boolean } = {},
  ): void => {
    const label = { ...value.label, ...patch };
    // v0.5.2 FIX-M02: the hovered label is never smaller than the idle one.
    // Enforced here as well as at render time so the two fields can never
    // disagree about what the canvas will draw.
    if (options.keepHoverAboveFont !== false && label.fontSize > label.hoverFontSize) {
      label.hoverFontSize = label.fontSize;
    }
    onChange({ ...value, label });
  };

  /**
   * v0.9.6：位置偏移不是 `label` 的字段（地图级没有这一项），所以单独一个 patch。
   */
  const patchLabelOffset = (patch: Partial<RegionStyle['labelOffset']>): void => {
    onChange({ ...value, labelOffset: { ...value.labelOffset, ...patch } });
  };

  /**
   * v0.7.4: the picker lists **concrete fonts** — whatever lives in
   * `src/assets/fonts/` — plus 系统默认. Resolved once per render: the list is a
   * build-time constant, so there is nothing to subscribe to.
   */
  const fontOptions = fontFamilyOptions(value.label.fontFamily);

  return (
    <div className="space-y-2">
      <Row
        label="区域轮廓线"
        hint="Region Outline — 区域外轮廓的描线。留空即沿用「地图基本信息」里的缺省值。"
      >
        <div className="flex items-center gap-1">
          <NumberField
            id={`${idPrefix}-outline-width`}
            value={value.outline.width}
            min={REGION_BORDER_WIDTH_MIN}
            max={REGION_BORDER_WIDTH_MAX}
            commit={(next) =>
              onChange({
                ...value,
                outline: { ...value.outline, width: clampRegionBorderWidth(next) },
              })
            }
          />
          <ColorField
            id={`${idPrefix}-outline-color`}
            value={value.outline.color}
            commit={(next) =>
              onChange({ ...value, outline: { ...value.outline, color: next } })
            }
          />
        </div>
      </Row>

      <Row
        label="区域高亮线"
        hint="Region Highlight — 区域被悬停或联动激活时出现的内侧高亮线，连续闭合。"
      >
        <div className="flex items-center gap-1">
          <NumberField
            id={`${idPrefix}-highlight-width`}
            value={value.highlight.width}
            min={MAP_STYLE_LINE_WIDTH_MIN}
            max={MAP_STYLE_LINE_WIDTH_MAX}
            commit={(next) =>
              onChange({
                ...value,
                highlight: { ...value.highlight, width: clampLineWidth(next) },
              })
            }
          />
          <ColorField
            id={`${idPrefix}-highlight-color`}
            value={value.highlight.color}
            commit={(next) =>
              onChange({ ...value, highlight: { ...value.highlight, color: next } })
            }
          />
        </div>
      </Row>

      <div className="space-y-1.5 rounded-md border p-2">
        <span className="flex items-center text-2xs font-medium">
          <span>区域标签</span>
          <Hint text="Region Label — 区域名称文字，采用「描边 + 填充」绘制，在深浅背景上都可读。" />
        </span>
        <Row
          label="字体"
          hint={
            hasBundledFonts()
              ? 'Font — 区域名称文字使用的字体，可选项来自 packages/web/src/assets/fonts/；缺字时按系统回退链继续找。'
              : 'Font — 目前只装了「系统默认」：把 .ttf / .otf 放进 packages/web/fonts-source/，跑 npm run fonts 裁字转成 woff2（命名如 WenKai-Bold.woff2），重新构建后即出现在这里。'
          }
        >
          <Select
            id={`${idPrefix}-label-font-family`}
            value={value.label.fontFamily}
            onChange={(event) => patchLabel({ fontFamily: event.target.value })}
            className="h-7 w-40 max-w-[65%] text-xs"
          >
            {fontOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="字号">
          <div className="flex items-center gap-1">
            <NumberField
              id={`${idPrefix}-label-font-size`}
              value={value.label.fontSize}
              min={MAP_STYLE_REGION_LABEL_FONT_MIN}
              max={MAP_STYLE_REGION_LABEL_FONT_MAX}
              suffix="px"
              commit={(next) => patchLabel({ fontSize: clampRegionLabelFont(next) })}
            />
            <ColorField
              id={`${idPrefix}-label-color`}
              value={value.label.color}
              commit={(next) => patchLabel({ color: next })}
            />
          </div>
        </Row>
        <Row label="描边">
          <div className="flex items-center gap-1">
            <NumberField
              id={`${idPrefix}-label-stroke-width`}
              value={value.label.strokeWidth}
              min={MAP_STYLE_REGION_LABEL_STROKE_MIN}
              max={MAP_STYLE_REGION_LABEL_STROKE_MAX}
              suffix="px"
              commit={(next) => patchLabel({ strokeWidth: clampRegionLabelStroke(next) })}
            />
            <ColorField
              id={`${idPrefix}-label-stroke-color`}
              value={value.label.strokeColor}
              commit={(next) => patchLabel({ strokeColor: next })}
            />
          </div>
        </Row>
        <Row label="高亮">
          <div className="flex items-center gap-1">
            <NumberField
              id={`${idPrefix}-label-hover-font-size`}
              value={value.label.hoverFontSize}
              min={MAP_STYLE_REGION_LABEL_FONT_MIN}
              max={MAP_STYLE_REGION_LABEL_FONT_MAX}
              suffix="px"
              commit={(next) =>
                patchLabel({ hoverFontSize: clampRegionLabelFont(next) }, { keepHoverAboveFont: false })
              }
            />
            <ColorField
              id={`${idPrefix}-label-hover-color`}
              value={value.label.hoverColor}
              commit={(next) => patchLabel({ hoverColor: next })}
            />
          </div>
        </Row>
        <Row label="高亮描边">
          <div className="flex items-center gap-1">
            <NumberField
              id={`${idPrefix}-label-hover-stroke-width`}
              value={value.label.hoverStrokeWidth}
              min={MAP_STYLE_REGION_LABEL_STROKE_MIN}
              max={MAP_STYLE_REGION_LABEL_STROKE_MAX}
              suffix="px"
              commit={(next) => patchLabel({ hoverStrokeWidth: clampRegionLabelStroke(next) })}
            />
            <ColorField
              id={`${idPrefix}-label-hover-stroke-color`}
              value={value.label.hoverStrokeColor}
              commit={(next) => patchLabel({ hoverStrokeColor: next })}
            />
          </div>
        </Row>
        {/*
          v0.9.6：位置偏移 —— 只在这一块区域的标签需要避开别的东西时才调。
          v0.10.7 起这个数字是**基准格子（120px）上的像素**，渲染时按
          `cellSize / 120` 缩放，所以开 / 关标尺、换窗口大小都不会让标签挪位。
        */}
        {showOffset ? (
          <Row
            label="位置偏移"
            hint="Label Offset — 这块区域的标签相对「格子上沿居中」挪多少画布像素（右 / 下为正，0 = 不偏移）。按基准格子（120px）折算，格子变大变小时占比不变。只影响这一块区域的标签。"
          >
            <div className="flex items-center gap-1">
              <NumberField
                id={`${idPrefix}-label-offset-x`}
                value={value.labelOffset.x}
                suffix="x"
                commit={(next) =>
                  patchLabelOffset({ x: clampRegionLabelOffset(next) })
                }
              />
              <NumberField
                id={`${idPrefix}-label-offset-y`}
                value={value.labelOffset.y}
                suffix="y"
                commit={(next) =>
                  patchLabelOffset({ y: clampRegionLabelOffset(next) })
                }
              />
            </div>
          </Row>
        ) : null}
      </div>
    </div>
  );
}
