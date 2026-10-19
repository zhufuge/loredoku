import { useEffect, useMemo, useRef } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { MAP_COVER_ASPECT, UPLOAD_ALLOWED_MIME, UPLOAD_MAX_SIZE } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * FEAT-H03 (docs/v0.4.2.md §3): a map's cover is optional, and it is a **file**,
 * while create / edit are JSON. So the picker only ever hands the caller a
 * `File` — uploading is the caller's second step.
 */
const COVER_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';
/** §3.2(a): the same ceiling the server enforces. */
const COVER_MAX_MB = Math.round(UPLOAD_MAX_SIZE / 1024 / 1024);

/** §3.2(a): reject before the request; the caller keeps its previous state. */
function coverProblem(file: File): string | null {
  if (!(UPLOAD_ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return '仅支持 PNG / JPEG / WebP / SVG 图片';
  }
  if (file.size > UPLOAD_MAX_SIZE) {
    return `封面不能超过 ${COVER_MAX_MB} MB`;
  }
  return null;
}

export interface CoverPickerProps {
  /** The map's current cover on the server (`null` when it has none). */
  storedUrl: string | null;
  file: File | null;
  /** §3.2(a): the explicit 「移除」 — the stored cover is dropped on save. */
  removed: boolean;
  disabled?: boolean;
  /**
   * `row` = the dialogs' side-by-side frame; `stack` = the editor drawer's
   * narrow column (the preview takes the full width, buttons go underneath).
   */
  layout?: 'row' | 'stack';
  onPick: (file: File | null) => void;
  onRemove: () => void;
  /** Offered while `removed` — lets the user take the removal back. */
  onRestore?: () => void;
}

/**
 * §3.2(a): four states, one frame — nothing / a picked file / the stored cover /
 * explicitly removed. 16:10, `object-cover`, same shape as the game deploy box.
 */
export function CoverPicker({
  storedUrl,
  file,
  removed,
  disabled = false,
  layout = 'row',
  onPick,
  onRemove,
  onRestore,
}: CoverPickerProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const stored = removed ? null : storedUrl;
  const showStored = !file && stored !== null;

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">封面（可选）</span>
      <div className={layout === 'row' ? 'flex gap-3' : 'grid gap-2'}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          style={{ aspectRatio: String(MAP_COVER_ASPECT) }}
          className={cn(
            'flex cursor-pointer items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-input text-muted-foreground transition-colors hover:border-primary',
            layout === 'row' ? 'w-40 shrink-0' : 'w-full',
            disabled ? 'cursor-not-allowed opacity-60' : undefined,
          )}
        >
          {preview ? (
            <img src={preview} alt="封面预览" draggable={false} className="h-full w-full object-cover" />
          ) : showStored ? (
            <img src={stored} alt="当前封面" draggable={false} className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-xs">
              <ImagePlus className="h-5 w-5" />
              未设置封面
            </span>
          )}
        </button>
        <div className="flex flex-1 flex-col justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            支持 PNG / JPEG / WebP / SVG，≤ {COVER_MAX_MB} MB。可留空。
            {file ? `已选择：${file.name}` : showStored ? '当前为该地图的封面。' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mr-1 h-3.5 w-3.5" />
              {file || showStored ? '更换' : '选择图片'}
            </Button>
            {file ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                className="text-destructive hover:text-destructive"
                onClick={() => onPick(null)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                取消选择
              </Button>
            ) : showStored ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                className="text-destructive hover:text-destructive"
                onClick={onRemove}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                移除
              </Button>
            ) : removed && onRestore ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={onRestore}
              >
                恢复封面
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={COVER_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const picked = event.target.files?.[0] ?? null;
          event.target.value = '';
          if (!picked) return;
          const problem = coverProblem(picked);
          if (problem) {
            toast.error(problem);
            return;
          }
          onPick(picked);
        }}
      />
    </div>
  );
}
