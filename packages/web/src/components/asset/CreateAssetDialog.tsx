import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  APPEARANCE_MODES,
  ASSET_CODE_MAX_LENGTH,
  ASSET_CODE_PATTERN,
  ASSET_NAME_MAX_LENGTH,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  BG_COLOR_PATTERN,
  DEFAULT_APPEARANCE_MODE,
  DEFAULT_ASSET_TYPE,
  DEFAULT_BG_COLOR,
  blockingFor,
  hasAppearance,
  type AppearanceMode,
} from '@loredoku/shared';
import { AppearanceField } from '@/components/appearance/AppearanceField';
import { PendingImageField } from '@/components/appearance/PendingImageField';
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
import { SegmentedRadio } from '@/components/ui/segmented-radio';
import { useCreateAsset, useUpdateAsset, useUploadAssetVariantImage } from '@/hooks/useAssets';

/** FEAT-O11: the type as radio buttons (背景 / 物品). */
const ASSET_TYPE_OPTIONS = ASSET_TYPES.map((value) => ({
  value,
  label: ASSET_TYPE_LABELS[value],
}));

const schema = z.object({
  name: z.string().trim().min(1, '请输入资源名称').max(ASSET_NAME_MAX_LENGTH, '名称过长'),
  code: z
    .string()
    .trim()
    .min(1, '请输入业务 ID')
    .max(ASSET_CODE_MAX_LENGTH, '业务 ID 过长')
    .regex(ASSET_CODE_PATTERN, '业务 ID 仅允许字母、数字与下划线'),
  type: z.enum(ASSET_TYPES),
  blocking: z.boolean(),
  /** v0.5.1 FEAT-L01: image mode (default) or a colour block. */
  appearanceMode: z.enum(APPEARANCE_MODES),
  bgColor: z.string().regex(BG_COLOR_PATTERN, '颜色需为 #RRGGBB 格式'),
});

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  name: '',
  code: '',
  type: DEFAULT_ASSET_TYPE,
  blocking: false,
  appearanceMode: DEFAULT_APPEARANCE_MODE,
  bgColor: DEFAULT_BG_COLOR,
};

interface CreateAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
}

export function CreateAssetDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateAssetDialogProps): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });
  const appearanceMode = watch('appearanceMode');
  const type = watch('type');
  // v0.5.2 FEAT-M05: the picked file waits for the create call to hand back an
  // id; a colour block needs no image at all.
  const [file, setFile] = useState<File | null>(null);

  const createMutation = useCreateAsset();
  const uploadMutation = useUploadAssetVariantImage();
  /** FEAT-N06 §5.4: reverts an auto-enable whose image never landed. */
  const updateMutation = useUpdateAsset();

  useEffect(() => {
    if (!open) {
      reset(DEFAULTS);
      setFile(null);
    }
  }, [open, reset]);

  const busy = createMutation.isPending || uploadMutation.isPending || updateMutation.isPending;

  const onSubmit = handleSubmit(async (values) => {
    // v0.5.1 FEAT-L01: colour block → colour; image mode → null.
    const bgColor = values.appearanceMode === 'color' ? values.bgColor : null;
    /**
     * v0.5.3 FEAT-N06 (docs/v0.5.3.md §5): an appearance handed over at create
     * time enables the asset right away — 「建完还得再点一次启用」 was pure
     * repetition. `hasAppearance` is the same predicate v0.5.1 uses when an
     * image is deleted, so the two can never disagree.
     */
    const isActive = hasAppearance(file !== null, bgColor);
    let asset: { id: number; variants: Array<{ id: number }> };
    try {
      asset = await createMutation.mutateAsync({
        name: values.name,
        code: values.code,
        type: values.type,
        blocking: blockingFor(values.type, values.blocking),
        bgColor,
        isActive,
      });
    } catch {
      // The hook already toasted the reason (e.g. duplicate 业务 ID).
      return;
    }
    // §5.1: an upload failure must not swallow the created asset — the dialog
    // closes either way and the user retries from the detail pane.
    if (file) {
      const uploaded = await uploadMutation
        .mutateAsync({ assetId: asset.id, variantId: asset.variants[0]!.id, file })
        .then(() => true)
        .catch(() => false);
      /**
       * §5.4: the only reason this asset is enabled is the image that just
       * failed to land — put it back to 停用 so no「启用但无外观」row is left.
       * A colour block needs no image, so it stays enabled.
       */
      if (!uploaded && isActive && !bgColor) {
        await updateMutation.mutateAsync({ id: asset.id, payload: { isActive: false } });
      }
    }
    onOpenChange(false);
    onCreated(asset.id);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建资源</DialogTitle>
          <DialogDescription>业务 ID 创建后不可修改。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="asset-name">名称</Label>
            <Input id="asset-name" placeholder="例如：大树" {...register('name')} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="asset-code">业务 ID</Label>
            <Input id="asset-code" placeholder="big_tree" {...register('code')} />
            {errors.code ? <p className="text-xs text-destructive">{errors.code.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="asset-type">类型</Label>
            {/* FEAT-O11 (docs/v0.5.4.md §5.4): buttons instead of a dropdown. */}
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <SegmentedRadio
                  id="asset-type"
                  ariaLabel="类型"
                  value={field.value}
                  options={ASSET_TYPE_OPTIONS}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
          {/* v0.5.2 FEAT-M04: a background asset is never blocking, so the
              checkbox only exists for 物品. */}
          {type === 'item' ? (
            <label className="flex items-center gap-2 text-sm">
              <Controller
                control={control}
                name="blocking"
                render={({ field }) => (
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                    className="h-4 w-4"
                  />
                )}
              />
              阻挡（不可站立、不可放置）
            </label>
          ) : null}
          <Controller
            control={control}
            name="appearanceMode"
            render={({ field }) => (
              <AppearanceField
                id="asset-appearance"
                mode={field.value as AppearanceMode}
                onModeChange={(mode) => field.onChange(mode)}
                bgColor={watch('bgColor')}
                onBgColorChange={(value) => setValue('bgColor', value)}
              >
                {/* v0.5.2 FEAT-M05: upload right here, no "create first"
                    round trip for the user. */}
                <PendingImageField
                  id="asset-image"
                  label="资源图片"
                  file={file}
                  onFileChange={setFile}
                />
              </AppearanceField>
            )}
          />
          {errors.bgColor ? (
            <p className="text-xs text-destructive">{errors.bgColor.message}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? '创建中…' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
