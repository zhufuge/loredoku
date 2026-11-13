import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { MAP_STYLE_DIFF_GROUPS, type MapStyle, type Theme } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ColorField, ColorInput } from '@/components/ui/color-input';
import { Hint, NumberField, Row } from '@/components/map-editor/StyleFields';
import { useUpdateTheme } from '@/hooks/useThemes';
import { isValidShadowColor, isValidStyleColor, resolveMapStyle } from '@/lib/mapStyle';
import {
  resetThemeStyle,
  THEME_STYLE_FIELDS,
  THEME_STYLE_GROUP_HINTS,
  writeStyleValue,
  type ThemeStyleField,
} from '@/lib/themeStyleFields';

/**
 * 地图初始样式的整份编辑：字段表 + 分组 + 四种控件。
 *
 * v0.10.4：原先它与「难度分级」「删除主题」两个弹窗一起住在一个 1200 行的页面
 * 文件末尾。三者各占一两百行，谁也不调谁 —— 现在一个弹窗一个文件。
 */

/**
 * v0.8.6 §1.6：光标那七个字段在抽屉里分属两个带框的小节 —— 鼠标框跟着指针走，
 * 操作框钉在当前操作格上，两者只是碰巧都叫「框」。摊成七行平铺，作者读到「阻挡色」
 * 得自己回想它属于哪一个。
 */
const CURSOR_BOXES = [
  {
    key: 'mouseCursorBox',
    title: '鼠标光标框',
    hint: 'Mouse Cursor Box — 跟着指针走，画布最高层。',
  },
  {
    key: 'operationCursorBox',
    title: '操作光标框',
    hint: 'Operation Cursor Box — 钉在当前操作格上，画在网格线外侧。',
  },
] as const;

/**
 * v0.8.3 §2：地图初始样式表单。
 *
 * 字段表来自 `THEME_STYLE_FIELDS`（同一份 `MAP_STYLE_FIELDS` + 各自怎么写），所以
 * 这里不重复列二十几行 JSX —— 那种写法每加一个风格字段都要改两处，而漏掉的那一处
 * 永远不会报错。
 *
 * 「编辑」是**整份草稿**：改到一半取消，主题不动。保存时把 `style` 塞回 `data`
 * （其余键原样带着 —— `data` 是整份覆盖）。
 */
export function ThemeStyleDialog({
  theme,
  open,
  onOpenChange,
}: {
  theme: Theme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  // v0.9.1：老主题的 `style` 可能是旧形状（缺 `canvasShadow`）；先解析补齐，
  // 否则字段表读 `canvasShadow.offset` 会拿到 undefined。
  const [style, setStyle] = useState<MapStyle>(() => resolveMapStyle(theme.data.style));
  const update = useUpdateTheme(theme.code);

  useEffect(() => {
    if (!open) return;
    setStyle(resolveMapStyle(theme.data.style));
  }, [open, theme.data.style]);

  const set = (key: string, value: string | number | null): void =>
    setStyle((current) => writeStyleValue(current, key, value));

  async function submit(): Promise<void> {
    try {
      await update.mutateAsync({
        data: { ...theme.data, version: theme.data.version ?? 1, style },
      });
    } catch {
      return;
    }
    onOpenChange(false);
  }

  /** 一组里的字段，顺序仍由 `MAP_STYLE_FIELDS` 决定 —— 页面不另排。 */
  const fieldsOf = (group: string): readonly ThemeStyleField[] =>
    THEME_STYLE_FIELDS.filter((field) => field.group === group);

  const renderField = (field: ThemeStyleField): JSX.Element => (
    <Row key={field.key} label={field.label} hint={field.hint}>
      <StyleFieldControl
        field={field}
        value={field.read(style)}
        onChange={(next) => set(field.key, next)}
      />
    </Row>
  );

  /**
   * v0.8.6 §1.6：正文的骨架照「地图基本信息」抽屉 —— 分区之间有下边框、标题后面
   * 一个问号、行是「标签 —— 控件」（`Row`），光标那七个字段收成两个带框的小节。
   *
   * 弹窗原来读起来散：672px 宽的对话框里，标签贴着左边缘、控件贴着右边缘，中间
   * 空出一百多像素，二十几行之间既没有线也没有分区；而同一批字段在抽屉里是 320px
   * 一栏的表单，一行挨着一行。**同一件事在两处长成两样**，作者每次都要重学一遍
   * 「这一行改的是哪一项」。
   *
   * 于是这里只改版式，不加字段：宽度收到一栏，分组标题从「灰字」变成「分区」，
   * 行离得近一点，光标两个框各自围一个边。
   */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-sm font-semibold">
            地图初始样式 · {theme.name}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[62vh] overflow-y-auto">
          {MAP_STYLE_DIFF_GROUPS.map((group) => (
            <section key={group} className="space-y-2 border-b px-4 py-3 last:border-b-0">
              <h3 className="flex items-center text-xs font-semibold text-foreground">
                <span>{group}</span>
                <Hint text={THEME_STYLE_GROUP_HINTS[group] ?? group} />
              </h3>
              {group === '光标' ? (
                <div className="space-y-2">
                  {CURSOR_BOXES.map((box) => (
                    <div key={box.key} className="space-y-1.5 rounded-md border p-2">
                      <span className="flex items-center text-2xs font-medium">
                        <span>{box.title}</span>
                        <Hint text={box.hint} />
                      </span>
                      {fieldsOf(group)
                        .filter((field) => field.key.startsWith(`${box.key}.`))
                        .map(renderField)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">{fieldsOf(group).map(renderField)}</div>
              )}
            </section>
          ))}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setStyle((current) => resetThemeStyle(current))}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            恢复默认
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={update.isPending}>
              {update.isPending ? '保存中…' : '保存'}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/** 一个风格字段的控件：数字 / 颜色 / 阴影 / 字体名，四种，够覆盖整张字段表。 */
export function StyleFieldControl({
  field,
  value,
  onChange,
}: {
  field: (typeof THEME_STYLE_FIELDS)[number];
  value: string | number | null;
  onChange: (value: string | number | null) => void;
}): JSX.Element {
  if (field.kind === 'color') {
    const text = typeof value === 'string' ? value : '';
    return (
      <ColorField
        label={field.label}
        value={text}
        commit={onChange}
      />
    );
  }

  if (field.kind === 'number') {
    /**
     * v0.8.6 §1：`cellSize` 那一整套「自适应」的分支删掉了 —— 它是唯一可空的字段，
     * 而它已经不在字段表里。`typeof` 的兜底留着，免得将来有字段的 `read` 返回
     * `null` 时把 `0` 以外的 `NaN` 送到输入框里。
     */
    const numeric = typeof value === 'number' ? value : 0;
    return (
      <NumberField
        id={`theme-style-${field.key}`}
        value={numeric}
        min={field.min ?? 0}
        max={field.max ?? 999}
        step={field.step ?? 1}
        suffix={field.suffix}
        commit={(next) => {
          const clamped = Math.min(field.max ?? 999, Math.max(field.min ?? 0, next));
          onChange(clamped);
        }}
      />
    );
  }

  const text = typeof value === 'string' ? value : '';
  /**
   * 阴影环允许 `rgba()` —— 抽屉那边是一组「色块 + 文本框」：色块给常见的不透明色，
   * 文本框留给带透明度的写法。这里照抄同一副面孔，包括那条「不合法就不写回草稿」
   * 的规矩：框里留着用户打的那半截，视觉上不跳，保存时 schema 仍是最后一道关。
   */
  if (field.kind === 'shadow') {
    return (
      <div className="flex items-center gap-1">
        <ColorInput
          value={isValidStyleColor(text) ? text : '#000000'}
          onChange={onChange}
          aria-label={`${field.label}（取色）`}
        />
        <Input
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            if (!isValidShadowColor(next)) return;
            onChange(next);
          }}
          className="h-7 w-32 font-mono text-2xs"
          aria-label={field.label}
        />
      </div>
    );
  }

  return (
    <Input
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        if (next.trim().length === 0) return;
        onChange(next);
      }}
      className="h-7 w-40 font-mono text-2xs"
      aria-label={field.label}
    />
  );
}
