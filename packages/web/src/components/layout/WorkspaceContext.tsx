import { createContext, useContext, type ReactNode } from 'react';
import type { Theme } from '@loredoku/shared';
import type { ModuleKey } from '@/lib/workspace';

/**
 * v0.8.0 §18：当前工作空间（主题）的上下文。
 *
 * 谁需要它：五个内容页（要把 `themeCode` 带进查询、要在空态里点出主题名）、
 * 三个新建对话框（新行落在哪个主题）、以及顶栏的主题切换器。
 *
 * 为什么不是 hook + `useParams`：`themeCode` 只是地址里那段字符串，**不是**主题
 * 对象。每一页都自己 `useThemes()` 再 `.find()` 一遍，就会在主题改名的瞬间出现
 * 「顶栏叫新名字、正文还在等旧名字」的两份真相。解析只发生一次，在
 * `WorkspaceLayout` 里。
 *
 * `null` = 不在工作空间里（全屏编辑器、播放页、系统配置页，以及大量单测直接渲染
 * 某个页面的情形）。这时页面退回「不限定主题」的老行为 —— 与其抛错，不如让它
 * 仍然渲染得出来。
 */
export interface WorkspaceValue {
  /** 已解析的主题（带计数）。 */
  theme: Theme;
  /** 全部主题 —— 切换器要用，省一次请求。 */
  themes: Theme[];
  /**
   * = `theme.code`。**查询参数、地址、资源包用的都是它**（§19）—— 主题没有第二个
   * 标识符。上一版这里还有一个 `themeId`（给筛选参数用），现在没有了：同一个东西
   * 两个名字，调用方一定会各挑一个。
   */
  themeCode: string;
  /** `/:code/:module`。 */
  href: (module: ModuleKey) => string;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceValue;
  children: ReactNode;
}): JSX.Element {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue | null {
  return useContext(WorkspaceContext);
}
