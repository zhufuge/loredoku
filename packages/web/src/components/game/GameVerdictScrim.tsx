import { ITEM_NAME_TIP_Z } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { DIALOG_OVERLAY_TINT_CLASS } from '@/components/ui/dialog';
import { VerdictMark } from '@/components/game/VerdictMark';
import { cn } from '@/lib/utils';

/** **定案遮罩** —— 校验通过（或这一关早就完成了）时，地图方格被整片蒙住， 上面盖「定案 + 印章」。 为什么挂在画布纸里而不是当成第五处独立遮罩：用户要的是「把地图方格用遮罩遮住， 上面展示定案+印章（位置和谜题卡片一样）」。 位置与卡片一致，意味着它得跟着纸走 —— 挂在 `game-canvas` 里就自动随缩放/平移，不必再量一次矩形。 它压在内容层 之上（`zIndex` 取物品名称提示再 +1，于是比鼠标框、比提示纸片都高），所以格子、 物品、头像都被蒙住。 「什么时候盖」「什么时候该有『再玩一次』」这两条判据在 `GamePage`（它们读的是 这一局的状态），这里只认三个布尔量。 */
export interface GameVerdictScrimProps {
  /** 通过那一刻解析好的印章图（谜题 → 主题 → 内置，见 `lib/toolIcons.ts`）。 */
  stampUrl: string | null;
  /** 按棋盘与可见区算出来的等比缩小。 */
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
      /* 与四处校验遮罩、弹窗 overlay 同一档「一般遮罩颜色」
         （`DIALOG_OVERLAY_TINT_CLASS`）：半透明的黑；换浅色底会过实，读起来
         像另一套东西。 */
      className={cn(
        DIALOG_OVERLAY_TINT_CLASS,
        /* 遮罩自己接住指针 —— 中列容器已经不接指针事件，这里显式恢复，免得指针穿到下面的格子上去。按钮自己重新打开指针事件，是这一屏唯一能点的东西。 */
        'pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-6',
      )}
      /* 结案遮罩压在所有 affordance 之上（纸片也不例外）—— 物品名称提示在 `ITEM_NAME_TIP_Z`（鼠标光标框 +1），遮罩得比它再抬一格。 */
      style={{ zIndex: ITEM_NAME_TIP_Z + 1 }}
    >
      <VerdictMark
        stampUrl={stampUrl}
        /* 棋盘比 291px 的卡大得多，但排法与卡片完全一致。 */
        large
        /* 深色遮罩上用浅色文字；印章保持作者上传的原色（v0.9.7 第六批）。 */
        onDark
        /* 印章在**游戏内**再让开一段，像盖在纸的角落：往右 8px、往下 40px。 往下是让它压住「案」的右上角，往右是把字列右侧那截空白用起来； 再往右就贴到遮罩边缘了。 */
        stampOffset={{ x: 8, y: 40 }}
        /* **不整块往右挪**：大字档的印脱离文档流（挂在字列右缘外），行里只剩字列，「定案」真的落在遮罩正中 —— 再右移 72px 反而会把它推偏。 */
        /* 手机上的棋盘小得多，这一整套（字、印、让开的偏移） 跟着棋盘等比缩，否则会顶出遮罩。桌面棋盘够大时恒为 1。 */
        scale={scale}
        /* 刚通过时演一次「印下去」；已完成再进入是既成事实，不演。 判据只看「是不是这次进来的」，不看 result —— 结算卡弹出后遮罩还在（它才是背景），动画类不该因为弹窗出现就被摘掉。 */
        animate={animate}
      />
      {/* 「再玩一次」只在这两种时机在场：已完成再进入（遮罩 + 00:00）、刚通过且结算卡已关；刚通过那 1 秒不给出口。 */}
      {showReplay ? (
        <Button data-testid="verdict-replay" onClick={onReplay} className="pointer-events-auto">
          再玩一次
        </Button>
      ) : null}
    </div>
  );
}
