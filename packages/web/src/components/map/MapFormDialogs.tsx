import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { MapEntry } from '@loredoku/shared';
import { CoverPicker } from '@/components/common/CoverPicker';
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
import { ThemeScopePill } from '@/components/theme/ThemeScopePill';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  useCreateMap,
  useRemoveMapCover,
  useUpdateMap,
  useUploadMapCover,
} from '@/hooks/useMaps';
import { cn } from '@/lib/utils';

const createSchema = z.object({
  name: z.string().trim().min(1, '请输入地图名称').max(100, '名称不能超过 100 字'),
  description: z.string().trim().max(500, '描述不能超过 500 字').optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;

interface CreateMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 没有工作空间上下文时（单测、整屏入口）的兜底主题**编码**（§19）。 */
  defaultThemeCode?: string | null;
}

export function CreateMapDialog({
  open,
  onOpenChange,
  defaultThemeCode = null,
}: CreateMapDialogProps): JSX.Element {
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
  /** v0.8.0 §18：主题由工作空间定；没有上下文时才可改（见下面的胶囊）。 */
  const workspace = useWorkspace();
  const boundaryThemeCode = workspace?.themeCode ?? defaultThemeCode;
  const [themeCode, setThemeCode] = useState<string | null>(boundaryThemeCode);

  const createMutation = useCreateMap();
  const uploadMutation = useUploadMapCover();
  const busy = createMutation.isPending || uploadMutation.isPending;

  useEffect(() => {
    if (!open) {
      reset({ name: '', description: '' });
      setCover(null);
      setCreatedId(null);
      setCoverFailed(false);
      setThemeCode(boundaryThemeCode);
    }
  }, [open, reset, boundaryThemeCode]);

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

    let mapEntry: MapEntry;
    try {
      mapEntry = await createMutation.mutateAsync({
        name: values.name,
        description: values.description?.trim() ? values.description.trim() : undefined,
        // 服务端必填（§19）；胶囊同步过，正常路径不会是空串。
        themeCode: themeCode ?? '',
      });
    } catch {
      return;
    }

    if (cover) {
      try {
        await uploadMutation.mutateAsync({ id: mapEntry.id, file: cover });
      } catch {
        setCreatedId(mapEntry.id);
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
            <Label htmlFor="map-name">名称</Label>
            <Input
              id="map-name"
              placeholder="例如：新手村地图"
              disabled={createdId !== null}
              {...register('name')}
            />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          {/* v0.8.0 §16.7：名称 → 主题。建行之后不可改，所以只在这里出现一次。
              v0.8.0 §18：在工作空间里主题由地址定，一律只读。 */}
          <ThemeScopePill
            value={themeCode}
            onChange={setThemeCode}
            locked={workspace !== null || createdId !== null}
            lockedHint={workspace ? '当前工作空间' : '已创建'}
          />
          <div className="grid gap-2">
            <Label htmlFor="map-description">描述</Label>
            <Textarea
              id="map-description"
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

interface EditMapDialogProps {
  mapEntry: MapEntry | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * OPT-H02 + FEAT-H03: this dialog no longer only renames — it edits the map's
 * name, description **and** cover, so it is 「编辑地图」 now.
 */
export function EditMapDialog({ mapEntry, onOpenChange }: EditMapDialogProps): JSX.Element {
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
    if (mapEntry) {
      reset({ name: mapEntry.name, description: mapEntry.description ?? '' });
      setCover(null);
      setCoverRemoved(false);
    }
  }, [mapEntry, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!mapEntry) return;
    try {
      await updateMutation.mutateAsync({
        id: mapEntry.id,
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
        await uploadMutation.mutateAsync({ id: mapEntry.id, file: cover });
      } else if (coverRemoved && mapEntry.coverUrl) {
        await removeCoverMutation.mutateAsync(mapEntry.id);
      }
    } catch {
      return;
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={mapEntry !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑地图</DialogTitle>
          <DialogDescription>画布尺寸在编辑器里调整。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="edit-map-name">名称</Label>
            <Input id="edit-map-name" {...register('name')} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-map-description">描述</Label>
            <Textarea id="edit-map-description" {...register('description')} />
            {errors.description ? (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            ) : null}
          </div>

          <CoverPicker
            storedUrl={mapEntry?.coverUrl ?? null}
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
            onRestore={() => setCoverRemoved(false)}
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
