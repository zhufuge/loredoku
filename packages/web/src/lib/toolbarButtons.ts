/**
 * 工具栏图标按钮的底色梯度（v0.7.0 fix）。
 *
 * shadcn 的 `secondary` / `accent` 在浅色主题同值 `hsl(210 40% 96.1%)`
 * （≈ slate-100），工具栏按钮选中或悬停时几乎看不出底色。这里统一下沉
 * 一档：未选中悬停用半透明 slate-200，选中用实心 slate-200（悬停时再深到
 * slate-300）；深色主题对称取 slate-700 / slate-600。
 *
 * 编辑器工具条（地图 / 谜题两个编辑器共用）与游戏页右栏工具栏都走这两个
 * 常量，保证同一档手感。
 */
export const TOOLBAR_ICON_ACTIVE_CLASS =
  'bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600';

export const TOOLBAR_ICON_HOVER_CLASS =
  'hover:bg-slate-200/70 dark:hover:bg-slate-700/70';
