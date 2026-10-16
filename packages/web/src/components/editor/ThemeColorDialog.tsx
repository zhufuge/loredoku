import { useEffect, useState } from 'react';
import { DEFAULT_THEME_COLOR, normalizeHexColor } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { ColorPalette } from '@/components/ui/color-palette';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface ThemeColorDialogProps {
  open: boolean;
  /** The drawer's current colour — the dialog never reads the store itself. */
  value: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (color: string) => void;
}

/**
 * FEAT-H08 §8.2(b) (docs/v0.4.2.md §8): the participant's theme colour gets its
 * own layer. The drawer only shows **what is selected now**; picking a colour —
 * from the 15-swatch palette or a custom hex — happens here.
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
  const [hexDraft, setHexDraft] = useState(value);

  // Re-seed on every open so a cancelled edit never leaks back in.
  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setHexDraft(value);
  }, [open, value]);

  /** MOD-801 carried over: any valid hex is accepted; invalid reverts silently. */
  const applyHex = (): void => {
    const normalized = normalizeHexColor(hexDraft);
    if (!normalized) {
      setHexDraft(draft);
      return;
    }
    setDraft(normalized);
    setHexDraft(normalized);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>主题色</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* v0.5.3 FEAT-N09: the shared swatch grid (was inline here). */}
          <ColorPalette
            aria-label="主题色调色板"
            value={draft}
            onSelect={(color) => {
              setDraft(color);
              setHexDraft(color);
            }}
          />

          <div className="flex items-center gap-2">
            <Input
              value={hexDraft}
              onChange={(event) => setHexDraft(event.target.value)}
              onBlur={applyHex}
              placeholder="#RRGGBB"
              className="h-8 w-32 font-mono text-xs"
              aria-label="自定义主题色"
            />
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={applyHex}>
              应用
            </Button>
          </div>

          {/* §8.2(b) 内容 3: a live preview of the draft. */}
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <span
              className="h-8 w-8 shrink-0 rounded-full border"
              style={{ backgroundColor: draft }}
              data-testid="theme-color-preview"
            />
            <span className="font-mono text-xs">{draft || DEFAULT_THEME_COLOR}</span>
          </div>
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
