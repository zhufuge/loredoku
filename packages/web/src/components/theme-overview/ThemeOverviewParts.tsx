import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * 概览页的三块小零件：一行事实、清单卡片的头、清单里的一格值。
 *
 * v0.10.4：从 `pages/ThemeOverviewPage.tsx` 搬出来。那一页原本把「这一屏由哪些
 * 卡片组成」和「每张卡里的控件怎么写」挤在同一个文件里；三块零件先分出来，
 * 页面那一侧剩下的就只是排布。
 */

/** 一行事实：左侧 4 字标签、右侧值。40px，与列表页的行同档。 */
export function FactRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-x-6 gap-y-1 py-2">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-sm">{children}</span>
    </div>
  );
}

/**
 * 清单卡片的头：标题 + 「编辑」。两个区块共用。
 *
 * v0.8.6 §1：**去掉了副标题**，按钮也不再写「编辑缺省风格 / 编辑难度分级」。
 *
 * 副标题那两句都是在解释一个已经看得见的清单（「新建地图时抄这一份」/「部署关卡时
 * 从这几档里挑」），占掉的却是第一屏。按钮写成「编辑」是因为它就贴着那张卡片的
 * 标题 —— 眼睛已经把「编辑」和上面那行字连起来了，再复述一遍主语只是更长。
 *
 * 但**可访问名**不能只有「编辑」：两个同名按钮对屏幕阅读器是灾难，读出来一模一样。
 * 所以视觉文案是「编辑」，`aria-label` 仍是「编辑地图初始样式 / 编辑难度分级」。
 *
 * v0.8.6 §4：「标记」卡片没有「编辑」这一步（上传 / 移除即时保存），所以
 * `onEdit` 是可选的 —— 不给就只渲染标题。
 */
export function CardHead({ title, onEdit }: { title: string; onEdit?: () => void }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <h3 className="font-kai text-base leading-tight">{title}</h3>
      {onEdit ? (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          aria-label={`编辑${title}`}
          onClick={onEdit}
        >
          编辑
        </Button>
      ) : null}
    </div>
  );
}

/**
 * 清单里的一格值：颜色给色块 + 色值，别的一律等宽字。
 * v0.8.7 §1：字号从 10px 提到 12px，色块跟着从 10px 提到 12px。这一格不是「备注」——
 * 它是整个区块的**正文**（26 项值），而 10px 的等宽字在 1440 宽的屏幕上看是灰点。
 * 标签仍是 12px 的 `muted`：层级靠颜色，不靠字号 —— 大小再差一档，行就要矮回去了。
 */
export function StyleValue({ kind, text }: { kind: string; text: string }): JSX.Element {
  const isColor = kind === 'color' && /^#[0-9a-fA-F]{6}$/.test(text);
  return (
    <span className="inline-flex items-center gap-1.5">
      {isColor ? (
        <span
          aria-hidden
          className="h-3 w-3 rounded-sm ring-1 ring-inset ring-border"
          style={{ backgroundColor: text }}
        />
      ) : null}
      <span className="font-mono text-xs tabular-nums text-foreground">{text}</span>
    </span>
  );
}
