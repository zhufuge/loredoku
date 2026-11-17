/**
 * v0.11.3（docs/v0.11.3.md §1）—— 播客字体按「这一包真正用到的字」裁剪。
 *
 * 起因：`src/assets/fonts/霞鹜文楷-Regular.woff2` 是整份 GB2312 一级字表（952 KB），
 * 而一个主题包实际用到的汉字只有几百个 —— 主题名、关卡名、线索、结语、区域名，
 * 再加上界面自己的那几十句文案。整份打进产物，玩家要为一个用不到的字表付 900 KB
 * 的流量。
 *
 * 做法放在**构建期**而不是运行时：`subset-font` 是 Node 侧的依赖（`devDependencies`），
 * 浏览器里没有它；而「用到了哪些字」在构建那一拍已经全部可见 ——
 *  ① 包里的 JSON（主题、关卡、资源、角色）逐字段扫一遍；
 *  ② 产物里的 JS chunk（界面的那些中文文案，压缩后仍是字符串字面量）。
 * 两者合起来就是这一份产物可能画出来的全部字符，多收几个不会错，少收一个就会
 * 变成豆腐块 —— 所以另外无条件带上 ASCII 与常用标点（见 {@link ALWAYS_INCLUDED}）。
 *
 * 与 `scripts/build-fonts.mjs` 的分工：那个是**作者侧**的一次性裁剪（把 25 MB 的
 * TTF 按 GB2312 切成 952 KB 的 woff2，进 `src/assets/fonts/`）；这里是**每份产物**
 * 的再裁剪（把 952 KB 按实际用到的字切成几十 KB，进 `dist-player/`）。两层都不改
 * 源文件。
 */

/**
 * 无条件保留的字符：ASCII 可打印区 + 中文排版常用的那几个符号。
 *
 * 为什么不能只靠「扫描到的字」：数字、拉丁字母会在运行时拼出来（计时、`9x9`、
 * `correct/total`），扫描不到但一定会画；破折号、引号、间隔号这类是作者正文里的
 * 常客，漏一个就是豆腐块。
 */
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

/**
 * 把若干段文本合成一份裁剪用的字符集：去重、按码位排序、带上 {@link ALWAYS_INCLUDED}。
 *
 * 排序不是为了好看 —— 同样的输入必须产出同样的字节，否则每次构建的字体哈希都变，
 * 发布出去就是「一个字节没改也整包重传」。
 */
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

/**
 * 产物里的 JS / CSS / JSON 全文 —— 裁剪字符集的来源之二。
 *
 * 不读 `src/` 下的源码：压缩之后的 chunk 才是**真正会跑在浏览器里**的那份，
 * 界面文案、条件里拼出来的字串都在里面；读源码反而要自己判断「这个文件进不进
 * 播放器」。
 */
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

/**
 * 裁剪后的字体换个带内容哈希的文件名。
 *
 * 为什么必须换名：Vite 给资源起的哈希是**原文件**的，而这里替换掉了文件内容 ——
 * 名字不变就成了「同名不同内容」，浏览器会拿缓存里那份旧字表继续画，新主题里
 * 多出来的字就是豆腐块。换名之后，引用它的 chunk 里那个地址也跟着换（见
 * {@link replaceReferences}），旧缓存最多是引用一个已经不存在的字体 ——
 * `font-family` 那串栈里还有楷体兜着，是「换个字体」而不是「画出方块」。
 */
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

/**
 * 构建期插件：`generateBundle` 之后再裁一刀字体。
 *
 * 位置讲究 —— 必须排在 `bundleAssets()` **后面**（同一个 `plugins` 数组里的先后
 * 就是 `generateBundle` 的先后），因为字符集要算上包里的 JSON（主题名、关卡名、
 * 线索、结语），而那是 `bundleAssets` 在 `generateBundle` 里 `emitFile` 进来的。
 *
 * 用 `renderStart`/`load` 都不可行：字符集依赖「压缩后的 chunk 全文」，只有
 * `generateBundle` 这一拍才真的齐。
 */
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
