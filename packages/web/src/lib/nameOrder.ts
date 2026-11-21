/**
 * 资源 / 角色列表按名字排序 —— 中文按拼音，其余按字母。
 *
 * 用 `Intl.Collator('zh-CN')` 就够了：它的中文序就是拼音序（实测 `宝` bǎo <
 * `黛` dài < `贾` jiǎ < `李` lǐ），而拼音序天然与「按首字母分组」一致 —— 比较
 * 两个音节时先比首字母、再比余下的部分，所以 B 组的名字一定整体排在 D 组之前。
 * 自己维护一张拼音表既漏字又难维护，引第三方拼音库则要为一个排序多背几十 KB。
 *
 * 两条已知的次序（CLDR 的中文排序规则，不是这里的偏好）：
 * - 汉字排在拉丁字母**之前**（`阿` < `apple`），数字与符号又在汉字之前；
 * - 名字相同（不同资源可以同名）时依次退回 `code`、`id`，让顺序在每次重新取数
 *   之后都一样 —— 只靠 `sort` 的稳定性会跟着服务端的返回顺序漂。
 */
export interface NamedRow {
  name: string;
  code?: string;
  id?: number;
}

const collator = new Intl.Collator('zh-CN');

export function compareByName(a: NamedRow, b: NamedRow): number {
  return (
    collator.compare(a.name, b.name) ||
    collator.compare(a.code ?? '', b.code ?? '') ||
    (a.id ?? 0) - (b.id ?? 0)
  );
}

/** 返回排好序的**新数组**，调用方的查询数据不动（react-query 的缓存不该被就地改）。 */
export function sortByName<T extends NamedRow>(rows: readonly T[]): T[] {
  return [...rows].sort(compareByName);
}
