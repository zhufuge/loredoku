/** 非数组对象判定；JSON 里读出来的 `unknown` 只有这一种形状能安全索引。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
