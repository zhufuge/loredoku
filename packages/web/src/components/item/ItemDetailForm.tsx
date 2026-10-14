import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS,
  ITEM_SIZE_MAX,
  ITEM_SIZE_MIN,
  UPLOAD_MAX_SIZE,
  type Item,
  type ItemCategory,
  type ItemTriggerInput,
} from '@murdoku/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageUploader } from '@/components/item/ImageUploader';
import { MetaEditor, type MetaRow } from '@/components/item/MetaEditor';
import { TriggerEditor, type EditableTrigger } from '@/components/item/TriggerEditor';
import {
  useDeleteItemImage,
  useReplaceItemTriggers,
  useUpdateItem,
  useUploadItemImage,
} from '@/hooks/useItems';
import { parseJsonObject } from '@/lib/json';

interface ItemDetailFormProps {
  item: Item;
  onRequestDelete: (item: Item) => void;
}

function buildMetaRows(item: Item): MetaRow[] {
  return Object.entries(item.meta).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

function buildTriggerRows(item: Item): EditableTrigger[] {
  return item.triggers.map((trigger) => ({
    triggerKey: trigger.triggerKey,
    triggerValue: trigger.triggerValue,
    effectType: trigger.effectType,
    effectConfigText: JSON.stringify(trigger.effectConfig),
  }));
}

export function ItemDetailForm({ item, onRequestDelete }: ItemDetailFormProps): JSX.Element {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [widthCells, setWidthCells] = useState(item.widthCells);
  const [heightCells, setHeightCells] = useState(item.heightCells);
  const [canStand, setCanStand] = useState(item.canStand);
  const [isActive, setIsActive] = useState(item.isActive);
  const [metaRows, setMetaRows] = useState<MetaRow[]>(buildMetaRows(item));
  const [triggerRows, setTriggerRows] = useState<EditableTrigger[]>(buildTriggerRows(item));

  const updateMutation = useUpdateItem();
  const triggersMutation = useReplaceItemTriggers();
  const uploadMutation = useUploadItemImage();
  const deleteImageMutation = useDeleteItemImage();

  useEffect(() => {
    setName(item.name);
    setCategory(item.category);
    setWidthCells(item.widthCells);
    setHeightCells(item.heightCells);
    setCanStand(item.canStand);
    setIsActive(item.isActive);
    setMetaRows(buildMetaRows(item));
    setTriggerRows(buildTriggerRows(item));
  }, [item.id, item.updatedAt]);

  const saving = updateMutation.isPending || triggersMutation.isPending;

  const handleSave = async (): Promise<void> => {
    const meta: Record<string, unknown> = {};
    for (const row of metaRows) {
      const key = row.key.trim();
      if (key) meta[key] = row.value;
    }

    const triggers = [];
    for (const row of triggerRows) {
      if (!row.triggerKey.trim() || !row.triggerValue.trim()) continue;
      const config = parseJsonObject(row.effectConfigText);
      if (!config.ok) {
        return;
      }
      triggers.push({
        triggerKey: row.triggerKey.trim(),
        triggerValue: row.triggerValue.trim(),
        effectType: row.effectType,
        effectConfig: config.value,
      });
    }

    try {
      await updateMutation.mutateAsync({
        id: item.id,
        payload: {
          name: name.trim(),
          category,
          widthCells,
          heightCells,
          canStand,
          isActive,
          meta,
        },
      });
      await triggersMutation.mutateAsync({ id: item.id, triggers });
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4"
            />
            启用
          </label>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => onRequestDelete(item)}
          >
            停用 / 删除
          </Button>
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
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={canStand}
              onChange={(event) => setCanStand(event.target.checked)}
              className="h-4 w-4"
            />
            可站立
          </label>
        </div>

        <div className="grid gap-2">
          <Label>图片</Label>
          <ImageUploader
            imageUrl={item.imageUrl}
            thumbUrl={item.imageThumbUrl}
            width={item.imageWidth}
            height={item.imageHeight}
            size={item.imageSize}
            uploading={uploadMutation.isPending}
            deleting={deleteImageMutation.isPending}
            onUpload={(file) => uploadMutation.mutate({ id: item.id, file })}
            onDelete={() => deleteImageMutation.mutate(item.id)}
          />
        </div>

        <div className="grid gap-2">
          <Label>扩展信息（meta）</Label>
          <MetaEditor rows={metaRows} onChange={setMetaRows} />
        </div>

        <div className="grid gap-2">
          <Label>触发信息</Label>
          <TriggerEditor rows={triggerRows} onChange={setTriggerRows} />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>
  );
}
