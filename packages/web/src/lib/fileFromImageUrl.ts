/**
 * 把一个**已经在服务器上**的图片读成 `File`，供「默认用谜题封面」这类
 * 「复制一份到新条目」的场景使用（v0.7.2 §4）。
 *
 * 为什么不直接把那张图的路径塞进新行：两个条目各有一份文件，谜题后来换封面 /
 * 删封面都不会让游戏的封面变成悬空路径；而且上传端点会重新编码 + 出缩略图。
 *
 * 读的是 `arrayBuffer` 而不是 `response.blob()`：跨 realm 的 `Blob`（undici 的
 * Blob 喂给 jsdom 的 `File` 构造器）会被拒绝，ArrayBuffer 没有这个问题。
 *
 * 读不到（404 / 网络错误 / 非图片响应）返回 `null` —— 封面本来就可以留空，
 * 这里失败不该把已经成功的部署带崩。
 */
export async function fileFromImageUrl(url: string, baseName: string): Promise<File | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const mime = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
    if (!mime.startsWith('image/')) return null;
    // `image/svg+xml` → `svg`；其余取 `image/png` 的 `png`。
    const extension = (mime.split('/')[1] ?? 'png').split('+')[0] || 'png';
    const buffer = await response.arrayBuffer();
    return new File([buffer], `${baseName}.${extension}`, { type: mime });
  } catch {
    return null;
  }
}
