import { useEffect, useState } from 'react';
import {
  ASSET_SIZE_MAX,
  ASSET_SIZE_MIN,
  DEFAULT_BG_COLOR,
  type AppearanceMode,
  type Asset,
  type AssetFitMode,
  type AssetForm,
} from '@loredoku/shared';
import { AppearanceField } from '@/components/appearance/AppearanceField';
import { ImageUploader } from '@/components/asset/ImageUploader';
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
import {
  useDeleteAssetFormImage,
  useUpdateAssetForm,
  useUploadAssetFormImage,
} from '@/hooks/useAssets';

const FIT_MODE_LABELS: Record<AssetFitMode, string> = {
  cover: '裁切填满（cover）',
  contain: '完整留白（contain）',
};

interface AssetFormCardProps {
  asset: Asset;
  form: AssetForm;
  /** False for the last form — the server would answer 409 anyway. */
  canDelete: boolean;
  onRequestDelete: (form: AssetForm) => void;
}

/**
 * v0.6.1 (docs/v0.6.1.md §8.4): one card per form. The look and the footprint
 * save together; the uploaded file applies immediately, matching the old
 * asset-level rhythm.
 *
 * A background asset hides the footprint inputs — its single form always renders
 * as one cell, so those numbers would be a lie (the server rejects them too).
 */
export function AssetFormCard({
  asset,
  form,
  canDelete,
  onRequestDelete,
}: AssetFormCardProps): JSX.Element {
  const background = asset.type === 'background';
  const [name, setName] = useState(form.name);
  const [widthCells, setWidthCells] = useState(form.widthCells);
  const [heightCells, setHeightCells] = useState(form.heightCells);
  const [fitMode, setFitMode] = useState<AssetFitMode>(form.fitMode);
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(
    form.bgColor ? 'color' : 'image',
  );
  const [bgColor, setBgColor] = useState(form.bgColor ?? DEFAULT_BG_COLOR);
  const [confirmDeleteImage, setConfirmDeleteImage] = useState(false);

  const updateMutation = useUpdateAssetForm();
  const uploadMutation = useUploadAssetFormImage();
  const deleteImageMutation = useDeleteAssetFormImage();

  useEffect(() => {
    setName(form.name);
    setWidthCells(form.widthCells);
    setHeightCells(form.heightCells);
    setFitMode(form.fitMode);
    setAppearanceMode(form.bgColor ? 'color' : 'image');
    setBgColor(form.bgColor ?? DEFAULT_BG_COLOR);
  }, [form.id, form.updatedAt]);

  const saving = updateMutation.isPending;

  const handleSave = async (): Promise<void> => {
    try {
      await updateMutation.mutateAsync({
        assetId: asset.id,
        formId: form.id,
        payload: {
          name: name.trim(),
          ...(background ? {} : { widthCells, heightCells }),
          fitMode,
          bgColor: appearanceMode === 'color' ? bgColor : null,
        },
      });
    } catch {
      return;
    }
  };

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">形态 · {form.name}</p>
          <p className="text-xs text-muted-foreground">
            {background ? '背景恒占 1 格' : `占格 ${form.widthCells}×${form.heightCells}`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={!canDelete}
          title={canDelete ? undefined : '资源至少要保留一个形态'}
          onClick={() => onRequestDelete(form)}
        >
          删除
        </Button>
      </div>

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="grid gap-2">
            <Label>形态名称</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          {background ? null : (
            <>
              <div className="grid gap-2">
                <Label>占格宽</Label>
                <Input
                  type="number"
                  min={ASSET_SIZE_MIN}
                  max={ASSET_SIZE_MAX}
                  value={widthCells}
                  onChange={(event) => setWidthCells(Number(event.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label>占格高</Label>
                <Input
                  type="number"
                  min={ASSET_SIZE_MIN}
                  max={ASSET_SIZE_MAX}
                  value={heightCells}
                  onChange={(event) => setHeightCells(Number(event.target.value))}
                />
              </div>
            </>
          )}
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
            imageUrl={form.imageUrl}
            thumbUrl={form.imageThumbUrl}
            width={form.imageWidth}
            height={form.imageHeight}
            size={form.imageSize}
            uploading={uploadMutation.isPending}
            deleting={deleteImageMutation.isPending}
            onUpload={(file) =>
              uploadMutation.mutate({ assetId: asset.id, formId: form.id, file })
            }
            onDelete={() => setConfirmDeleteImage(true)}
          />
        </AppearanceField>
      </div>

      <div className="mt-4 flex justify-end">
        <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
          {saving ? '保存中…' : '保存形态'}
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
              {form.bgColor
                ? '该形态是纯色块，删除图片后仍可继续使用。'
                : '删除后若资源下所有形态都没有外观，资源将自动停用。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteImageMutation.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteImageMutation.isPending}
              onClick={() =>
                deleteImageMutation.mutate(
                  { assetId: asset.id, formId: form.id },
                  { onSuccess: () => setConfirmDeleteImage(false) },
                )
              }
            >
              {deleteImageMutation.isPending ? '删除中…' : '删除图片'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
