import { useEffect, useState } from 'react';
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  DEFAULT_ASSET_VARIANT_NAME,
  assetHasAppearance,
  blockingFor,
  type Asset,
  type AssetVariant,
} from '@loredoku/shared';
import { AssetVariantCard } from '@/components/asset/AssetVariantCard';
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
import { SegmentedRadio } from '@/components/ui/segmented-radio';
import {
  useCreateAssetVariant,
  useDeleteAssetVariant,
  useSetAssetActive,
  useUpdateAsset,
} from '@/hooks/useAssets';

/** FEAT-O11: the type as radio buttons (背景 / 物品). */
const ASSET_TYPE_OPTIONS = ASSET_TYPES.map((value) => ({
  value,
  label: ASSET_TYPE_LABELS[value],
}));

interface AssetDetailFormProps {
  asset: Asset;
  onRequestDelete: (asset: Asset) => void;
}

/**
 * v0.6.1 (docs/v0.6.1.md §8.4): the pane splits in two.
 *
 * - **资源区** — identity and behaviour only: name / type / blocking.
 * - **形态区** — one card per variant; each card owns its look.
 *
 * The split mirrors the data: an asset is 「what it is」, a variant is 「how it
 * looks」. Both types get the same treatment — a background asset may own several
 * variants as well. (v0.7.6: the footprint left both the data and the card; where
 * an item sits and how big it draws is the placement's business.)
 */
export function AssetDetailForm({ asset, onRequestDelete }: AssetDetailFormProps): JSX.Element {
  const [name, setName] = useState(asset.name);
  const [type, setType] = useState(asset.type);
  const [blocking, setBlocking] = useState(asset.blocking);
  const [deleteTarget, setDeleteTarget] = useState<AssetVariant | null>(null);

  const updateMutation = useUpdateAsset();
  const activeMutation = useSetAssetActive();
  const createVariantMutation = useCreateAssetVariant();
  const deleteVariantMutation = useDeleteAssetVariant();

  /**
   * 只在换成**另一个资源**时用服务器值重置表单（v0.7.13 fix）。
   *
   * 原来还依赖 `asset.updatedAt`，于是「启用 / 停用」「添加形态」「删除形态」
   * 这些同样会重取的动作，都能把用户改了一半的名字 / 类型按回服务器值。
   * 表单是草稿，后台刷新不该写它。
   */
  useEffect(() => {
    setName(asset.name);
    setType(asset.type);
    setBlocking(asset.blocking);
  }, [asset.id]);

  const saving = updateMutation.isPending;
  // v0.6.1: an asset needs a look somewhere before it can be enabled.
  const activatable = assetHasAppearance(asset);
  const blockable = type === 'item';
  const canDeleteVariant = asset.variants.length > 1;

  const handleSave = async (): Promise<void> => {
    try {
      await updateMutation.mutateAsync({
        id: asset.id,
        payload: {
          name: name.trim(),
          type,
          blocking: blockingFor(type, blocking),
        },
      });
    } catch {
      return;
    }
  };

  /** 新形态不带任何外观，名字取「形态 N」，撞名由服务端 409 兜底。 */
  const handleAddVariant = (): void => {
    const taken = new Set(asset.variants.map((variant) => variant.name));
    let suggestion = DEFAULT_ASSET_VARIANT_NAME;
    let index = asset.variants.length + 1;
    while (taken.has(suggestion)) {
      suggestion = `形态 ${index}`;
      index += 1;
    }
    createVariantMutation.mutate({
      assetId: asset.id,
      payload: { name: suggestion },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{asset.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          {asset.isActive ? (
            <>
              <span className="rounded bg-success/10 px-1.5 py-0.5 text-2xs text-success">
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
              <span className="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
                {activatable ? '已停用' : '未启用'}
              </span>
              <Button
                variant="outline"
                disabled={activeMutation.isPending || !activatable}
                title={activatable ? undefined : '请先给至少一个形态上传图片或选择纯色块颜色后再启用'}
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

      <section className="grid gap-4">
        <h3 className="text-sm font-medium text-muted-foreground">基本信息</h3>
        <div className="grid gap-2">
          <Label>名称</Label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* v0.8.5 §8：编码是**信息**，不是标题的附注 —— 它跟名称并排站在基本信息里，
            只读即可（不用再写一行「不可修改」，改不动这件事由框本身表达）。
            用 `readOnly` 而不是 `disabled`：值还要能选中、复制到联动的 JSON 里。 */}
        <div className="grid gap-2">
          <Label htmlFor="asset-code">编码</Label>
          <Input
            id="asset-code"
            value={asset.code}
            readOnly
            aria-readonly
            className="max-w-sm font-mono text-muted-foreground"
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
          {/* v0.5.2 FEAT-M04: a background asset is never blocking, so the
              checkbox would be a lie — it is only offered for 物品. */}
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

        <div className="flex justify-end border-t pt-4">
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">形态</h3>
            <p className="text-xs text-muted-foreground">
              每个形态有自己的外观；放置时从这些形态里任选其一。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={createVariantMutation.isPending}
            onClick={handleAddVariant}
          >
            {createVariantMutation.isPending ? '添加中…' : '添加形态'}
          </Button>
        </div>

        <div className="grid gap-3">
          {asset.variants.map((variant) => (
            <AssetVariantCard
              key={variant.id}
              asset={asset}
              variant={variant}
              canDelete={canDeleteVariant}
              onRequestDelete={setDeleteTarget}
            />
          ))}
        </div>
      </section>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteVariantMutation.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除形态「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              画布上已放置的占位不受影响；若该形态正被地图使用，服务端会拒绝删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteVariantMutation.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteVariantMutation.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                deleteVariantMutation.mutate(
                  { assetId: asset.id, variantId: deleteTarget.id },
                  { onSuccess: () => setDeleteTarget(null) },
                );
              }}
            >
              {deleteVariantMutation.isPending ? '删除中…' : '删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
