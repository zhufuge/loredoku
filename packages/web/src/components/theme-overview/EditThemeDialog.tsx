import { useEffect, useState } from 'react';
import type { Theme } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ColorField } from '@/components/ui/color-input';
import { useUpdateTheme } from '@/hooks/useThemes';

/**
 * v0.8.2：选色的起点。石青是浅色下的 `--primary`，第一次按下取色器就从这里开始 ——
 * 它不是「默认识别色」，只是不让取色器从一个随机黑开始。
 *
 * v0.10.4：跟着 `EditThemeDialog` 一起搬过来 —— 它只在这一个弹窗里用到。
 */
const ACCENT_FALLBACK = '#326385';

/**
 * 编辑主题信息 —— 改 `name` / `description` / `accent`。
 *
 * `code` 仍不在这里：它进 URL 与资源包 manifest（§4），改一次就让所有已发出的
 * 链接与包对不上号，所以它从建行起就是只读的。
 *
 * `data` 是**整份覆盖**（`themeRepository.updateTheme` 直接写 JSONB），所以保存时
 * 要把当前 `data` 铺开再改 `accent` —— 只发 `{accent}` 会把 `style` 一起抹掉。
 */
export function EditThemeDialog({
  theme,
  open,
  onOpenChange,
}: {
  theme: Theme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const [name, setName] = useState(theme.name);
  const [description, setDescription] = useState(theme.description ?? '');
  /** `null` = 没有门牌色。与「选了某个颜色」是两回事，保存时分别落成「删键」与「写值」。 */
  const [accent, setAccent] = useState<string | null>(theme.data.accent ?? null);
  const update = useUpdateTheme(theme.code);

  // 每次打开都从主题当前值开始 —— 上一次取消时留下的草稿不该在下一次出现。
  useEffect(() => {
    if (!open) return;
    setName(theme.name);
    setDescription(theme.description ?? '');
    setAccent(theme.data.accent ?? null);
  }, [open, theme.name, theme.description, theme.data.accent]);

  async function submit(): Promise<void> {
    const data: Record<string, unknown> = { ...theme.data };
    if (accent) data['accent'] = accent;
    else delete data['accent'];
    try {
      await update.mutateAsync({
        name: name.trim(),
        description: description.trim().length > 0 ? description.trim() : null,
        data,
      });
    } catch {
      // 提示由 `useUpdateTheme` 的 onError 统一弹出；这里只负责**不关窗**。
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>编辑主题信息</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme-edit-name">名称</Label>
            <Input id="theme-edit-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="theme-edit-description">描述</Label>
            <Input
              id="theme-edit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="可选"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="theme-edit-accent">识别色</Label>
            <div className="flex min-h-10 items-center gap-2">
              {accent ? (
                <>
                  <ColorField
                    id="theme-edit-accent"
                    label="识别色"
                    value={accent}
                    commit={setAccent}
                  />
                  <button
                    type="button"
                    className="ml-1 text-2xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    onClick={() => setAccent(null)}
                  >
                    清除
                  </button>
                </>
              ) : (
                /* 没设过就不先摆一个色块 —— 一进门就是某个颜色，等于替作者做了决定。 */
                <Button
                  id="theme-edit-accent"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAccent(ACCENT_FALLBACK)}
                >
                  选一个颜色
                </Button>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={name.trim().length === 0 || update.isPending}
            >
              {update.isPending ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
