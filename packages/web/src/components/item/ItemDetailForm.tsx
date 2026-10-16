import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  DEFAULT_BG_COLOR,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS,
  ITEM_SIZE_MAX,
  ITEM_SIZE_MIN,
  UPLOAD_MAX_SIZE,
  canStandFor,
  hasAppearance,
  type AppearanceMode,
  type Item,
  type ItemCategory,
  type ItemFitMode,
} from '@loredoku/shared';
import { AppearanceField } from '@/components/appearance/AppearanceField';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageUploader } from '@/components/item/ImageUploader';
import {
  useDeleteItemImage,
  useSetItemActive,
  useUpdateItem,
  useUploadItemImage,
} from '@/hooks/useItems';

const FIT_MODE_LABELS: Record<ItemFitMode, string> = {
  cover: '裁切填满（cover）',
  contain: '完整留白（contain）',
};

interface ItemDetailFormProps {
  item: Item;
  onRequestDelete: (item: Item) => void;
}

export function ItemDetailForm({ item, onRequestDelete }: ItemDetailFormProps): JSX.Element {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [widthCells, setWidthCells] = useState(item.widthCells);
  const [heightCells, setHeightCells] = useState(item.heightCells);
  const [canStand, setCanStand] = useState(item.canStand);
  const [fitMode, setFitMode] = useState<ItemFitMode>(item.fitMode);
  // v0.5.1 FEAT-L01: image mode by default; a stored colour means colour block.
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(
    item.bgColor ? 'color' : 'image',
  );
  const [bgColor, setBgColor] = useState(item.bgColor ?? DEFAULT_BG_COLOR);
  const [confirmDeleteImage, setConfirmDeleteImage] = useState(false);

  const updateMutation = useUpdateItem();
  const uploadMutation = useUploadItemImage();
  const deleteImageMutation = useDeleteItemImage();
  const activeMutation = useSetItemActive();

  useEffect(() => {
    setName(item.name);
    setCategory(item.category);
    setWidthCells(item.widthCells);
    setHeightCells(item.heightCells);
    setCanStand(item.canStand);
    setFitMode(item.fitMode);
    setAppearanceMode(item.bgColor ? 'color' : 'image');
    setBgColor(item.bgColor ?? DEFAULT_BG_COLOR);
  }, [item.id, item.updatedAt]);

  const saving = updateMutation.isPending;
  // v0.5.1 FEAT-L01: an uploaded image **or** a colour block can be activated.
  const activatable = hasAppearance(Boolean(item.imageUrl), item.bgColor);
  // v0.5.2 FEAT-M04: 「可站立」 is meaningless for a background item.
  const standable = category === 'object';

  const handleSave = async (): Promise<void> => {
    try {
      await updateMutation.mutateAsync({
        id: item.id,
        payload: {
          name: name.trim(),
          category,
          widthCells,
          heightCells,
          canStand: canStandFor(category, canStand),
          fitMode,
          // v0.5.1 FEAT-L01: colour block → colour; image mode → null.
          bgColor: appearanceMode === 'color' ? bgColor : null,
        },
      });
    } catch {
      return;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{item.name}</h2>
          <p className="text-xs text-muted-foreground">业务 ID：{item.code}（不可修改）</p>
        </div>
        <div className="flex items-center gap-2">
          {item.isActive ? (
            <>
              <span className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                启用中
              </span>
              <Button
                variant="outline"
                disabled={activeMutation.isPending}
                onClick={() => activeMutation.mutate({ id: item.id, active: false })}
              >
                停用
              </Button>
            </>
          ) : (
            <>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {activatable ? '已停用' : '未启用'}
              </span>
              <Button
                variant="outline"
                disabled={activeMutation.isPending || !activatable}
                title={activatable ? undefined : '请先上传图片或选择纯色块颜色后再启用'}
                onClick={() => activeMutation.mutate({ id: item.id, active: true })}
              >
                启用
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => onRequestDelete(item)}
              >
                删除
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label>名称</Label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="max-w-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="grid gap-2">
            <Label>分类</Label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as Item['category'])}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(['background', 'object'] as const).map((value) => (
                <option key={value} value={value}>
                  {value === 'background' ? '背景' : '物体'}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label>占格宽</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={widthCells}
              onChange={(event) => setWidthCells(Number(event.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label>占格高</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={heightCells}
              onChange={(event) => setHeightCells(Number(event.target.value))}
            />
          </div>
          {/* v0.5.2 FEAT-M04: a background item is always standable, so the
              checkbox would be a lie — it is only offered for 物体. */}
          {standable ? (
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={canStand}
                onChange={(event) => setCanStand(event.target.checked)}
                className="h-4 w-4"
              />
              可站立
            </label>
          ) : (
            <p className="mt-6 self-center text-xs text-muted-foreground">
              背景类型恒定可站立
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label>图片填充方式</Label>
          <select
            value={fitMode}
            onChange={(event) => setFitMode(event.target.value as ItemFitMode)}
            className="h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {(['cover', 'contain'] as ItemFitMode[]).map((value) => (
              <option key={value} value={value}>
                {FIT_MODE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <AppearanceField
          mode={appearanceMode}
          onModeChange={setAppearanceMode}
          bgColor={bgColor}
          onBgColorChange={setBgColor}
        >
          <ImageUploader
            imageUrl={item.imageUrl}
            thumbUrl={item.imageThumbUrl}
            width={item.imageWidth}
            height={item.imageHeight}
            size={item.imageSize}
            uploading={uploadMutation.isPending}
            deleting={deleteImageMutation.isPending}
            onUpload={(file) => uploadMutation.mutate({ id: item.id, file })}
            onDelete={() => setConfirmDeleteImage(true)}
          />
        </AppearanceField>
        {/* v0.5.2 FEAT-M03: 「扩展信息（meta）」与「触发信息」两节连同背后的
            `items.meta` 列与 `item_triggers` 表一并删除。 */}
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>

      <AlertDialog
        open={confirmDeleteImage}
        onOpenChange={(open) => {
          if (!open && !deleteImageMutation.isPending) setConfirmDeleteImage(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除图片？</AlertDialogTitle>
            <AlertDialogDescription>
              {/* v0.5.1 FEAT-L01: a colour block does not depend on the image. */}
              {item.bgColor
                ? '该物品是纯色块，删除图片后仍可继续启用。'
                : '删除图片后，该物品将自动停用。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteImageMutation.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteImageMutation.isPending}
              onClick={() =>
                deleteImageMutation.mutate(item.id, {
                  onSuccess: () => setConfirmDeleteImage(false),
                })
              }
            >
              {deleteImageMutation.isPending ? '删除中…' : '删除并停用'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
