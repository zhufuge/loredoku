import { useEffect, useState } from 'react';
import { FileUp, Ruler } from 'lucide-react';
import { GRID_SIZE_DEFAULT, GRID_SIZE_MAX, GRID_SIZE_MIN } from '@loredoku/shared';
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
import { LoredokuTick } from '@/components/common/LoredokuLoader';

/**
 * 第一次进入编辑器时的「初始化地图」弹窗。
 *
 * 创建地图不问画布尺寸，所以新图的草稿是空的。此时只有两条出路：**填一个
 * 尺寸**开一块空画布，或**导入一份地图**（导出文件的逆操作）。
 *
 * 它不是一个可以关掉的弹窗 —— 关掉它编辑器也没有可渲染的画布，所以没有取消
 * 按钮，返回列表要走左上角的返回键。
 */
interface MapInitDialogProps {
  mapName: string;
  pending: boolean;
  /** 填尺寸 → 写一份空草稿（复用改尺寸那条路，服务端会裁剪/新建草稿）。 */
  onInitSize: (gridSize: number) => void;
  /** 导入 → 打开隐藏的文件选择框。 */
  onImport: () => void;
}

export function MapInitDialog({
  mapName,
  pending,
  onInitSize,
  onImport,
}: MapInitDialogProps): JSX.Element {
  const [value, setValue] = useState<string>(String(GRID_SIZE_DEFAULT));
  const parsed = Number(value);
  const valid =
    value.trim().length > 0 &&
    Number.isInteger(parsed) &&
    parsed >= GRID_SIZE_MIN &&
    parsed <= GRID_SIZE_MAX;

  // 弹窗挂载时就把焦点放在输入框上 —— 这是进编辑器后唯一要填的东西。
  useEffect(() => {
    const timer = setTimeout(() => document.getElementById('map-init-size')?.focus(), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Dialog open>
      <DialogContent className="max-w-md" onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="h-4 w-4" />
            初始化「{mapName}」
          </DialogTitle>
          <DialogDescription>
            这张地图还没有画布。设置一个尺寸开始编辑，或导入一份之前导出的地图。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="map-init-size">画布尺寸 n（{GRID_SIZE_MIN} ~ {GRID_SIZE_MAX}）</Label>
          <Input
            id="map-init-size"
            type="number"
            min={GRID_SIZE_MIN}
            max={GRID_SIZE_MAX}
            value={value}
            disabled={pending}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && valid && !pending) onInitSize(parsed);
            }}
          />
          {!valid ? (
            <p className="text-xs text-destructive">
              画布尺寸需为 {GRID_SIZE_MIN} ~ {GRID_SIZE_MAX} 之间的整数
            </p>
          ) : null}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" disabled={pending} onClick={onImport}>
            <FileUp className="mr-1 h-3.5 w-3.5" />
            导入地图
          </Button>
          <Button type="button" disabled={!valid || pending} onClick={() => onInitSize(parsed)}>
            {pending ? <LoredokuTick className="mr-1" /> : null}
            {pending ? '初始化中…' : '开始编辑'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
