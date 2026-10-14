import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ImageUploaderProps {
  imageUrl: string | null;
  thumbUrl?: string | null;
  width?: number | null;
  height?: number | null;
  size?: number | null;
  uploading: boolean;
  deleting: boolean;
  accept?: string;
  maxDimension?: number;
  onUpload: (file: File) => void;
  onDelete: () => void;
}

const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';

export function ImageUploader({
  imageUrl,
  thumbUrl,
  width,
  height,
  size,
  uploading,
  deleting,
  accept = DEFAULT_ACCEPT,
  maxDimension,
  onUpload,
  onDelete,
}: ImageUploaderProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const preview = thumbUrl ?? imageUrl;

  const handleFiles = (files: FileList | null): void => {
    const file = files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div className="flex gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => event.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-md border-2 border-dashed text-center text-xs text-muted-foreground transition-colors',
          dragging ? 'border-primary bg-accent' : 'border-input',
        )}
      >
        {preview ? (
          <img
            src={preview}
            alt="预览"
            draggable={false}
            className="no-drag h-full w-full object-cover"
          />
        ) : (
          <>
            <ImagePlus className="h-5 w-5" />
            <span>拖拽或点击上传</span>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between">
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            支持 PNG / JPEG / WebP / SVG，≤ 2 MB
            {maxDimension ? `，最长边将压缩至 ${maxDimension}px` : ''}。
          </p>
          {imageUrl ? (
            <p>
              {width ?? '?'} × {height ?? '?'}
              {size ? ` · ${(size / 1024).toFixed(0)} KB` : ''}
            </p>
          ) : (
            <p>尚未上传图片。</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mr-1 h-3.5 w-3.5" />
            {imageUrl ? '替换' : '上传'}
          </Button>
          {imageUrl ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={deleting}
              onClick={onDelete}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              删除
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
