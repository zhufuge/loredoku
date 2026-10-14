import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface MetaRow {
  key: string;
  value: string;
}

interface MetaEditorProps {
  rows: MetaRow[];
  onChange: (rows: MetaRow[]) => void;
}

export function MetaEditor({ rows, onChange }: MetaEditorProps): JSX.Element {
  const update = (index: number, patch: Partial<MetaRow>): void => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex gap-2">
          <Input
            placeholder="键"
            value={row.key}
            onChange={(event) => update(index, { key: event.target.value })}
            className="w-40"
          />
          <Input
            placeholder="值"
            value={row.value}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange([...rows, { key: '', value: '' }])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        添加字段
      </Button>
    </div>
  );
}
