import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** 页面名，2–3 个字。 */
  title: string;
  /** 一句话说明这个页面能做什么 —— 不要再重复标题里已经有的词。 */
  description: ReactNode;
  /** 页级主操作。通常只有一个按钮；没有就整块不渲染。 */
  actions?: ReactNode;
}

/**
 * v0.7.8 §10：五个工坊页共用的页头模板。
 *
 * 改之前同一件事有三种写法：地图 / 谜题 / 部署把主操作放在页头右侧，
 * 资源 / 角色把它塞进左栏搜索行的尾巴上，而且是个没有文案、没有 `title`
 * 的纯图标按钮。现在统一成「标题 + 一句话 + 右侧主操作」。
 *
 * 三条约定：
 * - 标题与副标题之间 `space-y-1` —— 比标题到正文（24px）紧，两者是一组；
 * - `flex-wrap` + `gap-y-3`：窄屏时主操作换到下一行，不挤压标题；
 * - `min-w-0` 在左侧，长标题 / 长副标题截断的是自己，不会把按钮顶出去。
 */
export function PageHeader({ title, description, actions }: PageHeaderProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
