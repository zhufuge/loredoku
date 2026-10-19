import { useEffect, useState } from 'react';
import { DEFAULT_THEME_COLOR, normalizeHexColor } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { ColorInput } from '@/components/ui/color-input';
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

          {/*
            FIX-O15 (docs/v0.5.4.md §7.2): the swatch moved **in front of** the
            hex field — it is both the preview and a native picker, which makes
            the 「应用」 button (and the separate preview row below) redundant.
          */}
          <div className="flex items-center gap-2">
            <ColorInput
              aria-label="主题色"
              value={draft || DEFAULT_THEME_COLOR}
              onChange={(value) => {
                setDraft(value);
                setHexDraft(value);
              }}
            />
            <Input
              value={hexDraft}
              onChange={(event) => setHexDraft(event.target.value)}
              onBlur={applyHex}
              placeholder="#RRGGBB"
              className="h-8 w-32 font-mono text-xs"
              aria-label="自定义主题色"
            />
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
