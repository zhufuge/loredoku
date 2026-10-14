import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_REGION_COLOR,
  REGION_BORDER_WIDTH_DEFAULT,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  REGION_DESCRIPTION_MAX_LENGTH,
  REGION_FILL_OPACITY_DEFAULT,
  REGION_FILL_OPACITY_MAX,
  REGION_FILL_OPACITY_MIN,
  REGION_NAME_MAX_LENGTH,
} from '@murdoku/shared';
import type { CellCoord, RegionData } from '@murdoku/shared';
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
import { Textarea } from '@/components/ui/textarea';
import { findConflicts } from '@/lib/region';
import type { NewRegionInput } from '@/stores/editorStore';
import { cn } from '@/lib/utils';

const COLOR_PRESETS = [
  '#3B82F6',
  '#22C55E',
  '#EF4444',
  '#F59E0B',
  '#8B5CF6',
  '#14B8A6',
];

type ConflictMode = 'override' | 'skip';

interface RegionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  cells: CellCoord[];
  region?: RegionData | null;
  regions: RegionData[];
  onSubmit: (input: NewRegionInput, conflictMode: ConflictMode) => void;
}

export function RegionDialog({
  open,
  onOpenChange,
  mode,
  cells,
  region,
  regions,
  onSubmit,
}: RegionDialogProps): JSX.Element {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(DEFAULT_REGION_COLOR);
  const [borderWidth, setBorderWidth] = useState(REGION_BORDER_WIDTH_DEFAULT);
  const [fillOpacity, setFillOpacity] = useState(REGION_FILL_OPACITY_DEFAULT);
  const [conflictMode, setConflictMode] = useState<ConflictMode>('override');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(region?.name ?? '');
    setDescription(region?.description ?? '');
    setColor(region?.color ?? DEFAULT_REGION_COLOR);
    setBorderWidth(region?.borderWidth ?? REGION_BORDER_WIDTH_DEFAULT);
    setFillOpacity(region?.fillOpacity ?? REGION_FILL_OPACITY_DEFAULT);
    setConflictMode('override');
    setError(null);
  }, [open, region]);

  const conflicts = useMemo(
    () => (mode === 'create' ? findConflicts(cells, regions) : []),
    [mode, cells, regions],
  );

  const handleSubmit = (): void => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请填写区域名称');
      return;
    }
    const effectiveCells =
      mode === 'create' && conflictMode === 'skip'
        ? cells.filter(
            (cell) => !conflicts.some((conflict) => conflict.x === cell.x && conflict.y === cell.y),
          )
        : cells;
    if (effectiveCells.length === 0) {
      setError('至少需要一个单元格');
      return;
    }
    onSubmit(
      {
        name: trimmed,
        description: description.trim() || null,
        color,
        borderWidth,
        fillOpacity,
        cells: effectiveCells,
      },
      conflictMode,
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新建区域' : '编辑区域'}</DialogTitle>
          <DialogDescription>
            已选择 {cells.length} 个单元格
            {conflicts.length > 0 ? `，其中 ${conflicts.length} 个已被其它区域占用` : ''}。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
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

          <div className="grid gap-2">
            <Label htmlFor="region-desc">描述</Label>
            <Textarea
              id="region-desc"
              value={description}
              maxLength={REGION_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="选填"
              rows={2}
            />
          </div>

          <div className="grid gap-2">
            <Label>颜色</Label>
            <div className="flex items-center gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setColor(preset)}
                  className={cn(
                    'h-7 w-7 rounded-full border-2',
                    color === preset ? 'border-foreground' : 'border-transparent',
                  )}
                  style={{ backgroundColor: preset }}
                  aria-label={`颜色 ${preset}`}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-7 w-10 cursor-pointer rounded border bg-transparent"
                aria-label="自定义颜色"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="region-border">边界线宽</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{borderWidth}px</span>
            </div>
            <input
              id="region-border"
              type="range"
              min={REGION_BORDER_WIDTH_MIN}
              max={REGION_BORDER_WIDTH_MAX}
              value={borderWidth}
              onChange={(event) => setBorderWidth(Number(event.target.value))}
              className="w-full"
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="region-opacity">填充透明度</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {fillOpacity.toFixed(2)}
              </span>
            </div>
            <input
              id="region-opacity"
              type="range"
              min={REGION_FILL_OPACITY_MIN}
              max={REGION_FILL_OPACITY_MAX}
              step={0.01}
              value={fillOpacity}
              onChange={(event) => setFillOpacity(Number(event.target.value))}
              className="w-full"
            />
          </div>

          {mode === 'create' && conflicts.length > 0 ? (
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
          <Button onClick={handleSubmit}>{mode === 'create' ? '创建' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
