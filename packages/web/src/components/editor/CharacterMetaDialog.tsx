import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface CharacterMetaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characterName: string | undefined;
  value: Record<string, unknown>;
  onSubmit: (meta: Record<string, unknown>) => void;
}

export function CharacterMetaDialog({
  open,
  onOpenChange,
  characterName,
  value,
  onSubmit,
}: CharacterMetaDialogProps): JSX.Element {
  const [text, setText] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(JSON.stringify(value ?? {}, null, 2));
    setError(null);
  }, [open, value]);

  const handleSubmit = (): void => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text || '{}');
    } catch {
      setError('JSON 格式不正确');
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setError('地图元数据必须是 JSON 对象');
      return;
    }
    onSubmit(parsed as Record<string, unknown>);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>角色地图元数据</DialogTitle>
          <DialogDescription>
            {characterName ? `为「${characterName}」编辑地图级元数据（JSON 对象）。` : '编辑地图级元数据。'}
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          className="h-56 w-full resize-none rounded-md border bg-transparent p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
