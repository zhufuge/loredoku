/** 统一的 mutation 错误文案：Error 用自带 message，其余落到调用方的 fallback。 */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
