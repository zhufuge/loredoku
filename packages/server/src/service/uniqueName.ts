/** 复制 / fork 的取名兜底：`{base} 副本`、`{base} 副本 2`… 直到不撞名。 */
export async function uniqueCopyName(
  base: string,
  exists: (name: string) => Promise<boolean>,
): Promise<string> {
  let candidate = `${base} 副本`;
  let index = 2;
  while (await exists(candidate)) {
    candidate = `${base} 副本 ${index}`;
    index += 1;
  }
  return candidate;
}

/** `base` 不撞名就用它，撞了才走副本序列。 */
export async function uniqueName(
  base: string,
  exists: (name: string) => Promise<boolean>,
): Promise<string> {
  if (!(await exists(base))) return base;
  return uniqueCopyName(base, exists);
}
