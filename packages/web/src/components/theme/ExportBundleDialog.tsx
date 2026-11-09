import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  type MapGameSummary,
  type Theme,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { DifficultyBadge } from '@/components/game/DifficultyBadge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { downloadThemeBundle, saveBlob } from '@/api/themes';
import { InlineLoading } from '@/components/common/LoredokuLoader';

interface ExportBundleDialogProps {
  theme: Theme | null;
  /** 这个主题下**已上线**的关（就是包里会有的那些）。 */
  games: MapGameSummary[];
  onOpenChange: (open: boolean) => void;
}

/**
 * v0.8.0（docs/v0.8.0.md §16.10）—— 导出资源包：**先给清单，再给文件**。
 *
 * 原来的路径是「点导出 → 生成 → toast → 下载」，作者从头到尾不知道自己拿到了
 * 什么：几关？哪些关？多少资源？而「少了一关」这种问题，在下载完的 zip 里
 * 永远不会被发现 —— 打开也看不懂。
 *
 * 所以对话框的第一屏就是那份清单：逐关名 + 网格 + 难度，加一行总量。它同时也是
 * 打包前体检的**可见部分**（§11.2）：包里缺文件时，服务端会在这一步报错并列出
 * 缺的是哪一关的哪个引用，而不是交付一个坏包。
 *
 * 第二屏（进度 / 完成）与第一屏共用同一个对话框，只换中间内容。
 *
 * 2026-11-09（docs/v0.9.0.md §15）：完成屏原来还有一行「包里没有播放页面，
 * 下一版会有纯前端播放页」—— 播放器 v0.9.0 已经落地，那句话反而误导，删掉。
 * 现在只留一行文件名，对话框会自然收一点；不为对齐凭空留一块空白。
 */
export function ExportBundleDialog({ theme, games, onOpenChange }: ExportBundleDialogProps): JSX.Element {
  const [state, setState] = useState<{ phase: 'idle' | 'running' | 'done'; filename?: string }>({
    phase: 'idle',
  });
  const open = theme !== null;

  const close = (next: boolean): void => {
    if (!next && state.phase === 'running') return;
    if (!next) setState({ phase: 'idle' });
    onOpenChange(next);
  };

  const run = async (): Promise<void> => {
    if (!theme) return;
    setState({ phase: 'running' });
    try {
      const { blob, filename } = await downloadThemeBundle(theme.code);
      saveBlob(blob, filename);
      setState({ phase: 'done', filename });
      toast.success('资源包已开始下载');
    } catch (error) {
      setState({ phase: 'idle' });
      toast.error(error instanceof Error ? error.message : '导出失败');
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>导出资源包 · {theme?.name}</DialogTitle>
          <DialogDescription>
            把一个主题打成一份可以离线归档的 zip：这些关、它们引用的资源与角色。
          </DialogDescription>
        </DialogHeader>

        {state.phase === 'done' ? (
          <p className="text-sm">
            已生成 <span className="font-mono text-xs">{state.filename}</span>
          </p>
        ) : (
          <div className="space-y-3">
            {games.length === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
                这个主题还没有上线的关卡。包是「已经能玩的那几关」，先至少上线一关。
              </p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
                {games.map((game) => (
                  <li
                    key={game.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{game.name}</span>
                    <DifficultyBadge difficulty={game.difficulty} />
                    <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                      {game.gridSize} × {game.gridSize}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs tabular-nums text-muted-foreground">共 {games.length} 关</p>
            {state.phase === 'running' ? <InlineLoading caption="正在打包…" /> : null}
          </div>
        )}

        <DialogFooter>
          {state.phase === 'done' ? (
            <>
              <Button variant="outline" onClick={() => setState({ phase: 'idle' })}>
                再导一次
              </Button>
              <Button onClick={() => close(false)}>完成</Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={state.phase === 'running'}
                onClick={() => close(false)}
              >
                取消
              </Button>
              <Button disabled={games.length === 0 || state.phase === 'running'} onClick={() => void run()}>
                <Download className="mr-1 h-4 w-4" />
                {state.phase === 'running' ? '打包中…' : '导出 zip'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
