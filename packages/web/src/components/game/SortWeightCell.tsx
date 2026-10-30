import { useEffect, useRef, useState } from 'react';
import { GAME_SORT_WEIGHT_MAX, GAME_SORT_WEIGHT_MIN } from '@loredoku/shared';
import { cn } from '@/lib/utils';

/**
 * v0.8.5：部署列表里的「顺序」一格 —— 平时是一个数字，点开变成输入框。
 *
 * 三条界面规矩：
 *
 * 1. **只有值变了才写回**。点开又原样收起（比如只是想看一眼），不该发一次
 *    PATCH；回车与失焦是同一条收尾路径，不区分「确认」和「离开」。
 * 2. **写不进去的东西不提交**：空、`-`、`1.5`、超出 ±999 一律退回原值。这一格
 *    没有弹窗可以承载错误提示，把非法值交给服务端只会让作者以为没点上。
 * 3. 值没有变、或者输入非法时，输入框收起来即可，不发请求、也不弹提示。
 *
 * 数字用等宽 + `tabular-nums`：一列数字上下对齐，比什么都读得快。
 */
interface SortWeightCellProps {
  value: number;
  /** 保存中：保留输入框但禁用它，免得连点两次发出两个不同值。 */
  pending?: boolean;
  onCommit: (next: number) => void;
}

/** 输入框里的字 → 一个合法的权重；不合法返回 `null`。 */
function parseWeight(raw: string): number | null {
  const text = raw.trim();
  if (!/^-?\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isInteger(value)) return null;
  if (value < GAME_SORT_WEIGHT_MIN || value > GAME_SORT_WEIGHT_MAX) return null;
  return value;
}

export function SortWeightCell({ value, pending = false, onCommit }: SortWeightCellProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** 已经提交 / 取消过：让紧随其后的 blur 不再重复收尾。 */
  const settledRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [editing]);

  const close = (): void => {
    settledRef.current = true;
    setEditing(false);
    setDraft(String(value));
  };

  /** 回车 / 失焦共用：值没变、或输入不合法 → 直接收起，不发请求。 */
  const commit = (): void => {
    if (settledRef.current) return;
    const next = parseWeight(draft);
    if (next === null || next === value) {
      close();
      return;
    }
    settledRef.current = true;
    setEditing(false);
    onCommit(next);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          settledRef.current = false;
          setDraft(String(value));
          setEditing(true);
        }}
        title="展示顺序：数字小的排前面，点一下可以改"
        aria-label="展示顺序"
        className={cn(
          'flex w-14 shrink-0 items-baseline justify-end gap-1 rounded px-1 py-0.5',
          'text-muted-foreground hover:bg-accent hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {/*
         * 一个孤零零的数字会被读成「上一列的残留」。这一列没有表头，所以给它一个
         * 字宽的字做标签 —— 「序」比「权重 / 顺序」省地方，也正好是这一列在做的事。
         */}
        <span className="text-2xs text-muted-foreground/60">序</span>
        <span className="font-mono text-xs tabular-nums">{value}</span>
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={draft}
      disabled={pending}
      aria-label="展示顺序"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
      className={cn(
        'w-14 shrink-0 rounded border bg-background px-1 py-0.5 text-right font-mono text-xs tabular-nums',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    />
  );
}
