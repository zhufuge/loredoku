import { useEffect, useMemo, useState } from 'react';
import {
  REGION_ID_MAX_LENGTH,
  REGION_ID_PATTERN,
  REGION_NAME_MAX_LENGTH,
} from '@loredoku/shared';
import type { DraftRegion } from '@loredoku/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { findOverlap, isConnected, type Coord } from '@/lib/region';
import { genRegionId, type ConflictMode, type RegionInput } from '@/stores/editorStore';

/**
 * v0.7.0: 创建专用。区域的外观编辑搬到了右边信息框（`EditorInfoDrawer` 的区域
 * 段）——那里默认填入「地图基本信息」的缺省值，只把不同的字段记到区域自己
 * 身上，所以新建时同样从缺省开始，这里不再问颜色与线宽。
 */
interface RegionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cells: Coord[];
  regions: DraftRegion[];
  onSubmit: (input: RegionInput, conflictMode: ConflictMode) => void;
}

export function RegionDialog({
  open,
  onOpenChange,
  cells,
  regions,
  onSubmit,
}: RegionDialogProps): JSX.Element {
  const [regionId, setRegionId] = useState('');
  const [name, setName] = useState('');
  const [conflictMode, setConflictMode] = useState<ConflictMode>('override');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRegionId(genRegionId());
    setName('');
    setConflictMode('override');
    setError(null);
  }, [open]);

  const connected = useMemo(() => isConnected(cells), [cells]);

  const conflicts = useMemo(
    () => findOverlap(regions, { id: '__new__', cells }),
    [cells, regions],
  );

  const handleSubmit = (): void => {
    const trimmedId = regionId.trim();
    if (!trimmedId) {
      setError('请填写区域 ID');
      return;
    }
    if (trimmedId.length > REGION_ID_MAX_LENGTH || !REGION_ID_PATTERN.test(trimmedId)) {
      setError('区域 ID 只能包含字母、数字与下划线');
      return;
    }
    if (regions.some((item) => item.id === trimmedId)) {
      setError('区域 ID 已存在，请更换');
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请填写区域名称');
      return;
    }
    if (cells.length === 0) {
      setError('区域至少需要一个单元格');
      return;
    }
    if (!connected) {
      setError('区域必须是连通的（四邻接），当前选择包含断开的部分');
      return;
    }
    onSubmit({ id: trimmedId, name: trimmed, cells }, conflictMode);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建区域</DialogTitle>
          <DialogDescription>
            共 {cells.length} 个单元格
            {!connected && cells.length > 1 ? ' · 当前选择不连通' : ''}
            {conflicts.length > 0 ? ` · ${conflicts.length} 个与现有区域冲突` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="region-id">区域 ID</Label>
            <Input
              id="region-id"
              value={regionId}
              maxLength={REGION_ID_MAX_LENGTH}
              onChange={(event) => setRegionId(event.target.value)}
              placeholder="如：forest"
            />
            <span className="text-xs text-muted-foreground">仅字母、数字与下划线</span>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="region-name">区域名称</Label>
            <Input
              id="region-name"
              value={name}
              maxLength={REGION_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
              placeholder="如：森林区"
            />
          </div>

          {conflicts.length > 0 ? (
            <div className="grid gap-2 rounded-md border bg-muted/40 p-3">
              <span className="text-sm font-medium">冲突处理</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="conflict-mode"
                  checked={conflictMode === 'override'}
                  onChange={() => setConflictMode('override')}
                />
                覆盖：从其它区域移除冲突格
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="conflict-mode"
                  checked={conflictMode === 'skip'}
                  onChange={() => setConflictMode('skip')}
                />
                跳过冲突格
              </label>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
