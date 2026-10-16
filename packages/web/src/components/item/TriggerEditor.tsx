import { Plus, Trash2 } from 'lucide-react';
import { EFFECT_TYPES, type EffectType } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EditableTrigger {
  triggerKey: string;
  triggerValue: string;
  effectType: EffectType;
  effectConfigText: string;
}

interface TriggerEditorProps {
  rows: EditableTrigger[];
  onChange: (rows: EditableTrigger[]) => void;
}

export function TriggerEditor({ rows, onChange }: TriggerEditorProps): JSX.Element {
  const update = (index: number, patch: Partial<EditableTrigger>): void => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-2 gap-2 rounded-md border p-3">
          <Input
            placeholder="trigger_key 如 group"
            value={row.triggerKey}
            onChange={(event) => update(index, { triggerKey: event.target.value })}
          />
          <Input
            placeholder="trigger_value 如 terrain"
            value={row.triggerValue}
            onChange={(event) => update(index, { triggerValue: event.target.value })}
          />
          <select
            value={row.effectType}
            onChange={(event) => update(index, { effectType: event.target.value as EffectType })}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {EFFECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Input
              placeholder='effect_config JSON 如 {"color":"#22C55E"}'
              value={row.effectConfigText}
              onChange={(event) => update(index, { effectConfigText: event.target.value })}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0 text-destructive hover:text-destructive"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          onChange([
            ...rows,
            { triggerKey: '', triggerValue: '', effectType: 'highlight', effectConfigText: '' },
          ])
        }
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        添加触发
      </Button>
    </div>
  );
}
