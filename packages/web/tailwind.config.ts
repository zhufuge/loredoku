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
        /* 状态色。工坊里「已启用 / 已发布 / 未保存」这些状态要一眼可辨，所以有自己的 token：文字用 `text-success`，徽标底用 `bg-success/12` —— 不借用中性灰， 也不散成组件里的 `amber-100` / `emerald-600` 定色。只表达状态，不做装饰。 */
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
        /* v0.7.8 §1：工具栏图标按钮的底色。只有这三个值支持 `/透明度` （`<alpha-value>`），因为「未选中只是悬停」需要 `bg-toolbar/70`； 其余老 token 保持原样，不动。 */
        toolbar: {
          DEFAULT: 'hsl(var(--toolbar) / <alpha-value>)',
          foreground: 'hsl(var(--toolbar-foreground))',
          hover: 'hsl(var(--toolbar-hover) / <alpha-value>)',
        },
      },
      /* 动效 token（取值在 index.css 的 --motion-*）：两个 DEFAULT 决定裸 transition-colors 的时长/曲线，
         要别的节奏才显式写 duration-base / duration-slow。 */
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
      /* v0.7.9 §4：字号梯级的最小一档。 `2xs = 11px`：徽标 / 计数 / 「格」这类附注只有一个去处 —— 10px 与 11px 只差 1px 却没有各自的语义（谁写哪个全看当时手边是哪个），而中文 10px 在 1x 屏上已经在糊。 */
      /* v0.7.9 §3：两层暖色阴影（--shadow-card / --shadow-float，明暗各一套）。
         必须写进 theme —— Tailwind 对 shadow-[var(...)] 会当颜色解析，类在但页面上没阴影（/12 同理静默失败）。 */
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
      /* 本仓无 accordion，不提供 accordion-down/up；blink/glow 保留 —— 与 shared EFFECT_TYPES 逐字对应，删掉枚举后半截就没了。 */
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
