import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** 玩家页的两个弹框：谜题描述（只竖屏用）与结算卡（两种结局共用）。 两者都是「一句话的数据 + 几个出口」，不读这一局的任何中间状态。 */
export interface GameDescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
}

/** 竖屏下的谜题描述弹框。 触发的是头部那枚 `FileText` 图标。 为什么弹框而不是留在面板里：竖屏一屏只够放棋盘 + 名册，描述是三行也好 三十行也好，只在开局读一遍 —— 占着固定的高度不划算。 线索不同，它们要 反复对照，仍留在面板里（`GameBrief` 只关掉描述那一段）。 正文沿用面板里那套写法（`whitespace-pre-wrap`、`text-muted-foreground`）， 只是不再 `line-clamp-3` —— 弹框就是为了读全文，再收一次反而多一步。 */
export function GameDescriptionDialog({
  open,
  onOpenChange,
  description,
}: GameDescriptionDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {/*
          v0.11.6：竖屏这块地方本来就窄，作者写的那段描述才是内容 —— 顶上再压一行
          「谜题描述」，等于用一行字重复了用户刚点的那枚图标。标题仍留给读屏：
          `sr-only` 之后它不进视觉，Radix 也仍然知道这个弹窗叫什么。
        */}
        <DialogHeader className="sr-only">
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
  /** 通过那一面的图标与标题（主题里可改）。 拆成两截而不是一个字符串：图标将来可能换成一张上传的小图，标题永远是一句字 —— 挤在一格里，换图就得做字符串手术。`iconUrl` 有值时画图、不画 `iconText`。 */
  verdictIconUrl: string | null;
  verdictIconText: string;
  verdictTitle: string;
  /** 「下一关」有没有地方可指；没有时不画那枚按钮。 */
  hasNextLevel: boolean;
  onClose: () => void;
  onContinue: () => void;
  onRestart: () => void;
  onNextLevel: () => void;
  onBackToList: () => void;
}

/** 提交的两种结局共用一个弹窗。；通过：定案 + 结束语 + 再玩一次；；未通过：结果 +「x/n 正确。 未能结案」，不列名单位置 + 继续游戏 / 重新开始。 两种都用 `Dialog`，不是 `AlertDialog` —— 这里不是「要不要删除」那种确认， 而是一局结束后的结算。 v0.9.3 §3：通过的那一面 —— 标题「定案」、不报用时、不写「校验通过」。 这一局已经结束，界面该说的是「结案了」，而不是再念一遍成绩； 用时对玩家没有 下一步，对作者也不该出现在玩家的结算卡上。 标题是「🎉 恭喜定案！ 」—— 结案是值得高兴的一刻，不必板着脸只写两个字。 */
export function GameResultDialog({
  result,
  ending,
  verdictIconUrl,
  verdictIconText,
  verdictTitle,
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
              <DialogTitle className="flex items-center gap-2 font-kai text-2xl font-semibold tracking-[0.1em]">
                {/*
                  v0.11.3：图标与标题是主题里的两份配置。配了图就用图，不再画文字
                  —— 图能表达的东西文字表达不了，两者同时出现只会把标题行挤成两截。
                */}
                {verdictIconUrl ? (
                  <img
                    data-testid="verdict-icon"
                    src={verdictIconUrl}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="h-6 w-6 shrink-0 select-none object-contain"
                  />
                ) : (
                  <span data-testid="verdict-icon" aria-hidden="true">
                    {verdictIconText}
                  </span>
                )}
                <span data-testid="verdict-title">{verdictTitle}</span>
              </DialogTitle>
              <DialogDescription className="sr-only">这一局已经结束。</DialogDescription>
            </div>
            {/*
              * **这一格不画印章**：印是「盖在纸上」的东西，弹窗是一张浮起来的卡，
              * 两处各盖一次就成了重复播报。印章与动效都在地图遮罩上（见 `VerdictMark`）。
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
                * 两张结果卡都多一枚「返回谜题列表」—— 一局到此结束，
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
                * **下一关**。通过之后才出现 —— 未通过时「换一关」是一句
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
                * 未通过也留一条退路 —— 这一局可以接着改（继续游戏），
                * 也可以先去别的关。两枚按钮都是 `outline`：这一面的主按钮是
                * 「重新开始」，退出与换关不该比它更抢眼。
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
