import { useEffect, useState } from 'react';
import { DEFAULT_THEME_COLOR } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ThemeColorDialogProps {
  open: boolean;
  /** The drawer's current colour — the dialog never reads the store itself. */
  value: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (color: string) => void;
}

/**
 * FEAT-H08 §8.2(b) (docs/v0.4.2.md §8): the participant's theme colour gets its
 * own layer. The drawer only shows **what is selected now**; picking a colour
 * happens here.
 *
 * v0.8.3：色板去掉了（用户要求界面不提供调色板），这一层现在只是把统一取色控件
 * 放在一块够大的地方 —— 原生取色器 + hex 输入。
 *
 * Fully **controlled**: it holds a draft, never touches the store, and never
 * creates an undo step. 「确定」 hands the colour back to the drawer, whose own
 * 保存 is still the only thing that writes (`setParticipantConfig`).
 */
export function ThemeColorDialog({
  open,
  value,
  onOpenChange,
  onConfirm,
}: ThemeColorDialogProps): JSX.Element {
  const [draft, setDraft] = useState(value);

  // Re-seed on every open so a cancelled edit never leaks back in.
  useEffect(() => {
    if (!open) return;
    setDraft(value);
  }, [open, value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>主题色</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <ColorField label="主题色" value={draft || DEFAULT_THEME_COLOR} commit={setDraft} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={() => onConfirm(draft)}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
