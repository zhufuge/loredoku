import { useEffect, useState } from 'react';
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  DEFAULT_ASSET_FORM_NAME,
  assetHasAppearance,
  blockingFor,
  type Asset,
  type AssetForm,
} from '@loredoku/shared';
import { AssetFormCard } from '@/components/asset/AssetFormCard';
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
  useCreateAssetForm,
  useDeleteAssetForm,
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
 * - **形态区** — one card per form; each card owns its look and footprint.
 *
 * The split mirrors the data: an asset is 「what it is」, a form is 「how it
 * looks and how many cells it covers」. Both types get the same treatment — a
 * background asset may own several forms as well; only its footprint stays
 * pinned at 1×1, which `AssetFormCard` hides rather than lies about.
 */
export function AssetDetailForm({ asset, onRequestDelete }: AssetDetailFormProps): JSX.Element {
  const [name, setName] = useState(asset.name);
  const [type, setType] = useState(asset.type);
  const [blocking, setBlocking] = useState(asset.blocking);
  const [deleteTarget, setDeleteTarget] = useState<AssetForm | null>(null);

  const updateMutation = useUpdateAsset();
  const activeMutation = useSetAssetActive();
  const createFormMutation = useCreateAssetForm();
  const deleteFormMutation = useDeleteAssetForm();

  useEffect(() => {
    setName(asset.name);
    setType(asset.type);
    setBlocking(asset.blocking);
  }, [asset.id, asset.updatedAt]);

  const saving = updateMutation.isPending;
  // v0.6.1: an asset needs a look somewhere before it can be enabled.
  const activatable = assetHasAppearance(asset);
  const blockable = type === 'item';
  const canDeleteForm = asset.forms.length > 1;

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

  /** 新形态默认 1×1，名字取「形态 N」，撞名由服务端 409 兜底。 */
  const handleAddForm = (): void => {
    const taken = new Set(asset.forms.map((form) => form.name));
    let suggestion = DEFAULT_ASSET_FORM_NAME;
    let index = asset.forms.length + 1;
    while (taken.has(suggestion)) {
      suggestion = `形态 ${index}`;
      index += 1;
    }
    createFormMutation.mutate({
      assetId: asset.id,
      payload: { name: suggestion, widthCells: 1, heightCells: 1 },
    });
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
              每个形态有自己的外观与占格；放置时可任选其一。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={createFormMutation.isPending}
            onClick={handleAddForm}
          >
            {createFormMutation.isPending ? '添加中…' : '添加形态'}
          </Button>
        </div>

        <div className="grid gap-3">
          {asset.forms.map((form) => (
            <AssetFormCard
              key={form.id}
              asset={asset}
              form={form}
              canDelete={canDeleteForm}
              onRequestDelete={setDeleteTarget}
            />
          ))}
        </div>
      </section>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteFormMutation.isPending) setDeleteTarget(null);
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
            <AlertDialogCancel disabled={deleteFormMutation.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteFormMutation.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                deleteFormMutation.mutate(
                  { assetId: asset.id, formId: deleteTarget.id },
                  { onSuccess: () => setDeleteTarget(null) },
                );
              }}
            >
              {deleteFormMutation.isPending ? '删除中…' : '删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
