import { useMemo, useState } from 'react';
import { ArrowLeftRight, Palette } from 'lucide-react';
import { diffMapStyle, type MapStyle } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useThemeDetail, useUpdateTheme } from '@/hooks/useThemes';

interface ThemeStyleRowProps {
  /** 这张地图属于哪个主题（`MapEntry.themeCode`，§19）。 */
  themeCode: string;
  /** 抽屉**当前草稿**里的风格 —— 比对用草稿，数字才会跟着手改实时变。 */
  style: MapStyle;
  /** 把主题的缺省风格灌进抽屉草稿（本地动作，落库仍等右上角「保存」）。 */
  onApplyThemeStyle: (style: MapStyle) => void;
}

/**
 * v0.8.0（docs/v0.8.0.md §16.8，改写 §5 的落点）—— 「基本信息」抽屉底部的那一行。
 *
 * §5 原本写「仅当与主题风格有差异时出现」。那是反向的：**正常状态看不见**，作者
 * 反而没法确认「这张图吃的是主题风格」，只有出问题时才有一行字。所以常态也写一句，
 * 只是不可点。
 *
 * 两个动作的方向是这功能的全部，所以文案里不许出现「同步」：
 *
 * - `应用主题风格` → 改**本图**（把它拉回主题的缺省）；
 * - `设为主题风格` → 改**主题**（本图成为新缺省）。
 *
 * 反向那个动作不是附赠品：作者刚把一张图的网格线调舒服，下一步一定是「以后新建的
 * 图都长这样」。没有它，只能回主题抽屉里手抄二十几个值。
 */
export function ThemeStyleRow({ themeCode, style, onApplyThemeStyle }: ThemeStyleRowProps): JSX.Element | null {
  const themeQuery = useThemeDetail(themeCode);
  const updateTheme = useUpdateTheme(themeCode);
  const [diffOpen, setDiffOpen] = useState(false);
  const theme = themeQuery.data;
  const themeStyle = theme?.data.style;

  // 差异跟着**草稿**算：改一个线宽，弹窗里的项数当场少一项，这是最直接的反馈。
  const diffs = useMemo(() => diffMapStyle(style, themeStyle), [style, themeStyle]);

  // 主题还没读到时什么都不说 —— 闪一句「还没有缺省风格」再改口更糟。
  if (!theme) return null;

  const grouped = ['网格', '边框', '标签', '光标'] as const;

  /** 本图成为主题的新缺省。`data` 要整份回写：schema 是 `.strict()` 的。 */
  const setAsThemeStyle = (): Promise<unknown> =>
    updateTheme.mutateAsync({
      data: { ...theme.data, version: theme.data.version ?? 1, style },
    });

  const setAsThemeButton = (
    <Button type="button" size="sm" disabled={updateTheme.isPending} onClick={() => void setAsThemeStyle()}>
      <Palette className="mr-1 h-3.5 w-3.5" />
      {updateTheme.isPending ? '写入中…' : '设为主题风格'}
    </Button>
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">
          风格来自主题「{theme.name}」
          {themeStyle ? (
            diffs.length > 0 ? (
              <span className="text-foreground"> · 与主题 {diffs.length} 项不同</span>
            ) : (
              <span className="text-2xs"> · 与主题一致</span>
            )
          ) : (
            <span className="text-2xs"> · 主题还没有缺省风格</span>
          )}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={() => setDiffOpen(true)}
        >
          {diffs.length > 0 ? '查看差异' : '风格'}
        </Button>
      </div>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>主题风格 · {theme.name}</DialogTitle>
          </DialogHeader>

          {themeStyle ? (
            <div className="space-y-3">
              {diffs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  这张图与主题的缺省风格完全一致，没有需要看的差异。
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-md border">
                  {grouped.map((group) => {
                    const rows = diffs.filter((entry) => entry.group === group);
                    if (rows.length === 0) return null;
                    return (
                      <section key={group} className="border-b last:border-b-0">
                        <h4 className="bg-muted/50 px-3 py-1 text-2xs font-medium text-muted-foreground">
                          {group}
                          <span className="ml-1.5 tabular-nums opacity-70">{rows.length}</span>
                        </h4>
                        <ul>
                          {rows.map((entry) => (
                            <li
                              key={entry.key}
                              className="flex items-center gap-2 px-3 py-1 text-xs"
                            >
                              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                              <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                                {entry.themeValue}
                              </span>
                              <span className="shrink-0 text-2xs text-muted-foreground">→</span>
                              <span className="shrink-0 font-mono text-2xs">{entry.mapValue}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              )}

              <p className="text-2xs leading-relaxed text-muted-foreground">
                左列是主题的缺省值，右列是这张图现在的值。
                「应用主题风格」改这张图；「设为主题风格」改主题，之后的**新建**地图都会长这样
                —— 已经画好的图不会被追溯改动。
              </p>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={diffs.length === 0}
                  onClick={() => {
                    setDiffOpen(false);
                    onApplyThemeStyle(themeStyle);
                  }}
                >
                  <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />
                  应用主题风格
                </Button>
                {setAsThemeButton}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                这个主题还没有缺省风格。之后新建的地图会从「一张已经有风格的图」抄一份。
              </p>
              <div className="flex justify-end">{setAsThemeButton}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
