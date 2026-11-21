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
        {/* 竖屏顶部窄：标题只给读屏（sr-only），视觉上不重复作者写的描述。 */}
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
                {/* 图标与标题都来自主题：配了图就只画图，文字标题不再出现，避免挤成两截。 */}
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
            {/* 这一格不画印章：印章属于地图遮罩（VerdictMark），弹窗再盖一次是重复播报。 */}
          </div>
        ) : result?.kind === 'failed' ? (
          <DialogHeader>
            {/* 只报结论：谁不对由棋盘上的圈说，这里只报对了几个。 */}
            <DialogTitle>结果</DialogTitle>
            <DialogDescription>
              你没有找出所有人的位置！{result.correct}/{result.total} 正确。未能结案。
            </DialogDescription>
          </DialogHeader>
        ) : null}

        {/* 结束语：作者的一句话，通过后才出现；不加「结束语：」标签，与标题之间用细线分隔（docs/v0.7.14.md §4）。 */}
        {result?.kind === 'passed' && ending.length > 0 ? (
          <p className="whitespace-pre-wrap border-t pt-3 font-kai text-sm leading-[1.9] text-foreground/90">
            {ending}
          </p>
        ) : null}

        <DialogFooter className="flex-wrap">
          {result?.kind === 'passed' ? (
            <>
              {/* 两张结果卡都放「返回谜题列表」：一局结束后的下一步通常是挑下一关，落点同左上角箭头（source.listHref()）。 */}
              <Button variant="outline" onClick={onClose}>
                关闭
              </Button>
              {/* 「再玩一次」是兜底主按钮：没有下一关时保持实心；有下一关时让位，退成 outline。 */}
              <Button variant={hasNextLevel ? 'outline' : 'default'} onClick={onRestart}>
                再玩一次
              </Button>
              <Button variant="outline" onClick={onBackToList}>
                返回谜题列表
              </Button>
              {/* 「下一关」＝列表顺序里当前之后、还没通过的第一关；通过后才画，指不到地方就不画（lib/gameCatalog.ts）。 */}
              {hasNextLevel ? <Button onClick={onNextLevel}>下一关</Button> : null}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onContinue}>
                继续游戏
              </Button>
              {/* 未通过也留退路：继续本局或换一关；两枚都用 outline，主按钮是「重新开始」。 */}
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
