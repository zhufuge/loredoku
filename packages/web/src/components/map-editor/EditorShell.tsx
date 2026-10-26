import type { ChangeEvent, RefObject } from 'react';
import { Loader2 } from 'lucide-react';
import { UI_Z } from '@loredoku/shared';
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
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';

/**
 * the chrome both editors render identically, lifted out of
 * `MapEditorPage` / `PuzzleEditorPage` — the save mask, the leave guard, the
 * 「基本信息有未保存的修改」 confirmation, the loading / error states and the
 * hidden JSON import input.
 *
 * Only **invariants** live here. What differs between the two editors (the
 * writable map canvas vs the read-only puzzle reference, the panels, the
 * dialogs) stays in the pages.
 */

/** 保存中蒙版 — delayed fade-out is `useEditorSave`'s job; this only paints. */
export function EditorSaveMask({
  saving,
  visible,
}: {
  saving: boolean;
  visible: boolean;
}): JSX.Element | null {
  if (!visible) return null;
  return (
    <div
      className={cn(
        'absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground transition-opacity duration-150',
        saving ? 'opacity-100' : 'opacity-0',
      )}
      style={{
        zIndex: UI_Z.saveMask,
        /* v0.7.8：原来是写死的 `rgba(255,255,255,0.6)` —— 深色模式下点保存会在
           一整屏深色上糊一层白。改成跟着 `--background` 走：浅色是宣纸，深色是
           夜墨，两层都是「把画布蒙住」而不是「打光」。 */
        background: 'hsl(var(--background) / 0.7)',
        pointerEvents: 'auto',
      }}
      aria-hidden={!saving}
    >
      <Loader2 className="h-5 w-5 animate-spin" />
      保存中…
    </div>
  );
}

/**
 * FEAT-E01: leaving the 基本信息 form (or the editor) with unsaved edits is
 * confirmed. Esc inside the dialog cancels instead of confirming.
 */
export function EditorUnsavedLeaveDialog({
  guard,
}: {
  guard: ReturnType<typeof useUnsavedChangesGuard>;
}): JSX.Element {
  return (
    <AlertDialog open={guard.open}>
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          guard.cancelLeave();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>有未保存的修改</AlertDialogTitle>
          <AlertDialogDescription>离开将丢失当前修改，确定离开吗？</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={guard.cancelLeave}>
            取消
          </Button>
          <Button variant="destructive" onClick={guard.confirmLeave}>
            离开
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** FEAT-E01: the deferred 保存 / 放弃 decision for unsaved 基本信息 edits. */
export function EditorPendingInfoActionDialog({
  open,
  onOpenChange,
  onResolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (mode: 'save' | 'discard') => void;
}): JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>基本信息有未保存的修改</AlertDialogTitle>
          <AlertDialogDescription>继续切换会丢失这些修改，是否先保存？</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            继续编辑
          </Button>
          <Button variant="destructive" onClick={() => onResolve('discard')}>
            放弃修改
          </Button>
          <Button onClick={() => onResolve('save')}>保存并继续</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Both editors show the same spinner while the map / puzzle pair lands. */
export function EditorLoadingState(): JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      正在加载画布…
    </div>
  );
}

/** The id is unreadable (or the query failed): one message, one way back. */
export function EditorErrorState({
  message,
  backLabel,
  onBack,
}: {
  message: string;
  backLabel: string;
  onBack: () => void;
}): JSX.Element {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onBack}>
        {backLabel}
      </Button>
    </div>
  );
}

/** The hidden `<input type="file">` both JSON imports go through. */
export function EditorImportInput({
  inputRef,
  onChange,
}: {
  inputRef: RefObject<HTMLInputElement>;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}): JSX.Element {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="application/json,.json"
      className="hidden"
      onChange={onChange}
    />
  );
}
