import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
/** v0.7.13: `ColorField` 搬到 `@/components/ui/color-input`，两处抽屉改从那儿取。 */

/**
 * v0.7.0: the number / colour controls the two info drawers share.
 *
 * They used to live inside `MapInfoDrawer`; the region branch of
 * `EditorInfoDrawer` needed the exact same behaviour (write-through on every
 * keystroke, blur only rolls back non-numeric text), so they moved here — one
 * implementation, two hosts.
 */

/**
 * v0.3.10 FIX-F02: a number field that writes through on **every** change.
 *
 * The previous implementation kept the parsed value in a local text buffer and
 * only committed on `blur` / `Enter`, so clicking the input's stepper buttons
 * left the draft (and therefore 保存) untouched. Now every keystroke and every
 * stepper click pushes the parsed value into the draft immediately; `blur` /
 * `Enter` only serve to roll back non-numeric input.
 *
 * The text buffer is deliberately **not** re-synced while the field has focus,
 * otherwise a clamped commit (e.g. typing `1` into a 32 ~ 240 field) would
 * rewrite the text under the user's cursor and make multi-digit entry
 * impossible.
 */
export function NumberField({
  id,
  value,
  min,
  max,
  step = 1,
  suffix,
  commit,
}: {
  id: string;
  value: number;
  /**
   * v0.10.7：上下限改成可选 —— 区域标签的位置偏移不再封顶，那两个框只保留步进。
   * 其余所有数值字段照旧传死上下限。
   */
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  commit: (value: number) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setDraft((current) => (current === String(value) ? current : String(value)));
  }, [value]);

  const flush = (): void => {
    const text = draft.trim();
    // An emptied field (a `type="number"` input reports `''` for anything
    // non-numeric) is *not* a value — restore the committed one instead of
    // silently committing 0.
    if (text.length === 0) {
      setDraft(String(value));
      return;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    commit(parsed);
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const parsed = Number(text);
          if (text.trim().length > 0 && Number.isFinite(parsed)) commit(parsed);
        }}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          flush();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            flush();
          }
        }}
        className="h-7 w-20 text-xs tabular-nums"
      />
      {suffix ? <span className="text-2xs text-muted-foreground">{suffix}</span> : null}
    </div>
  );
}

/**
 * SPEC-F01: every explanation lives behind a circular question-mark icon that
 * trails the label — no more `title` on the label itself and no more grey
 * paragraphs floating under the fields.
 */
export function Hint({ text }: { text: string }): JSX.Element {
  return (
    <span
      className="ml-1 inline-flex shrink-0 items-center text-muted-foreground"
      title={text}
      aria-label={text}
      role="img"
    >
      <HelpCircle className="h-3.5 w-3.5 cursor-help" />
    </span>
  );
}

export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="flex items-center whitespace-nowrap text-2xs font-normal text-muted-foreground">
        <span>{label}</span>
        {hint ? <Hint text={hint} /> : null}
      </Label>
      {children}
    </div>
  );
}
