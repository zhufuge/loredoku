import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ScopedEmptyProps {
  /** 当前工作空间的名字；`null` = 没有主题上下文（旧地址、单独渲染的页面）。 */
  themeName: string | null;
  /** 复数名词，出现在「「红楼梦」里还没有地图」这句里。 */
  noun: string;
  /** 主按钮的动作名，例如「新建地图」。 */
  action: string;
  onCreate: () => void;
}

/**
 * v0.8.0（docs/v0.8.0.md §16.12）—— 空态的**第四种**句式：被主题筛掉。
 *
 * `design-system.md` §3.6 定了三种（无数据 / 搜索无果 / 面板短句），有了主题
 * 边界就有了第四种。它和「无数据」的区别是**原因不同**：库里明明有东西，只是不在
 * 这个主题里。所以句子必须点名主题，按钮必须带上主题 ——
 *
 * ```
 * 「红楼梦」里还没有地图
 * 在「红楼梦」下新建地图
 * ```
 *
 * 按钮带主题是这条规则的重点：把作者丢回「全部」去新建，他得再选一次主题，
 * 而 `theme_id` 建行之后不可改（§8 护栏 2）—— 选错了就只能重建。
 *
 * v0.8.0 §18：主题名不再自己查一遍（原来这里 `useThemes()`），由调用方从工作空间
 * 上下文里递进来 —— 一个主题在顶栏、页头、空态里各查一次，改名时就会有三份
 * 不同步的名字。
 */
export function ScopedEmpty({ themeName, noun, action, onCreate }: ScopedEmptyProps): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">
        {themeName ? `「${themeName}」里还没有${noun}` : `还没有${noun}，先创建一个吧`}
      </p>
      <Button onClick={onCreate}>
        <Plus className="mr-1 h-4 w-4" />
        {themeName ? `在「${themeName}」下${action}` : action}
      </Button>
    </div>
  );
}
