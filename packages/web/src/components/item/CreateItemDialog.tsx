import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  APPEARANCE_MODES,
  BG_COLOR_PATTERN,
  DEFAULT_APPEARANCE_MODE,
  DEFAULT_BG_COLOR,
  DEFAULT_ITEM_CATEGORY,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS,
  ITEM_CODE_MAX_LENGTH,
  ITEM_CODE_PATTERN,
  ITEM_NAME_MAX_LENGTH,
  ITEM_SIZE_DEFAULT,
  ITEM_SIZE_MAX,
  ITEM_SIZE_MIN,
  canStandFor,
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
import { useCreateItem, useUpdateItem, useUploadItemImage } from '@/hooks/useItems';

const schema = z.object({
  name: z.string().trim().min(1, '请输入物品名称').max(ITEM_NAME_MAX_LENGTH, '名称过长'),
  code: z
    .string()
    .trim()
    .min(1, '请输入业务 ID')
    .max(ITEM_CODE_MAX_LENGTH, '业务 ID 过长')
    .regex(ITEM_CODE_PATTERN, '业务 ID 仅允许字母、数字与下划线'),
  category: z.enum(ITEM_CATEGORIES),
  widthCells: z.coerce.number().int().min(ITEM_SIZE_MIN).max(ITEM_SIZE_MAX),
  heightCells: z.coerce.number().int().min(ITEM_SIZE_MIN).max(ITEM_SIZE_MAX),
  canStand: z.boolean(),
  /** v0.5.1 FEAT-L01: image mode (default) or a colour block. */
  appearanceMode: z.enum(APPEARANCE_MODES),
  bgColor: z.string().regex(BG_COLOR_PATTERN, '颜色需为 #RRGGBB 格式'),
});

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  name: '',
  code: '',
  category: DEFAULT_ITEM_CATEGORY,
  widthCells: ITEM_SIZE_DEFAULT,
  heightCells: ITEM_SIZE_DEFAULT,
  canStand: false,
  appearanceMode: DEFAULT_APPEARANCE_MODE,
  bgColor: DEFAULT_BG_COLOR,
};

interface CreateItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
}

export function CreateItemDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateItemDialogProps): JSX.Element {
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
  const category = watch('category');
  // v0.5.2 FEAT-M05: the picked file waits for the create call to hand back an
  // id; a colour block needs no image at all.
  const [file, setFile] = useState<File | null>(null);

  const createMutation = useCreateItem();
  const uploadMutation = useUploadItemImage();
  /** FEAT-N06 §5.4: reverts an auto-enable whose image never landed. */
  const updateMutation = useUpdateItem();

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
     * time enables the item right away — 「建完还得再点一次启用」 was pure
     * repetition. `hasAppearance` is the same predicate v0.5.1 uses when an
     * image is deleted, so the two can never disagree.
     */
    const isActive = hasAppearance(file !== null, bgColor);
    let item: { id: number };
    try {
      item = await createMutation.mutateAsync({
        name: values.name,
        code: values.code,
        category: values.category,
        widthCells: values.widthCells,
        heightCells: values.heightCells,
        canStand: canStandFor(values.category, values.canStand),
        bgColor,
        isActive,
      });
    } catch {
      // The hook already toasted the reason (e.g. duplicate 业务 ID).
      return;
    }
    // §5.1: an upload failure must not swallow the created item — the dialog
    // closes either way and the user retries from the detail pane.
    if (file) {
      const uploaded = await uploadMutation
        .mutateAsync({ id: item.id, file })
        .then(() => true)
        .catch(() => false);
      /**
       * §5.4: the only reason this item is enabled is the image that just
       * failed to land — put it back to 停用 so no「启用但无外观」row is left.
       * A colour block needs no image, so it stays enabled.
       */
      if (!uploaded && isActive && !bgColor) {
        await updateMutation.mutateAsync({ id: item.id, payload: { isActive: false } });
      }
    }
    onOpenChange(false);
    onCreated(item.id);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建物品</DialogTitle>
          <DialogDescription>业务 ID 创建后不可修改。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="item-name">名称</Label>
            <Input id="item-name" placeholder="例如：大树" {...register('name')} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="item-code">业务 ID</Label>
            <Input id="item-code" placeholder="big_tree" {...register('code')} />
            {errors.code ? <p className="text-xs text-destructive">{errors.code.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="item-category">分类</Label>
            <select
              id="item-category"
              {...register('category')}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ITEM_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {ITEM_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="item-width">占格宽</Label>
              <Input
                id="item-width"
                type="number"
                min={ITEM_SIZE_MIN}
                max={ITEM_SIZE_MAX}
                {...register('widthCells')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-height">占格高</Label>
              <Input
                id="item-height"
                type="number"
                min={ITEM_SIZE_MIN}
                max={ITEM_SIZE_MAX}
                {...register('heightCells')}
              />
            </div>
          </div>
          {/* v0.5.2 FEAT-M04: a background item is always standable, so the
              checkbox only exists for 物体. */}
          {category === 'object' ? (
            <label className="flex items-center gap-2 text-sm">
              <Controller
                control={control}
                name="canStand"
                render={({ field }) => (
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                    className="h-4 w-4"
                  />
                )}
              />
              可站立（可作为物体层放置）
            </label>
          ) : null}
          <Controller
            control={control}
            name="appearanceMode"
            render={({ field }) => (
              <AppearanceField
                id="item-appearance"
                mode={field.value as AppearanceMode}
                onModeChange={(mode) => field.onChange(mode)}
                bgColor={watch('bgColor')}
                onBgColorChange={(value) => setValue('bgColor', value)}
              >
                {/* v0.5.2 FEAT-M05: upload right here, no "create first"
                    round trip for the user. */}
                <PendingImageField
                  id="item-image"
                  label="物品图片"
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
