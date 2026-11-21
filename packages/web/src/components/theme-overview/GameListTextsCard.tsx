import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  THEME_GAME_LIST_COUNT_TOKEN,
  THEME_GAME_LIST_TEXT_MAX_LENGTH,
  formatGameListCount,
  resolveGameListTexts,
  type Theme,
} from '@loredoku/shared';
import { Input } from '@/components/ui/input';
import { useUpdateTheme } from '@/hooks/useThemes';

/**
 * 游戏列表页那两行字（「N 关可玩」/「已通过 N 关」）。
 *
 * 为什么是**模板**而不是整句：同一个数字在两句里说的是不同的事（一共几关 /
 * 已经过了几关），作者要改的是说法，不是那个数。所以两格都留着 `{n}`，
 * 渲染时换成数字 —— 少了它，数字就没地方落，界面只剩一句与这一页无关的话。
 *
 * 为什么即时保存（失焦就存）：这两格是「一句话」，没有别的字段要一起提交，
 * 也没有需要先看一眼预览才敢按的后果 —— 与「操作提示」那张卡里的结算标题同一个手感。
 */
export function GameListTextsCard({ theme }: { theme: Theme }): JSX.Element {
  const update = useUpdateTheme(theme.code);
  const texts = resolveGameListTexts(theme.data.gameList);

  const [playable, setPlayable] = useState(texts.playable);
  const [passed, setPassed] = useState(texts.passed);

  // 主题被别处改过（另一个标签页、或者刚保存回来）时跟上，别让输入框停在一份旧文案上。
  useEffect(() => {
    setPlayable(texts.playable);
    setPassed(texts.passed);
  }, [texts.playable, texts.passed]);

  /**
   * 空串 = 用内置那句（schema 允许空串，读取时按缺省处理）。
   * 非空却少了 `{n}` 就不发 —— 服务端会 400，而在输入框旁边说清楚比弹一条
   * 「保存失败」有用。
   */
  const persist = (field: 'playable' | 'passed', raw: string): void => {
    const next = raw.trim();
    if (next.length > 0 && !next.includes(THEME_GAME_LIST_COUNT_TOKEN)) {
      toast.error(`文案里要留一个 ${THEME_GAME_LIST_COUNT_TOKEN}，它会换成关数`);
      return;
    }
    // 与存着的那份一模一样就不发请求（失焦很频繁，点一下就存一次没有意义）。
    if (next === (theme.data.gameList?.[field]?.trim() ?? '')) return;
    update.mutate({
      data: {
        ...theme.data,
        gameList: { ...theme.data.gameList, [field]: next },
      },
    });
  };

  return (
    <div className="space-y-3">
      <Field
        label="可玩关数"
        value={playable}
        onChange={setPlayable}
        onCommit={() => persist('playable', playable)}
        preview={formatGameListCount(playable.trim() || texts.playable, 6)}
      />
      <Field
        label="已通过关数"
        value={passed}
        onChange={setPassed}
        onCommit={() => persist('passed', passed)}
        preview={formatGameListCount(passed.trim() || texts.passed, 3)}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onCommit,
  preview,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onCommit: () => void;
  preview: string;
}): JSX.Element {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        value={value}
        maxLength={THEME_GAME_LIST_TEXT_MAX_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      {/* 预览就是这句话在列表页里的样子 —— 比再解释一遍 `{n}` 直观。 */}
      <span className="block text-2xs text-muted-foreground/80">预览：{preview}</span>
    </label>
  );
}
