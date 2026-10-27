import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
          hover: 'hsl(var(--secondary-hover))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          hover: 'hsl(var(--destructive-hover))',
        },
        /*
         * v0.7.8：状态色。工坊里「已启用 / 已发布 / 未保存」这些状态原来全是
         * `bg-secondary` 中性灰，或者散在组件里的 `amber-100` / `emerald-600`
         * 定色。收成两个 token：文字用 `text-success`，徽标底用 `bg-success/12`。
         * 只表达状态，不做装饰。
         */
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        /*
         * v0.7.8 §1：工具栏图标按钮的底色。只有这三个值支持 `/透明度`
         * （`<alpha-value>`），因为「未选中只是悬停」需要 `bg-toolbar/70`；
         * 其余老 token 保持原样，不动。
         */
        toolbar: {
          DEFAULT: 'hsl(var(--toolbar) / <alpha-value>)',
          foreground: 'hsl(var(--toolbar-foreground))',
          hover: 'hsl(var(--toolbar-hover) / <alpha-value>)',
        },
      },
      /*
       * v0.7.10：动效 token（取值在 `index.css` 的 `--motion-*`）。
       *
       * 两个 `DEFAULT` 是这一步的关键：它们决定了**不带修饰**的
       * `transition-colors` 用什么时长与曲线。全仓 41 处写着裸 `transition-colors`，
       * 原本各自吃 Tailwind 的 150ms + `cubic-bezier(0.4, 0, 0.2, 1)`；把
       * DEFAULT 指过来之后这 41 处不改一个字就统一了 —— 而需要别的节奏的地方
       * 才显式写 `duration-base` / `duration-slow`。
       */
      transitionDuration: {
        DEFAULT: 'var(--motion-fast)',
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
        image: 'var(--motion-image)',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--motion-ease-out)',
        out: 'var(--motion-ease-out)',
        'in-out': 'var(--motion-ease-in-out)',
        in: 'var(--motion-ease-in)',
      },
      /*
       * v0.7.9 §4：字号梯级补上最小一档。
       *
       * 原来 10px 与 11px 都用方括号直接写（10px 19 处、11px 62 处），两者相差
       * 1px 却没有各自的语义 —— 谁写哪个全看当时手边是哪个。定成 `2xs = 11px`
       * 之后，徽标 / 计数 / 「格」这类附注只有一个去处；10px 全部并入 11px
       * （中文 10px 在 1x 屏上已经在糊）。
       */
      /*
       * v0.7.9 §3：两层暖色阴影，取值在 `index.css` 的 `--shadow-card` /
       * `--shadow-float`（明暗各一套）。
       *
       * 为什么写进 theme 而不是用 `shadow-[var(--shadow-card)]`：Tailwind 的
       * 任意值阴影**先判断是不是颜色**，`var(...)` 分不出来，于是被编译成
       * `--tw-shadow-color: var(--shadow-card)` —— 类存在、产物里查得到、页面上
       * 一点阴影都没有。`/12` 那次是同一个教训：静默失败。
       */
      boxShadow: {
        /* 名字避开 `card` —— 调色板里已有 `card`，`shadow-card` 会同时命中
           「阴影」和「阴影颜色」两条工具类（后者把 box-shadow 覆盖成纯色）。 */
        paper: 'var(--shadow-card)',
        lifted: 'var(--shadow-float)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      /*
       * v0.7.10：`accordion-down` / `accordion-up` 删掉了 —— 仓库里没有
       * accordion 组件，这两条是 shadcn 脚手架带进来的残留关键帧。
       *
       * `blink` / `glow` 保留：它们与 shared 的 `EFFECT_TYPES`
       * （`highlight | glow | blink | tooltip`）逐字对应，是联动效果的状态提示，
       * 与 `.impeccable.md` 原则 6 里点名的「既有状态提示」是同一件事 ——
       * 目前还没有调用点，但删掉会让那组枚举失去后半截。
       */
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        glow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        blink: 'blink 1s steps(2, start) infinite',
        glow: 'glow 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
};

export default config;
