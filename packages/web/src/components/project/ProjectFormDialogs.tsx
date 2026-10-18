import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '@loredoku/shared';
import {
  MAP_COVER_ASPECT,
  UPLOAD_ALLOWED_MIME,
  UPLOAD_MAX_SIZE,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateMap,
  useRemoveMapCover,
  useUpdateMap,
  useUploadMapCover,
} from '@/hooks/useMaps';
import { cn } from '@/lib/utils';

/**
 * FEAT-H03 (docs/v0.4.2.md §3): a map's cover is optional, and it is a **file**,
 * while create / edit are JSON. So it follows the two-step rule the game deploy
 * dialog already uses: the map row is written first, then the artwork is
 * uploaded against the id it now has.
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

interface CoverPickerProps {
  /** The map's current cover on the server (`null` when it has none). */
  storedUrl: string | null;
  file: File | null;
  /** §3.2(a): the explicit 「移除」 — the stored cover is dropped on save. */
  removed: boolean;
  disabled?: boolean;
  onPick: (file: File | null) => void;
  onRemove: () => void;
}

/**
 * §3.2(a): four states, one frame — nothing / a picked file / the stored cover /
 * explicitly removed. 16:10, `object-cover`, same shape as the game deploy box.
 */
function CoverPicker({
  storedUrl,
  file,
  removed,
  disabled = false,
  onPick,
  onRemove,
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
      <div className="flex gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          style={{ aspectRatio: String(MAP_COVER_ASPECT) }}
          className={cn(
            'flex w-40 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-input text-muted-foreground transition-colors hover:border-primary',
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
          <div className="flex gap-2">
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

const createSchema = z.object({
  name: z.string().trim().min(1, '请输入地图名称').max(100, '名称不能超过 100 字'),
  description: z.string().trim().max(500, '描述不能超过 500 字').optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
}: CreateProjectDialogProps): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', description: '' },
  });

  const [cover, setCover] = useState<File | null>(null);
  /**
   * §3.2(b): when the map is created but the cover upload fails, the dialog
   * **stays open** holding the new id — the retry button then only re-uploads,
   * instead of creating a second map.
   */
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);

  const createMutation = useCreateMap();
  const uploadMutation = useUploadMapCover();
  const busy = createMutation.isPending || uploadMutation.isPending;

  useEffect(() => {
    if (!open) {
      reset({ name: '', description: '' });
      setCover(null);
      setCreatedId(null);
      setCoverFailed(false);
    }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    // Retry path: the map already exists, so only the artwork is missing.
    if (createdId !== null) {
      if (!cover) {
        onOpenChange(false);
        return;
      }
      try {
        await uploadMutation.mutateAsync({ id: createdId, file: cover });
        onOpenChange(false);
      } catch {
        // The mutation already explained itself; the dialog stays put.
      }
      return;
    }

    let project: Project;
    try {
      project = await createMutation.mutateAsync({
        name: values.name,
        description: values.description?.trim() ? values.description.trim() : undefined,
      });
    } catch {
      return;
    }

    if (cover) {
      try {
        await uploadMutation.mutateAsync({ id: project.id, file: cover });
      } catch {
        setCreatedId(project.id);
        setCoverFailed(true);
        return;
      }
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建地图</DialogTitle>
          <DialogDescription>创建后进入编辑器，先设置画布尺寸。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="project-name">名称</Label>
            <Input
              id="project-name"
              placeholder="例如：新手村地图"
              disabled={createdId !== null}
              {...register('name')}
            />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-description">描述</Label>
            <Textarea
              id="project-description"
              placeholder="选填"
              disabled={createdId !== null}
              {...register('description')}
            />
            {errors.description ? (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            ) : null}
          </div>

          <CoverPicker
            storedUrl={null}
            file={cover}
            removed={false}
            disabled={busy}
            onPick={setCover}
            onRemove={() => setCover(null)}
          />

          {coverFailed ? (
            <p className="text-xs text-destructive">
              地图已创建，但封面未上传成功。可以「重试上传」，或直接关闭（之后再编辑补上）。
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {createdId !== null ? '关闭' : '取消'}
            </Button>
            <Button type="submit" disabled={busy}>
              {createMutation.isPending
                ? '创建中…'
                : uploadMutation.isPending
                  ? '上传中…'
                  : createdId !== null
                    ? '重试上传'
                    : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const editSchema = z.object({
  name: z.string().trim().min(1, '请输入地图名称').max(100, '名称不能超过 100 字'),
  description: z.string().trim().max(500, '描述不能超过 500 字').optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

interface EditProjectDialogProps {
  project: Project | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * OPT-H02 + FEAT-H03: this dialog no longer only renames — it edits the map's
 * name, description **and** cover, so it is 「编辑地图」 now.
 */
export function EditProjectDialog({ project, onOpenChange }: EditProjectDialogProps): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: '', description: '' },
  });

  const [cover, setCover] = useState<File | null>(null);
  /** §3.2(a): "keep" (default) / "replace" (`cover`) / "remove" (`coverRemoved`). */
  const [coverRemoved, setCoverRemoved] = useState(false);

  const updateMutation = useUpdateMap();
  const uploadMutation = useUploadMapCover();
  const removeCoverMutation = useRemoveMapCover();
  const busy =
    updateMutation.isPending || uploadMutation.isPending || removeCoverMutation.isPending;

  useEffect(() => {
    if (project) {
      reset({ name: project.name, description: project.description ?? '' });
      setCover(null);
      setCoverRemoved(false);
    }
  }, [project, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!project) return;
    try {
      await updateMutation.mutateAsync({
        id: project.id,
        payload: {
          name: values.name,
          description: values.description?.trim() ? values.description.trim() : null,
        },
      });
    } catch {
      return;
    }

    // §3.2(b): the cover is the second step, and only when it actually changed.
    try {
      if (cover) {
        await uploadMutation.mutateAsync({ id: project.id, file: cover });
      } else if (coverRemoved && project.coverUrl) {
        await removeCoverMutation.mutateAsync(project.id);
      }
    } catch {
      return;
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={project !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑地图</DialogTitle>
          <DialogDescription>画布尺寸在编辑器里调整。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="edit-project-name">名称</Label>
            <Input id="edit-project-name" {...register('name')} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-project-description">描述</Label>
            <Textarea id="edit-project-description" {...register('description')} />
            {errors.description ? (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            ) : null}
          </div>

          <CoverPicker
            storedUrl={project?.coverUrl ?? null}
            file={cover}
            removed={coverRemoved}
            disabled={busy}
            onPick={(picked) => {
              setCover(picked);
              // A freshly picked file always wins over a pending removal.
              if (picked) setCoverRemoved(false);
            }}
            onRemove={() => {
              setCover(null);
              setCoverRemoved(true);
            }}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
