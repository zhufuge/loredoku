import { useEffect, useState } from 'react';
import { loadBundledFonts } from '@/lib/fonts';

/**
 * v0.11.3（docs/v0.11.3.md §2）—— 自带字体能画了没有。
 *
 * 为什么需要它：`registerBundledFonts()` 只登记不下载，字体真正到位是在第一次有
 * 文字用到它的时候。播放器的列表页整页都是 `.font-kai`（主题名、关卡名、定案字），
 * 于是「内容先出来 → 字体后到 → 字形刷一遍」这件事在慢网上看得见。等字体就绪
 * 再放内容，首帧就是最终字形。
 *
 * 三条约定：
 * - 一个产物只装一份字体，只等一次；结果缓存在模块作用域，翻回列表页不重新等。
 * - 失败也算就绪（`loadBundledFonts` 内部把 `load()` 的错误吞掉了）—— 字体取不到
 *   该退回系统楷体，不该把玩家卡在加载页。
 * - 已经就绪过就直接返回 `true`，不产生「先 false 再 true」的多余一帧。
 */
let resolved = false;

export function useBundledFontsReady(): boolean {
  const [ready, setReady] = useState(resolved);

  useEffect(() => {
    if (resolved) {
      setReady(true);
      return undefined;
    }
    let cancelled = false;
    void loadBundledFonts()
      .catch(() => undefined)
      .then(() => {
        resolved = true;
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}

/** 测试用：把「已经等过字体」这件事复原，免得用例之间互相影响。 */
export function resetBundledFontsReadyForTest(): void {
  resolved = false;
}
