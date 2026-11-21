/** v0.11.3（docs/v0.11.3.md §1）：构建期按产物实际用到的字符裁字体（`subset-font` 只在 Node 侧）。
 *  另无条件带 ASCII 与常用标点，少收一个字就是豆腐块。 */

/** 无条件保留的字符：ASCII 可打印区 + 中文排版常用的那几个符号。 为什么不能只靠「扫描到的字」：数字、拉丁字母会在运行时拼出来（计时、`9x9`、 `correct/total`），扫描不到但一定会画；破折号、引号、间隔号这类是作者正文里的常客，漏一个就是豆腐块。 */
export const ALWAYS_INCLUDED =
  Array.from({ length: 0x7e - 0x20 + 1 }, (_, index) => String.fromCharCode(0x20 + index)).join('') +
  '　、。〃々〈〉《》「」『』【】〔〕〖〗〜·—…‰′″‹›⁄×÷°±§¶†‡•‥';

/** `collectCharacters` 的返回值：一条去重后的字符数组（按码位排序）。 */
export function collectCharacters(value, into = new Set()) {
  if (typeof value === 'string') {
    for (const char of value) into.add(char);
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCharacters(item, into);
    return into;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectCharacters(item, into);
  }
  return into;
}

/** 合成裁剪用的字符集：去重、按码位排序、带上 {@link ALWAYS_INCLUDED}。
 *  必须排序 —— 同样输入要产出同样字节，否则每次构建的字体哈希都变。 */
export function buildSubsetText(sources) {
  const chars = new Set();
  collectCharacters(ALWAYS_INCLUDED, chars);
  for (const source of sources) {
    if (source) collectCharacters(source, chars);
  }
  return Array.from(chars).sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
}

/** 产物里需要裁剪的字体文件（Vite 把 `src/assets/fonts/*.woff2` 输出成带哈希的资源）。 */
export function findFontAssets(bundle) {
  const found = [];
  for (const [fileName, output] of Object.entries(bundle)) {
    if (output?.type !== 'asset') continue;
    if (!/\.(woff2?|ttf|otf)$/i.test(fileName)) continue;
    found.push(fileName);
  }
  return found;
}

/** 产物里的 JS / CSS / JSON 全文 —— 裁剪字符集的来源之二。 不读 `src/` 下的源码：压缩之后的 chunk 才是**真正会跑在浏览器里**的那份， 界面文案、条件里拼出来的字串都在里面；读源码反而要自己判断「这个文件进不进播放器」。 */
export function collectOutputText(bundle) {
  const parts = [];
  for (const output of Object.values(bundle)) {
    if (!output) continue;
    if (output.type === 'chunk' && typeof output.code === 'string') parts.push(output.code);
    else if (output.type === 'asset' && /\.(json|css|html|js|svg|txt)$/i.test(output.fileName ?? '')) {
      const source = output.source;
      if (typeof source === 'string') parts.push(source);
      else if (source) parts.push(Buffer.from(source).toString('utf8'));
    }
  }
  return parts;
}

/** 给裁剪后的字体换带内容哈希的文件名：Vite 的哈希算的是原文件，内容已换，不换名会命中旧缓存画出豆腐块。
 *  换名后由 {@link replaceReferences} 同步 chunk 里的地址。 */
export function renamedFontFile(fileName, hash) {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return `${fileName}-${hash}`;
  return `${fileName.slice(0, dot)}-${hash}${fileName.slice(dot)}`;
}

/** 把产物里的旧字体地址换成新的，原样与 URL 编码两种写法都要换。 */
export function replaceReferences(source, from, to) {
  const encodedFrom = encodeURI(from);
  const encodedTo = encodeURI(to);
  let next = source;
  if (encodedFrom !== from) next = next.split(encodedFrom).join(encodedTo);
  return next.split(from).join(to);
}

/** 构建期插件：`generateBundle` 之后再裁一刀字体。
 *  必须排在 `bundleAssets()` 后面（同数组的先后即 generateBundle 先后），字符集要算上它 emit 的 JSON。 */
export function fontSubsetPlugin() {
  return {
    name: 'loredoku:font-subset',

    async generateBundle(_options, bundle) {
      const fontNames = findFontAssets(bundle);
      if (fontNames.length === 0) return;

      const text = buildSubsetText([collectOutputText(bundle)]);
      const { default: subsetFont } = await import('subset-font');
      const { createHash } = await import('node:crypto');

      for (const fileName of fontNames) {
        const output = bundle[fileName];
        const original = output.source;
        const bytes = Buffer.isBuffer(original) ? original : Buffer.from(original);
        const subset = await subsetFont(bytes, text, { targetFormat: 'woff2' });
        const hash = createHash('sha256').update(subset).digest('hex').slice(0, 8);
        const nextName = renamedFontFile(fileName, hash);

        // 整体替换掉旧条目，再按新名字放回去 —— 让 rollup 认为这是一份新资源。
        delete bundle[fileName];
        bundle[nextName] = { ...output, fileName: nextName, source: subset };

        for (const item of Object.values(bundle)) {
          if (item.type === 'chunk' && typeof item.code === 'string') {
            item.code = replaceReferences(item.code, fileName, nextName);
          } else if (item.type === 'asset' && typeof item.source === 'string') {
            item.source = replaceReferences(item.source, fileName, nextName);
          }
        }

        const percent = Math.round((subset.length / bytes.length) * 100);
        this.info(
          `字体裁剪：${fileName} ${Math.round(bytes.length / 1024)} KB → ${nextName} ${Math.round(subset.length / 1024)} KB（${percent}%，${text.length} 个字）`,
        );
      }
    },
  };
}
