// 交互色：鼠标框 / 操作框那两枚淡色（OPT-A06 §5.1）。
// v0.10.4：从 `map.ts` 单独拎出来 —— `grid.ts` 的鼠标框要读它，而 `map.ts` 的
// 样式缺省值又要读 `grid.ts` 的格子边界，放在一起就成了循环。
/**
 * OPT-A06 §5.1 centralises the interaction colours (v0.3.5 softened the deep
 * `#E53935` / `#3B82F6` into this pale pair). Not covered, by design:
 * theme colours, region colours, item artwork, grid lines.
 */
export const HIGHLIGHT_RED = '#EF9A9A';
export const HIGHLIGHT_BLUE = '#90CAF9';
