import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_BG_COLOR,
  type AppearanceMode,
  type Asset,
  type AssetFitMode,
  type AssetVariant,
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
import { Select } from '@/components/ui/select';
import {
  useDeleteAssetVariantImage,
  useUpdateAssetVariant,
  useUploadAssetVariantImage,
} from '@/hooks/useAssets';
import { cn } from '@/lib/utils';

const FIT_MODE_LABELS: Record<AssetFitMode, string> = {
  cover: '裁切填满（cover）',
  contain: '完整留白（contain）',
};

interface AssetVariantCardProps {
  asset: Asset;
  variant: AssetVariant;
  /** False for the last variant — the server would answer 409 anyway. */
  canDelete: boolean;
  onRequestDelete: (variant: AssetVariant) => void;
}

/**
 * v0.6.1 (docs/v0.6.1.md §8.4): one card per variant. Everything on it saves
 * together; the uploaded file applies immediately, matching the old asset-level
 * rhythm.
 *
 * v0.7.6 (docs/v0.7.6.md §9): the footprint inputs are gone — a variant only
 * describes how the asset **looks**. Where it sits and how big it draws is the
 * placement's business (1 cell + `scale`).
 *
 * v0.7.7 (docs/v0.7.7.md §9): the card folds down to its title line, so an asset
 * with many variants stays scannable. The 背景层 / 物品层 subtitle is gone — the
 * type is stated once at the top of the page, not per variant.
 */
export function AssetVariantCard({
  asset,
  variant,
  canDelete,
  onRequestDelete,
}: AssetVariantCardProps): JSX.Element {
  const [name, setName] = useState(variant.name);
  const [fitMode, setFitMode] = useState<AssetFitMode>(variant.fitMode);
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(
    variant.bgColor ? 'color' : 'image',
  );
  const [bgColor, setBgColor] = useState(variant.bgColor ?? DEFAULT_BG_COLOR);
  const [confirmDeleteImage, setConfirmDeleteImage] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const updateMutation = useUpdateAssetVariant();
  const uploadMutation = useUploadAssetVariantImage();
  const deleteImageMutation = useDeleteAssetVariantImage();

  useEffect(() => {
    setName(variant.name);
    setFitMode(variant.fitMode);
    setAppearanceMode(variant.bgColor ? 'color' : 'image');
    setBgColor(variant.bgColor ?? DEFAULT_BG_COLOR);
  }, [variant.id, variant.updatedAt]);

  const saving = updateMutation.isPending;

  const handleSave = async (): Promise<void> => {
    try {
      await updateMutation.mutateAsync({
        assetId: asset.id,
        variantId: variant.id,
        payload: {
          name: name.trim(),
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
      <div className={cn('flex items-center justify-between gap-3', !collapsed && 'mb-3')}>
        <p className="truncate text-sm font-medium">形态 · {variant.name}</p>
        <div className="flex shrink-0 items-center gap-1">
          {/* 收起态只留标题：删除和保存都要先展开，避免误触。 */}
          {collapsed ? null : (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={!canDelete}
              title={canDelete ? undefined : '资源至少要保留一个形态'}
              onClick={() => onRequestDelete(variant)}
            >
              删除
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            title={collapsed ? '展开形态' : '收起形态'}
            aria-label={collapsed ? '展开形态' : '收起形态'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {collapsed ? null : (
        <>
          <div className="grid gap-4">
            <div className="grid max-w-xs gap-2">
              <Label>形态名称</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>

            <div className="grid gap-2">
              <Label>图片填充方式</Label>
              <Select
                value={fitMode}
                onChange={(event) => setFitMode(event.target.value as AssetFitMode)}
                className="max-w-xs"
              >
                {(['cover', 'contain'] as AssetFitMode[]).map((value) => (
                  <option key={value} value={value}>
                    {FIT_MODE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>

            <AppearanceField
              mode={appearanceMode}
              onModeChange={setAppearanceMode}
              bgColor={bgColor}
              onBgColorChange={setBgColor}
            >
              <ImageUploader
                imageUrl={variant.imageUrl}
                thumbUrl={variant.imageThumbUrl}
                uploading={uploadMutation.isPending}
                deleting={deleteImageMutation.isPending}
                onUpload={(file) =>
                  uploadMutation.mutate({ assetId: asset.id, variantId: variant.id, file })
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
        </>
      )}

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
              {variant.bgColor
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
                  { assetId: asset.id, variantId: variant.id },
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
