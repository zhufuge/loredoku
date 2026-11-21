import { useEffect, useMemo, useState } from 'react';

/**
 * 一张页面要画的图片全都**预加载完**才算就绪。不能用渲染出来的 `<img onLoad>` 来数：那样必须先渲染，而渲染又被 loading 挡着 —— 图片永远没机会 load。约定：空签名直接就绪；`onerror` 也算不必再等（一张 404 不该把玩家永久卡在 loading）；依赖用**内容拼出的签名**，不是每次渲染都换引用的数组。
 */
export function useImagePreload(urls: (string | null | undefined)[]): boolean {
  // 先用内容拼出稳定签名，再让 hook 依赖这个字符串；直接依赖数组会让每次渲染都重算。
  const joined = urls.join('\n');
  const signature = useMemo(() => {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const url of joined.split('\n')) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      unique.push(url);
    }
    return unique.join('\n');
  }, [joined]);

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
      image.addEventListener('load', finish);
      image.addEventListener('error', finish);
      image.src = url;
      images.push(image);
    }
    return () => {
      cancelled = true;
      for (const image of images) {
        image.removeEventListener('load', finish);
        image.removeEventListener('error', finish);
      }
    };
  }, [signature]);

  return signature === '' || loaded === signature;
}