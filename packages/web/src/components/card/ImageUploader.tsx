import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import type { Card } from '@murdoku/shared';
import { Button } from '@/components/ui/button';
import { CardThumbnail } from '@/components/card/CardThumbnail';

interface ImageUploaderProps {
  card: Card;
  uploading: boolean;
  deleting: boolean;
  onUpload: (file: File) => void;
  onDelete: () => void;
}

export function ImageUploader({
  card,
  uploading,
  deleting,
  onUpload,
  onDelete,
}: ImageUploaderProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null): void => {
    const file = files?.[0];
    if (file) {
      onUpload(file);
    }
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
        className={`flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed text-center text-xs text-muted-foreground transition-colors ${
          dragging ? 'border-primary bg-accent' : 'border-input'
        }`}
      >
        {card.imageUrl ? (
          <CardThumbnail card={card} className="h-full w-full border-0" />
        ) : (
          <>
            <ImagePlus className="h-5 w-5" />
            <span>拖拽或点击上传</span>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between">
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>支持 PNG / JPEG / WebP / SVG，≤ 2 MB。</p>
          {card.imageUrl ? (
            <p>
              {card.imageWidth ?? '?'} × {card.imageHeight ?? '?'}
              {card.imageSize ? ` · ${(card.imageSize / 1024).toFixed(0)} KB` : ''}
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
            {card.imageUrl ? '替换' : '上传'}
          </Button>
          {card.imageUrl ? (
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
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
