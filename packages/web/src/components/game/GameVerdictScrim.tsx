import { MAP_LAYER_Z } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { DIALOG_OVERLAY_TINT_CLASS } from '@/components/ui/dialog';
import { VerdictMark } from '@/components/game/VerdictMark';
import { cn } from '@/lib/utils';

/**
 * v0.9.6：**定案遮罩** —— 校验通过（或这一关早就完成了）时，地图方格被整片蒙住，
 * 上面盖「定案 + 印章」。
 *
 * 为什么挂在画布纸里而不是当成第五处独立遮罩：用户要的是「把地图方格用遮罩遮住，
 * 上面展示定案+印章（位置和谜题卡片一样）」。位置与卡片一致，意味着它得跟着纸走
 * —— 挂在 `game-canvas` 里就自动随缩放/平移，不必再量一次矩形。它压在内容层
 * 之上（`zIndex` 取最高的鼠标框 +1），所以格子、物品、头像都被蒙住。
 *
 * 左右两栏**不遮**（用户明确：已完成的再进入只留地图方格遮罩）；校验通过那一瞬的
 * 左右遮罩由 `checkRun` 那条路径撤掉 —— 见 `GamePage` 提交后的 effect。
 *
 * v0.10.4：从 `GamePage` 搬出来。「什么时候盖」「什么时候该有『再玩一次』」这两条
 * 判据仍留在页面（它们读的是这一局的状态），这里只认三个布尔量。
 */
export interface GameVerdictScrimProps {
  /** 通过那一刻解析好的印章图（谜题 → 主题 → 内置，见 `lib/toolIcons.ts`）。 */
  stampUrl: string | null;
  /** v0.10.0 / v0.10.2：按棋盘与可见区算出来的等比缩小。 */
  scale: number;
  /** 刚通过要演一次「印下去」；已完成再进入是既成事实，不演。 */
  animate: boolean;
  /** 这一屏的出入口要不要在场（见 `GamePage` 的 `verdictDismissed`）。 */
  showReplay: boolean;
  onReplay: () => void;
}

export function GameVerdictScrim({
  stampUrl,
  scale,
  animate,
  showReplay,
  onReplay,
}: GameVerdictScrimProps): JSX.Element {
  return (
    <div
      data-testid="verdict-scrim"
      /* v0.9.7：与四处校验遮罩、弹窗 overlay 同一档「一般遮罩颜色」
         （`DIALOG_OVERLAY_TINT_CLASS` = bg-black/60）。v0.9.6 用的是
         bg-background/85，浅色系、过实，读起来像另一套东西。 */
      className={cn(
        DIALOG_OVERLAY_TINT_CLASS,
        /*
         * v0.9.7：遮罩自己接住指针 —— 中列容器已经 `pointer-events-none`，
         * 这里显式恢复，免得指针穿到下面的格子上去。按钮仍带
         * `pointer-events-auto`，是这一屏唯一能点的东西。
         */
        'pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-6',
      )}
      style={{ zIndex: MAP_LAYER_Z.mouseCursorBox + 1 }}
    >
      <VerdictMark
        stampUrl={stampUrl}
        /* 棋盘比 291px 的卡大得多，但排法与卡片完全一致。 */
        large
        /* 深色遮罩上用浅色文字；印章保持作者上传的原色（v0.9.7 第六批）。 */
        onDark
        /*
         * v0.9.8：印章在**游戏内**再让开一段，像盖在纸的角落。
         * v0.10.2：「定案」改竖排之后，字块从「宽的两字」变成「窄的一列」，
         * 印跟着挪到字列右下侧 —— 往右 8px、往下 40px。往下是让它压住
         * 「案」的右上角（原来压的是横向两字的下缘），往右是把字列右侧
         * 那截空白用起来；再往右就贴到遮罩边缘了。
         */
        stampOffset={{ x: 8, y: 40 }}
        /*
         * v0.10.2：用户「排版整体再靠右一些」—— 字与印一起往右挪，
         * 两块的相对位置不变。这一屏原本整块居中，居中读起来偏左
         * （字列窄、右侧有印，视觉重心落在左边那半个盒子里）。
         * 平移同样交给 `translate`，跟着 `scale` 一起缩，竖屏同比例。
         */
        shift={{ x: 72 }}
        /*
         * v0.10.0：手机上的棋盘小得多，这一整套（字、印、让开的偏移）
         * 跟着棋盘等比缩，否则会顶出遮罩。桌面棋盘够大时恒为 1。
         */
        scale={scale}
        /*
         * 刚通过时演一次「印下去」；已完成再进入是既成事实，不演。
         * 判据只看「是不是这次进来的」，不看 result —— 结算卡弹出后遮罩还
         * 在（它才是背景），动画类不该因为弹窗出现就被摘掉。
         */
        animate={animate}
      />
      {/*
       * v0.10.2：**「再玩一次」不在这一局的开头就渲染出来**。
       *
       * 用户：「从一开始就不要渲染，后面再渲染出来」。原先判据是 `!result`
       * —— 刚通过的那 1 秒里 `finished` 已真、`result` 还是 null，按钮先画
       * 出来；结算卡一弹又被撤掉；关上再补回来。一进一出闪了两下。
       *
       * 现在只认两种「它该在场」的时机（判据在 `GamePage`）：
       * 1. 这是「已完成再进入」那一版，一进来就盖着遮罩、表停在 00:00，
       *    按钮就是这一屏的出口（v0.9.6 定的）；
       * 2. 这一次是刚通过，且结算卡已经关上。
       * 两者都不成立（= 刚通过那 1 秒、定案遮罩单独在场）时，这一屏只是
       * 结论，不给任何出口。
       */}
      {showReplay ? (
        <Button data-testid="verdict-replay" onClick={onReplay} className="pointer-events-auto">
          再玩一次
        </Button>
      ) : null}
    </div>
  );
}
