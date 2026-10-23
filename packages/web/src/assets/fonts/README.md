# 区域标签字体

这个目录里的 `.woff2` / `.woff`，会自动出现在

- 地图编辑器 → 地图基本信息 → 区域 → **区域标签 → 字体**
- 地图编辑器 → 区域信息 → **字体**

的下拉里。**不需要改任何代码**，加文件、重新构建（dev 下 Vite 会自动重扫）即可。

## 别直接丢 `.ttf`

霞鹜文楷 Regular 的 TTF 是 **24.7 MB**。原样放进来会原封不动进 `dist/`、进 git、
进每个付费玩家的首屏。同款字体按 GB2312 一级裁字后是 **924 KB**，整款只转 woff2
不裁字是 7.7 MB —— 裁字才是数量级上的那一刀。

所以分成两个目录：

```
packages/web/
  fonts-source/                 ← 源文件，.ttf / .otf，**不进 git**（.gitignore）
    霞鹜文楷-Regular.ttf
  src/assets/fonts/             ← 产物，.woff2，进 git，被打包
    霞鹜文楷-Regular.woff2
    README.md
```

## 加一款字体

```bash
# 1. 放源文件（文件名就是字体名 + 字重，见下）
cp ~/Downloads/LXGWWenKai-Regular.ttf packages/web/fonts-source/

# 2. 裁字 + 转 woff2
npm run fonts --workspace @loredoku/web

# 3. 正常构建
npm run build
```

脚本会打印体积对比：

```
霞鹜文楷-Regular.woff2   4704 字          24.7 MB → 924 KB    3.5s
```

### 字集怎么选

| `--charset` | 字数量级 | 体积 | 用在哪 |
|---|---|---|---|
| `common`（默认） | 3755 汉字 + 符号 + ASCII | ~0.9 MB | 绝大多数情况。覆盖 GB2312 一级，日常地名 / 关卡名够用 |
| `gb2312` | 6763 汉字（含符号 7712 字） | ~1.6 MB | 有大量生僻地名的成品；再加就接近「整款字体」了 |
| `full` | 全部字形 | ~7.7 MB | 只换容器不裁字，30 秒级。除非确定要，别用 |
| `file:chars.txt` | 你给的字 | 几十 KB | 内容集合已经固定（比如一套放出后不再改的地图） |

```bash
npm run fonts --workspace @loredoku/web -- --charset gb2312
npm run fonts --workspace @loredoku/web -- --charset file:packages/web/fonts-source/chars.txt
npm run fonts --workspace @loredoku/web -- --budget 600 --strict   # 超 600 KB 就报错退出
```

**缺字怎么办**：裁掉的字不会变成豆腐块 —— 渲染时字体名后面挂着一整条系统回退链
（`"霞鹜文楷", ui-sans-serif, …, "Microsoft YaHei", sans-serif`），缺的字由下一款
字体补上，只是那一个字不是手写体。所以「裁得狠一点」的代价是局部字形不一致，
不是空白。

## 命名

```
<字族>[-<字重>][-<字形>].woff2
```

| 文件 | 下拉里显示 | 字重 |
|---|---|---|
| `WenKai-Regular.woff2` | `WenKai` | 400 |
| `WenKai-Bold.woff2` | `WenKai` | 700（与上一行合成同一款的两个字重） |
| `Noto-Serif-SC-Bold.woff2` | `Noto Serif SC` | 700 |
| `霞鹜文楷.woff2` | `霞鹜文楷` | 400 |

- **字重词**：`Thin` 100 / `ExtraLight` 200 / `Light` 300 / `Regular`·`Book`·`Normal` 400 /
  `Medium` 500 / `SemiBold` 600 / `Bold` 700 / `ExtraBold` 800 / `Black`·`Heavy` 900，
  也可以直接写 `300`–`900`。
- **字形词**：`Italic` / `Oblique`。
- 只剥**尾部**的字重 / 字形词，且至少留一段当字族 —— 自带连字符的字族（`Noto-Serif-SC`）不会被拆错；
  认不出的后缀（`-Display`）当作字族的一部分，因为猜错字重会把两款不同字体合成一款。
- 别把版本号混进字族段：`WenKai-v2-Bold.woff2` 会变成「WenKai v2」。
- 源文件名决定产物文件名，所以 `霞鹜文楷-Regular.ttf` 产出的是 `霞鹜文楷-Regular.woff2`
  —— 想让下拉显示成中文，源文件名就用中文。
- **标签固定 700 字重**（`MapRegionLabelLayer` 里写死的）。只放 Regular 时浏览器会合成
  粗体，中文手写体合成得还行；要真粗体就再放一份 `-Bold`，两个字重会合成同一款字体。

## 运行时怎么加载

- 启动时只 `document.fonts.add(new FontFace(...))` **注册**，不 `load()`：没有地图用到
  这款字体，一个字节都不下。
- 产物在 `dist/assets/` 里带 hash，服务端对 `/assets` 是 `immutable` + 一年缓存
  （`packages/server/src/app.ts`），所以这 924 KB 只在第一次用到时付一次。
- `font-display: swap`：字体没到之前先用回退链画，到了再换。

## 放之前先看两条

- **授权**：确认可商用、可 web 嵌入 / 自托管。霞鹜文楷是 OFL-1.1，允许嵌入与再分发，
  但**必须随产物保留它的授权声明** —— 把字体包里自带的 `OFL.txt` 原样放进
  `src/assets/fonts/OFL.txt`（或合并进项目的第三方声明）。仓库里目前只放了裁剪后的
  woff2，这份声明还需要补。很多「免费」中文字体只允许桌面使用，别默认都能自托管。
- **体积**：裁完仍然超过 MB 级的，说明默认字集对你太大 —— 换 `file:` 字表，或者按
  §2.6 的「按需子集」上服务端。

详细设计见 `docs/v0.7.4.md` §2。
