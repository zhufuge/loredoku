import { useEffect, useMemo, useState } from 'react';

/**
 * 一张页面要画的图片全都**预加载完**才算就绪。
 *
 * 为什么不用「渲染出来的 `<img onLoad>`」来数：那样必须先渲染，而渲染又被 loading
 * 挡着 —— 图片永远没机会 load，loading 就永远撤不掉。预加载与渲染分开，两个方向
 * 都不再互相等着。
 *
 * 三条约定：
 * - 空值 / 重复地址剔掉，签名为空时直接算就绪（没有图要等）。
 * - `onerror` 也算「不必再等」：一张 404 的图不该把玩家永久卡在 loading 上。
 * - 入参数组每次渲染都是新引用，所以依赖用**内容拼出来的签名**，不是数组本身。
 */
export function useImagePreload(urls: (string | null | undefined)[]): boolean {
  const signature = useMemo(() => {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const url of urls) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      unique.push(url);
    }
    return unique.join('\n');
  }, [urls.join('\n')]);

  const [loaded, setLoaded] = useState<string | null>(null);

  useEffect(() => {
    if (signature === '') return undefined;
    const list = signature.split('\n');
    let cancelled = false;
    let remaining = list.length;
    const images: HTMLImageElement[] = [];
    const finish = (): void => {
      remaining -= 1;
      if (remaining <= 0 && !cancelled) setLoaded(signature);
    };
    for (const url of list) {
      const image = new Image();
      image.onload = finish;
      image.onerror = finish;
      image.src = url;
      images.push(image);
    }
    return () => {
      cancelled = true;
      for (const image of images) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [signature]);

  return signature === '' || loaded === signature;
}