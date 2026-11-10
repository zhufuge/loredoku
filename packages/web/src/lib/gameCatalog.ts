/**
 * v0.9.5：定案卡上那枚「下一关」要跳去哪。
 *
 * 「下一关」＝列表里**排在当前这一关之后、还没通过**的第一关。三件事说清楚：
 *
 * 1. **顺序即列表顺序**。两个入口给过来的都是列表页看到的那一份（线上按
 *    `sortWeight, slug`，包里按导出时的同一套顺序），所以「下一关」与玩家在
 *    列表上看到的先后永远一致 —— 不用另存一个「关卡序号」。
 * 2. **跳过已通过的**。已经盖了印的关卡再跳一次没有意义，玩家要的是「还没做的
 *    下一件」。
 * 3. **不回头、不缠绕**。当前这一关之后没有了就是没有 —— 那种情况定案卡不画
 *    这枚按钮，而不是绕回第一关（「下一关」绕回开头是另一句话）。
 */

/** 列表里的「一关」。只够算下一关，不重复一份卡片数据。 */
export interface GameLevelRef {
  /** 路由尾段 / 存档键的中段：线上是 slug，包里是 key。 */
  key: string;
  /** 存档指纹的一部分（见 `lib/gameCompletion.ts`）。 */
  gridSize: number;
}

/**
 * @param levels 列表顺序的关卡（调用方保证是玩家看到的那一份）
 * @param currentKey 当前这一关的 key；不在清单里时从头开始找
 * @param isCompleted 某一关通过了吗（由调用方查通过记录）
 * @returns 下一关；后面没有未完成的关时 `null`
 */
export function nextUnfinishedLevel(
  levels: readonly GameLevelRef[],
  currentKey: string,
  isCompleted: (level: GameLevelRef) => boolean,
): GameLevelRef | null {
  const index = levels.findIndex((level) => level.key === currentKey);
  // 当前这一关不在清单里（地址过时 / 关卡刚被取消部署）：从清单开头找第一关
  // 还没通过的 —— 那才是「下一个还没做的」。
  const start = index < 0 ? 0 : index + 1;
  for (let cursor = start; cursor < levels.length; cursor += 1) {
    const level = levels[cursor];
    if (!level) continue;
    if (!isCompleted(level)) return level;
  }
  return null;
}
