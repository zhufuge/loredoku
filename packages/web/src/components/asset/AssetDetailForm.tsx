import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ASSET_SIZE_MAX,
  ASSET_SIZE_MIN,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  DEFAULT_BG_COLOR,
  UPLOAD_MAX_SIZE,
  blockingFor,
  hasAppearance,
  type AppearanceMode,
  type Asset,
  type AssetType,
  type AssetFitMode,
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
import { ImageUploader } from '@/components/asset/ImageUploader';
import { SegmentedRadio } from '@/components/ui/segmented-radio';
import {
  useDeleteAssetImage,
  useSetAssetActive,
  useUpdateAsset,
  useUploadAssetImage,
} from '@/hooks/useAssets';

/** FEAT-O11: the type as radio buttons (背景 / 物品). */
const ASSET_TYPE_OPTIONS = ASSET_TYPES.map((value) => ({
  value,
  label: ASSET_TYPE_LABELS[value],
}));

const FIT_MODE_LABELS: Record<AssetFitMode, string> = {
  cover: '裁切填满（cover）',
  contain: '完整留白（contain）',
};

interface AssetDetailFormProps {
  asset: Asset;
  onRequestDelete: (asset: Asset) => void;
}

export function AssetDetailForm({ asset, onRequestDelete }: AssetDetailFormProps): JSX.Element {
  const [name, setName] = useState(asset.name);
  const [type, setType] = useState(asset.type);
  const [widthCells, setWidthCells] = useState(asset.widthCells);
  const [heightCells, setHeightCells] = useState(asset.heightCells);
  const [blocking, setBlocking] = useState(asset.blocking);
  const [fitMode, setFitMode] = useState<AssetFitMode>(asset.fitMode);
  // v0.5.1 FEAT-L01: image mode by default; a stored colour means colour block.
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(
    asset.bgColor ? 'color' : 'image',
  );
  const [bgColor, setBgColor] = useState(asset.bgColor ?? DEFAULT_BG_COLOR);
  const [confirmDeleteImage, setConfirmDeleteImage] = useState(false);

  const updateMutation = useUpdateAsset();
  const uploadMutation = useUploadAssetImage();
  const deleteImageMutation = useDeleteAssetImage();
  const activeMutation = useSetAssetActive();

  useEffect(() => {
    setName(asset.name);
    setType(asset.type);
    setWidthCells(asset.widthCells);
    setHeightCells(asset.heightCells);
    setBlocking(asset.blocking);
    setFitMode(asset.fitMode);
    setAppearanceMode(asset.bgColor ? 'color' : 'image');
    setBgColor(asset.bgColor ?? DEFAULT_BG_COLOR);
  }, [asset.id, asset.updatedAt]);

  const saving = updateMutation.isPending;
  // v0.5.1 FEAT-L01: an uploaded image **or** a colour block can be activated.
  const activatable = hasAppearance(Boolean(asset.imageUrl), asset.bgColor);
  // v0.5.2 FEAT-M04: 「阻挡」 is meaningless for a background asset.
  const blockable = type === 'item';

  const handleSave = async (): Promise<void> => {
    try {
      await updateMutation.mutateAsync({
        id: asset.id,
        payload: {
          name: name.trim(),
          type,
          widthCells,
          heightCells,
          blocking: blockingFor(type, blocking),
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
          <h2 className="text-xl font-semibold">{asset.name}</h2>
          <p className="text-xs text-muted-foreground">业务 ID：{asset.code}（不可修改）</p>
        </div>
        <div className="flex items-center gap-2">
          {asset.isActive ? (
            <>
              <span className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                启用中
              </span>
              <Button
                variant="outline"
                disabled={activeMutation.isPending}
                onClick={() => activeMutation.mutate({ id: asset.id, active: false })}
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
                onClick={() => activeMutation.mutate({ id: asset.id, active: true })}
              >
                启用
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => onRequestDelete(asset)}
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
            <Label>类型</Label>
            {/* FEAT-O11 (docs/v0.5.4.md §5.4): buttons instead of a dropdown. */}
            <SegmentedRadio
              ariaLabel="类型"
              value={type}
              options={ASSET_TYPE_OPTIONS}
              onChange={(next) => setType(next as Asset['type'])}
            />
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
          {/* v0.5.2 FEAT-M04: a background asset is never blocking, so the
              checkbox would be a lie — it is only offered for 物品.
              FIX-O08 (docs/v0.5.4.md §5.1): the 「背景类型恒定不阻挡」 caption
              is gone — the rule still holds, it just no longer explains itself. */}
          {blockable ? (
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={blocking}
                onChange={(event) => setBlocking(event.target.checked)}
                className="h-4 w-4"
              />
              阻挡
            </label>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label>图片填充方式</Label>
          <select
            value={fitMode}
            onChange={(event) => setFitMode(event.target.value as AssetFitMode)}
            className="h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {(['cover', 'contain'] as AssetFitMode[]).map((value) => (
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
            imageUrl={asset.imageUrl}
            thumbUrl={asset.imageThumbUrl}
            width={asset.imageWidth}
            height={asset.imageHeight}
            size={asset.imageSize}
            uploading={uploadMutation.isPending}
            deleting={deleteImageMutation.isPending}
            onUpload={(file) => uploadMutation.mutate({ id: asset.id, file })}
            onDelete={() => setConfirmDeleteImage(true)}
          />
        </AppearanceField>
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
              {asset.bgColor
                ? '该资源是纯色块，删除图片后仍可继续启用。'
                : '删除图片后，该资源将自动停用。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteImageMutation.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteImageMutation.isPending}
              onClick={() =>
                deleteImageMutation.mutate(asset.id, {
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
