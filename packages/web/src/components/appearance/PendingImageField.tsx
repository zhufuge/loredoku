import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface PendingImageFieldProps {
  id: string;
  /** 「物品图片」/「角色头像」… */
  label: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
}

const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';

/**
 * v0.5.2 FEAT-M05 (docs/v0.5.2.md §5): a **create-time** uploader.
 *
 * The record does not exist yet, so there is no `/:id/image` to POST to — the
 * file is held locally and uploaded right after the create call succeeds.
 * Hence `File | null` state instead of a URL, and an object-URL preview that is
 * revoked on unmount / replacement.
 */
export function PendingImageField({
  id,
  label,
  file,
  onFileChange,
  accept = DEFAULT_ACCEPT,
}: PendingImageFieldProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
          {preview ? (
            <img src={preview} alt="预览" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xs text-muted-foreground">未选择</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-xs text-muted-foreground">
            {file ? file.name : '支持 PNG / JPEG / WebP / SVG，≤ 2 MB'}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mr-1 h-3.5 w-3.5" />
              {file ? '更换' : '选择图片'}
            </Button>
            {file ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onFileChange(null)}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                移除
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          onFileChange(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />
    </div>
  );
}
