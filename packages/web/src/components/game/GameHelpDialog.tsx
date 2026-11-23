import type { ReactNode } from 'react';
import type { GameToolIconKind } from '@loredoku/shared';
import type { LucideIcon } from 'lucide-react';
import { Eraser, Send, Undo2, X } from 'lucide-react';
import type { ToolIconsRender } from '@/lib/toolIcons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** 玩法说明。 右栏最下面那枚圆形问号打开它； **第一次进任意关卡时自动 打开一次**（`lib/gameHelp.ts` 记着「已经看过」）。 为什么是一段静态说明而不是从谜题里读：这四段说的是**这套界面怎么操作** —— 点谁、按什么、哪个按钮管什么。 它不随谜题变，作者也不必为每一关重写一遍。 谜题自己的规则（谁在场、谁能和谁同处一室）由题面与线索回答，弹框里只留一句 「一局的具体规则以题面为准」把它们分开。 写法对齐 `GameDescriptionDialog`：正文 `text-sm`、行高放宽，整块可滚 —— 手机上这一段比一屏长，弹框里再套一个滚动容器就够了。 */
export interface GameHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 已解析好的工具图标（关卡 → 主题 → 内置），与工具条同源。 */
  toolIcons?: ToolIconsRender;
  /** 工具栏「标记」那枚的图；没配就画内置的红 `×`。 */
  markImageUrl?: string | null;
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="space-y-1.5">
      <h3 className="font-serif text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Lines({ items }: { items: readonly string[] }): JSX.Element {
  return (
    <ul className="space-y-1 text-sm leading-[1.75] text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex gap-1.5">
          <span aria-hidden className="text-muted-foreground/50">
            ·
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** 工具一段要列出工具条上那四枚按钮 —— 标记没有主题图标，用关卡自己那枚 `mark`。 */
type HelpToolKind = 'forbidden' | GameToolIconKind;

const HELP_TOOL_FALLBACKS: Record<HelpToolKind, LucideIcon> = {
  forbidden: X,
  clear: Eraser,
  undo: Undo2,
  submit: Send,
};

/** 图标按「关卡 → 主题 → 内置」的顺序取（`lib/toolIcons.ts`）—— 工具条上画的是什么，说明里就是什么，换成主题的图之后两边不会各说各的。 */
function ToolLines({
  items,
  toolIcons,
  markImageUrl,
}: {
  items: readonly { kind: HelpToolKind; label: string; text: string }[];
  toolIcons?: ToolIconsRender;
  markImageUrl?: string | null;
}): JSX.Element {
  return (
    <ul className="space-y-1 text-sm leading-[1.75] text-muted-foreground">
      {items.map(({ kind, label, text }) => {
        const imageUrl = kind === 'forbidden' ? (markImageUrl ?? null) : (toolIcons?.[kind]?.imageUrl ?? null);
        const Icon = HELP_TOOL_FALLBACKS[kind];
        return (
          <li key={label} className="flex gap-1.5">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                aria-hidden
                className="mt-[0.3rem] h-4 w-4 shrink-0 object-contain dark:invert dark:hue-rotate-180"
              />
            ) : (
              <Icon
                aria-hidden
                className={
                  kind === 'forbidden'
                    ? 'mt-[0.3rem] h-4 w-4 shrink-0 text-destructive'
                    : 'mt-[0.3rem] h-4 w-4 shrink-0'
                }
              />
            )}
            <span>
              {label}：{text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function GameHelpDialog({
  open,
  onOpenChange,
  toolIcons,
  markImageUrl,
}: GameHelpDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="game-help-dialog">
        <DialogHeader>
          <DialogTitle>玩法说明</DialogTitle>
        </DialogHeader>

        <div className="max-h-[62svh] space-y-4 overflow-y-auto pr-1">
          <Section title="目标">
            <p className="text-sm leading-[1.75] text-muted-foreground">
              利用线索找出所有人物所在的位置。
            </p>
          </Section>

          <Section title="规则">
            <Lines
              items={[
                '每行和每列各有一人。',
                '「旁边」指的是，同一个区域内的上下左右一格。',
              ]}
            />
          </Section>

          <Section title="操作">
            <Lines
              items={[
                '点击人物：选择。',
                '点击格子：添加/移除标记（编号）。',
                '长按格子：放置人物（头像）。',
                '拖动：在多个格子中做标记。',
              ]}
            />
          </Section>

          <Section title="工具">
            <ToolLines
              toolIcons={toolIcons}
              markImageUrl={markImageUrl}
              items={[
                {
                  kind: 'forbidden',
                  label: '标记',
                  text: '将格子标记为不可能（排除选项）。',
                },
                { kind: 'clear', label: '清除', text: '点击以清除某个格子，长按清空全部。' },
                { kind: 'undo', label: '撤回', text: '恢复你的上一步操作。' },
                { kind: 'submit', label: '提交', text: '提交你的答案。' },
              ]}
            />
          </Section>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>知道了</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
