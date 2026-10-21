import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  PUZZLE_DESCRIPTION_MAX_LENGTH,
  PUZZLE_NAME_MAX_LENGTH,
  type PuzzleEntrySummary,
} from '@loredoku/shared';
import { CoverPicker } from '@/components/common/CoverPicker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRemovePuzzleCover, useUpdatePuzzle, useUploadPuzzleCover } from '@/hooks/usePuzzles';

/**
 * 编辑谜题信息（名称 / 描述 / 封面）—— 只服务**草稿行**：版本行是发布时冻住
 * 的快照，改名会破坏「版本不可变」，所以列表里那个按钮根本不给版本行渲染。
 *
 * 改名 / 改描述是 JSON 请求，封面是二进制，所以是两步：先 PATCH，再按需传 /
 * 删封面（同 `EditMapDialog`）。
 */
interface EditPuzzleDialogProps {
  entry: PuzzleEntrySummary | null;
  onOpenChange: (open: boolean) => void;
}

export function EditPuzzleDialog({ entry, onOpenChange }: EditPuzzleDialogProps): JSX.Element {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);

  const updateMutation = useUpdatePuzzle();
  const uploadMutation = useUploadPuzzleCover();
  const removeCoverMutation = useRemovePuzzleCover();
  const busy =
    updateMutation.isPending || uploadMutation.isPending || removeCoverMutation.isPending;

  useEffect(() => {
    if (!entry) return;
    setName(entry.name);
    setDescription(entry.description ?? '');
    setCover(null);
    setCoverRemoved(false);
  }, [entry]);

  const submit = async (): Promise<void> => {
    if (!entry) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      toast.error('请填写谜题名称');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: entry.id,
        payload: {
          name: trimmed,
          description: description.trim().length > 0 ? description.trim() : null,
        },
      });
    } catch {
      return;
    }
    try {
      if (cover) {
        await uploadMutation.mutateAsync({ id: entry.id, file: cover });
      } else if (coverRemoved && entry.coverUrl) {
        await removeCoverMutation.mutateAsync(entry.id);
      }
    } catch {
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑谜题</DialogTitle>
          <DialogDescription>画布与参与者配置在编辑器里调整。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-puzzle-name">名称</Label>
            <Input
              id="edit-puzzle-name"
              value={name}
              maxLength={PUZZLE_NAME_MAX_LENGTH}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-puzzle-description">描述</Label>
            <Textarea
              id="edit-puzzle-description"
              value={description}
              rows={3}
              maxLength={PUZZLE_DESCRIPTION_MAX_LENGTH}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <CoverPicker
            noun="谜题"
            storedUrl={entry?.coverUrl ?? null}
            file={cover}
            removed={coverRemoved}
            disabled={busy}
            onPick={(picked) => {
              setCover(picked);
              // 新选的文件永远盖过「准备移除」这个状态。
              if (picked) setCoverRemoved(false);
            }}
            onRemove={() => {
              setCover(null);
              setCoverRemoved(true);
            }}
            onRestore={() => setCoverRemoved(false)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void submit();
            }}
          >
            {busy ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
