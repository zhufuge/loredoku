import { useEffect, useState } from 'react';
import { loadBundledFonts } from '@/lib/fonts';

/**
 * v0.11.3（docs/v0.11.3.md §2）—— 自带字体画得了没有。`registerBundledFonts()` 只登记不下载，字体真正到位是在第一次有文字用它时，不等就会「内容先出 → 字体后到 → 字形刷一遍」。一个产物只等一次（结果缓存在模块作用域）；**失败也算就绪** —— 取不到该退回系统楷体，不该把玩家卡在加载页。
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
