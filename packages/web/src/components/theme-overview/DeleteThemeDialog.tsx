import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Theme } from '@loredoku/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDeleteTheme } from '@/hooks/useThemes';
import { SETTINGS_THEMES_PATH } from '@/lib/workspace';

/**
 * 删主题（§8 护栏 3）：**有东西就不给删**，而且先把数量说清楚。
 *
 * 真正的拦截在服务端（那里才有计数与 `is_default` 判定），这里只负责把「为什么
 * 可能删不掉」提前写在按钮旁边 —— 让人点了才知道失败，比先说一句贵得多。
 */
export function DeleteThemeDialog({
  theme,
  open,
  onOpenChange,
}: {
  theme: Theme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const navigate = useNavigate();
  const remove = useDeleteTheme();
  const [error, setError] = useState<string | null>(null);
  const filled = useMemo(
    () =>
      [
        theme.counts.assets > 0 ? `${theme.counts.assets} 个资源` : null,
        theme.counts.maps > 0 ? `${theme.counts.maps} 张地图` : null,
        theme.counts.characters > 0 ? `${theme.counts.characters} 个角色` : null,
        theme.counts.puzzles > 0 ? `${theme.counts.puzzles} 个谜题` : null,
      ].filter((part): part is string => part !== null),
    [theme.counts],
  );

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function confirm(): Promise<void> {
    try {
      await remove.mutateAsync(theme.code);
      onOpenChange(false);
      navigate(SETTINGS_THEMES_PATH);
    } catch (cause) {
      // 服务端才是权威（它手里有计数）。它拒绝时那句话要留在对话框里 ——
      // 关掉弹窗再 toast 一句，作者就看不到「还差什么」了。
      setError(cause instanceof Error ? cause.message : '删除失败');
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>删除主题「{theme.name}」？</AlertDialogTitle>
          <AlertDialogDescription>
            {filled.length > 0
              ? `主题下还有 ${filled.join('、')}，需要先移空才能删。`
              : '这个主题里没有东西，删除后不可恢复。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={filled.length > 0 || remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            {remove.isPending ? '删除中…' : '删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
