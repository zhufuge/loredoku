import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  DEFAULT_ITEM_CATEGORY,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS,
  ITEM_CODE_MAX_LENGTH,
  ITEM_CODE_PATTERN,
  ITEM_NAME_MAX_LENGTH,
  ITEM_SIZE_DEFAULT,
  ITEM_SIZE_MAX,
  ITEM_SIZE_MIN,
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
import { useCreateItem } from '@/hooks/useItems';

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
});

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  name: '',
  code: '',
  category: DEFAULT_ITEM_CATEGORY,
  widthCells: ITEM_SIZE_DEFAULT,
  heightCells: ITEM_SIZE_DEFAULT,
  canStand: false,
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
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  const createMutation = useCreateItem((item) => {
    onOpenChange(false);
    onCreated(item.id);
  });

  useEffect(() => {
    if (!open) reset(DEFAULTS);
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    createMutation.mutate({
      name: values.name,
      code: values.code,
      category: values.category,
      widthCells: values.widthCells,
      heightCells: values.heightCells,
      canStand: values.canStand,
    });
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? '创建中…' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
