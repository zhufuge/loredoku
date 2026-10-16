import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_REGION_COLOR,
  REGION_BORDER_WIDTH_DEFAULT,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  REGION_FILL_OPACITY_DEFAULT,
  REGION_FILL_OPACITY_MAX,
  REGION_FILL_OPACITY_MIN,
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
import { cn } from '@/lib/utils';

const COLOR_PRESETS = ['#000000', '#3B82F6', '#22C55E', '#EF4444', '#F59E0B', '#8B5CF6', '#14B8A6'];

interface RegionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  cells: Coord[];
  region?: DraftRegion | null;
  regions: DraftRegion[];
  /**
   * v0.3.8 FEAT-D02: the map-level default outline width becomes the initial
   * value for a new region (docs/v0.3.8.md §FEAT-D02 §关键规则 4).
   */
  defaultBorderWidth?: number;
  onSubmit: (input: RegionInput, conflictMode: ConflictMode) => void;
}

export function RegionDialog({
  open,
  onOpenChange,
  mode,
  cells,
  region,
  regions,
  defaultBorderWidth = REGION_BORDER_WIDTH_DEFAULT,
  onSubmit,
}: RegionDialogProps): JSX.Element {
  const [regionId, setRegionId] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_REGION_COLOR);
  const [borderWidth, setBorderWidth] = useState(REGION_BORDER_WIDTH_DEFAULT);
  const [fillOpacity, setFillOpacity] = useState(REGION_FILL_OPACITY_DEFAULT);
  const [conflictMode, setConflictMode] = useState<ConflictMode>('override');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRegionId(mode === 'create' ? genRegionId() : (region?.id ?? ''));
    setName(region?.name ?? '');
    setColor(region?.color ?? DEFAULT_REGION_COLOR);
    setBorderWidth(region?.borderWidth ?? defaultBorderWidth);
    setFillOpacity(region?.fillOpacity ?? REGION_FILL_OPACITY_DEFAULT);
    setConflictMode('override');
    setError(null);
  }, [open, region, mode, defaultBorderWidth]);

  const connected = useMemo(() => isConnected(cells), [cells]);

  const conflicts = useMemo(
    () => (mode === 'create' ? findOverlap(regions, { id: region?.id ?? '__new__', cells }) : []),
    [mode, cells, regions, region],
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
    const duplicated = regions.some(
      (item) => item.id === trimmedId && item.id !== (mode === 'edit' ? region?.id : undefined),
    );
    if (duplicated) {
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
    onSubmit({ id: trimmedId, name: trimmed, color, borderWidth, fillOpacity, cells }, conflictMode);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '创建区域' : '编辑区域'}</DialogTitle>
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

          <div className="grid gap-2">
            <Label>区域颜色（填充）</Label>
            <span className="text-xs text-muted-foreground">
              边界线颜色由「地图基本信息」统一控制。
            </span>
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
              <span className="text-xs tabular-nums text-muted-foreground">
                {borderWidth}px（缺省 {defaultBorderWidth}）
              </span>
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
