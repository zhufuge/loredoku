import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  PUZZLE_CODE_MAX_LENGTH,
  PUZZLE_DESCRIPTION_MAX_LENGTH,
  PUZZLE_NAME_MAX_LENGTH,
  puzzleCodeError,
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
 * 编辑谜题信息（名称 / 编码 / 描述 / 封面）—— 只服务**草稿行**：版本行是发布时
 * 冻住的快照，改名会破坏「版本不可变」，所以列表里那个按钮根本不给版本行渲染。
 *
 * v0.8.5 §7：多一格编码。它同时是**存量谜题的补写入口** —— v0.8.5 之前建的谜题
 * 没有编码，部署时只能退回「按名称推导」。留空 = 不改（不会把已有的编码清掉）。
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
  const [code, setCode] = useState('');
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
    setCode(entry.code ?? '');
    setDescription(entry.description ?? '');
    setCover(null);
    setCoverRemoved(false);
  }, [entry]);

  const codeProblem = code.trim().length > 0 ? puzzleCodeError(code) : null;

  const submit = async (): Promise<void> => {
    if (!entry) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      toast.error('请填写谜题名称');
      return;
    }
    if (codeProblem) {
      toast.error(codeProblem);
      return;
    }
    const trimmedCode = code.trim();
    try {
      await updateMutation.mutateAsync({
        id: entry.id,
        payload: {
          name: trimmed,
          description: description.trim().length > 0 ? description.trim() : null,
          // 留空 = 不改：存量谜题没编码时，空着不该把 null 写成空串。
          ...(trimmedCode.length > 0 ? { code: trimmedCode } : {}),
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
            <Label htmlFor="edit-puzzle-code">编码</Label>
            <Input
              id="edit-puzzle-code"
              value={code}
              maxLength={PUZZLE_CODE_MAX_LENGTH}
              placeholder="小写字母、数字与连字符"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              aria-invalid={codeProblem !== null}
              onChange={(event) => setCode(event.target.value)}
            />
            {codeProblem ? (
              <p className="text-2xs text-destructive">{codeProblem}</p>
            ) : (
              // v0.8.5 §7：存量谜题没有编码 —— 这行说清「留空会怎样」，免得作者以为
              // 空着等于「没有编码这件事」而反复填。
              <p className="text-2xs text-muted-foreground">
                部署时用它预填访问路径；留空则按名称推导。
              </p>
            )}
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
            disabled={busy || codeProblem !== null}
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
