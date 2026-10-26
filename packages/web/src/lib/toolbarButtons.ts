/**
 * 工具栏图标按钮的底色梯度（v0.7.0 fix，v0.7.8 改为语义 token）。
 *
 * shadcn 的 `secondary` / `accent` 在浅色主题同值 `hsl(210 40% 96.1%)`
 * （≈ slate-100），工具栏按钮选中或悬停时几乎看不出底色，所以这里单独给一档
 * 「比 secondary 再深一点」的底色：未选中悬停用半透明，选中用实心（悬停再深一档）。
 *
 * v0.7.8 §1：原来写的是 `bg-slate-200 / dark:bg-slate-700` 这类定色，深色模式
 * 必须成对写 `dark:`，漏一处就在深色下留白疤。现在改吃 `index.css` 里的
 * `--toolbar*` 变量（取值与原 slate 值等价，观感不变），明暗分流交给变量本身，
 * 调用处不再出现 `dark:`。
 *
 * 编辑器工具条（地图 / 谜题两个编辑器）、游戏页右栏工具栏、导航栏共用这两个常量，
 * 保证同一档手感。
 */
export const TOOLBAR_ICON_ACTIVE_CLASS = 'bg-toolbar text-toolbar-foreground hover:bg-toolbar-hover';

export const TOOLBAR_ICON_HOVER_CLASS = 'hover:bg-toolbar/70';

/**
 * v0.7.8 §2：面板 / 抽屉里的 28px 图标按钮（刷新、收起、展开、抽屉关闭…）。
 *
 * 这串 class 原本在 5 个文件里各写一遍，且都带着 `dark:hover:bg-slate-700/70`
 * 的配对；集中到这里后，新增面板按钮只写这一个常量，不会再漏 `dark:` 或写错尺寸。
 * 需要撑开额外宽度（`shrink-0`、`w-full`）的地方在调用处补。
 */
export const PANEL_ICON_BUTTON_CLASS =
  'flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-toolbar/70 hover:text-foreground';
