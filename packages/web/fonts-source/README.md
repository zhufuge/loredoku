# 字体源文件

放 `.ttf` / `.otf`，**不进 git**（几十 MB 的二进制，进仓库会把 clone 拖垮）。

```bash
cp ~/Downloads/LXGWWenKai-Regular.ttf packages/web/fonts-source/
npm run fonts --workspace @loredoku/web    # 裁字 + 转 woff2
npm run build
```

产物落在 `src/assets/fonts/`，那份才进 git、才被打包。命名约定、字集档位、
体积对比见 `src/assets/fonts/README.md`，设计取舍见 `docs/v0.7.4.md` §2。
