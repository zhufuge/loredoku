import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Card, CardTriggerInput } from '@murdoku/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageUploader } from '@/components/card/ImageUploader';
import { MetaEditor, type MetaRow } from '@/components/card/MetaEditor';
import { TriggerEditor, type EditableTrigger } from '@/components/card/TriggerEditor';
import {
  useDeleteCardImage,
  useReplaceTriggers,
  useUpdateCard,
  useUploadCardImage,
} from '@/hooks/useCards';
import { parseJsonObject, stringifyJson } from '@/lib/json';

interface CardDetailFormProps {
  card: Card;
  onRequestDelete: (card: Card) => void;
}

function buildMetaRows(card: Card): MetaRow[] {
  return Object.entries(card.meta).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

function buildTriggerRows(card: Card): EditableTrigger[] {
  return card.triggers.map((trigger) => ({
    triggerKey: trigger.triggerKey,
    triggerValue: trigger.triggerValue,
    effectType: trigger.effectType,
    effectConfigText: stringifyJson(trigger.effectConfig),
  }));
}

export function CardDetailForm({ card, onRequestDelete }: CardDetailFormProps): JSX.Element {
  const [name, setName] = useState(card.name);
  const [isActive, setIsActive] = useState(card.isActive);
  const [metaRows, setMetaRows] = useState<MetaRow[]>(() => buildMetaRows(card));
  const [triggerRows, setTriggerRows] = useState<EditableTrigger[]>(() => buildTriggerRows(card));

  const updateMutation = useUpdateCard();
  const replaceTriggersMutation = useReplaceTriggers();
  const uploadMutation = useUploadCardImage();
  const deleteImageMutation = useDeleteCardImage();

  useEffect(() => {
    setName(card.name);
    setIsActive(card.isActive);
    setMetaRows(buildMetaRows(card));
    setTriggerRows(buildTriggerRows(card));
  }, [card.id, card.updatedAt]);

  const saving = updateMutation.isPending || replaceTriggersMutation.isPending;

  const handleSave = async (): Promise<void> => {
    const meta: Record<string, unknown> = {};
    for (const row of metaRows) {
      const key = row.key.trim();
      if (key) {
        meta[key] = row.value;
      }
    }

    const triggers: CardTriggerInput[] = [];
    for (const row of triggerRows) {
      if (!row.triggerKey.trim() || !row.triggerValue.trim()) {
        continue;
      }
      const config = parseJsonObject(row.effectConfigText);
      if (!config.ok) {
        toast.error(`触发 ${row.triggerKey} 的 effect_config 不是合法 JSON 对象`);
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
        id: card.id,
        payload: { name: name.trim(), meta, isActive },
      });
      await replaceTriggersMutation.mutateAsync({ id: card.id, triggers });
    } catch {
      return;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{card.name}</h2>
          <p className="text-xs text-muted-foreground">业务 ID：{card.code}（不可修改）</p>
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
            onClick={() => onRequestDelete(card)}
          >
            停用 / 删除
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label>名称</Label>
          <Input value={name} onChange={(event) => setName(event.target.value)} className="max-w-sm" />
        </div>

        <div className="grid gap-2">
          <Label>图片</Label>
          <ImageUploader
            card={card}
            uploading={uploadMutation.isPending}
            deleting={deleteImageMutation.isPending}
            onUpload={(file) => uploadMutation.mutate({ id: card.id, file })}
            onDelete={() => deleteImageMutation.mutate(card.id)}
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
