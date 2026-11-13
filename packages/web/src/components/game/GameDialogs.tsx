import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * 玩家页的两个弹框：谜题描述（只竖屏用）与结算卡（两种结局共用）。
 *
 * v0.10.4：从 `GamePage` 搬出来。两者都是「一句话的数据 + 几个出口」，不读这一局
 * 的任何中间状态 —— 留在页面里只是让那 3000 行更长。
 */
export interface GameDescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
}

/**
 * v0.10.1 竖屏：谜题描述弹框。触发的是头部那枚 `FileText` 图标。
 *
 * 为什么弹框而不是留在面板里：竖屏一屏只够放棋盘 + 名册，描述是三行也好
 * 三十行也好，只在开局读一遍 —— 占着固定的高度不划算。线索不同，它们要
 * 反复对照，仍留在面板里（`GameBrief` 只关掉描述那一段）。
 *
 * 正文沿用面板里那套写法（`whitespace-pre-wrap`、`text-muted-foreground`），
 * 只是不再 `line-clamp-3` —— 弹框就是为了读全文，再收一次反而多一步。
 */
export function GameDescriptionDialog({
  open,
  onOpenChange,
  description,
}: GameDescriptionDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>谜题描述</DialogTitle>
        </DialogHeader>
        <p className="max-h-[60svh] overflow-y-auto whitespace-pre-wrap text-sm leading-[1.8] text-muted-foreground">
          {description.trim()}
        </p>
      </DialogContent>
    </Dialog>
  );
}

export type GameResult =
  | { kind: 'passed'; elapsedMs: number }
  | { kind: 'failed'; correct: number; total: number };

export interface GameResultDialogProps {
  /** `null` = 弹窗关着。 */
  result: GameResult | null;
  /** 作者写的一句结束语（只在通过那一面出现）。 */
  ending: string;
  /** 「下一关」有没有地方可指；没有时不画那枚按钮。 */
  hasNextLevel: boolean;
  onClose: () => void;
  onContinue: () => void;
  onRestart: () => void;
  onNextLevel: () => void;
  onBackToList: () => void;
}

/**
 * v0.7.11：提交的两种结局共用一个弹窗。
 * - 通过：定案 + 结束语 + 再玩一次；
 * - 未通过：结果 +「x/n 正确。未能结案」，不列名单位置 + 继续游戏 / 重新开始。
 *
 * 两种都用 `Dialog`，不是 `AlertDialog` —— 这里不是「要不要删除」那种确认，
 * 而是一局结束后的结算。
 *
 * v0.9.3 §3：通过的那一面换了写法 —— 标题「定案」、不报用时、不写「校验通过」。
 * 这一局已经结束，界面该说的是「结案了」，而不是再念一遍成绩；用时对玩家没有
 * 下一步，对作者也不该出现在玩家的结算卡上。
 * v0.9.7：标题再改成「🎉 恭喜定案！」—— 结案是值得高兴的一刻，不要再板着脸
 * 只写两个字。
 */
export function GameResultDialog({
  result,
  ending,
  hasNextLevel,
  onClose,
  onContinue,
  onRestart,
  onNextLevel,
  onBackToList,
}: GameResultDialogProps): JSX.Element {
  return (
    <Dialog
      open={result !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        {result?.kind === 'passed' ? (
          <div className="flex items-start justify-between gap-4 pr-6">
            <div className="min-w-0 space-y-1.5">
              <DialogTitle className="font-kai text-2xl font-semibold tracking-[0.1em]">
                <span aria-hidden="true">🎉</span> 恭喜定案！
              </DialogTitle>
              <DialogDescription className="sr-only">这一局已经结束。</DialogDescription>
            </div>
            {/*
              * v0.9.6：**这一格不再画印章**。用户把它移到了地图遮罩上 ——
              * 印是「盖在纸上」的东西，弹窗是一张浮起来的卡，把印塞进卡里
              * 两处各盖一次就成了重复播报。动效也跟着搬过去（见 `VerdictMark`）。
              */}
          </div>
        ) : result?.kind === 'failed' ? (
          <DialogHeader>
            {/* v0.9.4：标题与正文都只报结论 —— 谁不对由棋盘上的圈说，这里只报对了几个。 */}
            <DialogTitle>结果</DialogTitle>
            <DialogDescription>
              你没有找出所有人的位置！{result.correct}/{result.total} 正确。未能结案。
            </DialogDescription>
          </DialogHeader>
        ) : null}

        {/*
          v0.7.14（docs/v0.7.14.md §4）：结束语。作者的一句话，通过时才出现。
          **不给它加标签**（不写「结束语：」）—— 那是作者的声音，不是界面在说话。
          v0.9.3 §3：上面那条「用时」拿掉之后，它成了这张卡唯一的正文，于是
          与标题之间补一条细线 —— 「定案」两个字和作者写的这一段是两件事。
        */}
        {result?.kind === 'passed' && ending.length > 0 ? (
          <p className="whitespace-pre-wrap border-t pt-3 font-kai text-sm leading-[1.9] text-foreground/90">
            {ending}
          </p>
        ) : null}

        <DialogFooter className="flex-wrap">
          {result?.kind === 'passed' ? (
            <>
              {/*
                * v0.9.5：两张结果卡都多一枚「返回谜题列表」—— 一局到此结束，
                * 玩家的下一个动作通常不是「再点一次棋盘」，而是挑下一关。
                * 落点与左上角那个箭头同一个地址（`source.listHref()`）。
                */}
              <Button variant="outline" onClick={onClose}>
                关闭
              </Button>
              {/*
                * 「再玩一次」是这一面的**兜底主按钮**：后面没有没做过的关时
                * （没有 `nextLevel`，比如这是最后一关、或下面的都通过了），
                * 结案卡上仍然得有一个实心按钮，否则四枚全是描边、读不出下一步。
                * 有「下一关」时它让位，退成 outline。
                */}
              <Button variant={hasNextLevel ? 'outline' : 'default'} onClick={onRestart}>
                再玩一次
              </Button>
              <Button variant="outline" onClick={onBackToList}>
                返回谜题列表
              </Button>
              {/*
                * v0.9.5：**下一关**。通过之后才出现 —— 未通过时「换一关」是一句
                * 逃跑的邀请，通过之后它才是顺理成章的下一步。
                *
                * 「下一关」＝列表顺序里排在当前之后、**还没通过**的第一关
                * （`lib/gameCatalog.ts`）。后面没有了、或下面的关全通过过了，这枚
                * 按钮就不画 —— 指不到地方的按钮比没有更糟。
                */}
              {hasNextLevel ? <Button onClick={onNextLevel}>下一关</Button> : null}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onContinue}>
                继续游戏
              </Button>
              {/*
                * v0.9.5：未通过也留一条退路 —— 这一局可以接着改（继续游戏），
                * 也可以先去别的关。两枚新按钮都是 `outline`：这一面的主按钮仍是
                * 「重新开始」（本版不动它），退出与换关不该比它更抢眼。
                */}
              <Button variant="outline" onClick={onBackToList}>
                返回谜题列表
              </Button>
              <Button onClick={onRestart}>重新开始</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
