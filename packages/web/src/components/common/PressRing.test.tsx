import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PressRing, imageTintMatrix } from './PressRing';

/**
 * v0.9.2 §2：计时环的**图模式**。
 *
 * 作者在主题页面配了图之后，那圈白弧换成上传的图 —— 但「还要按多久」这件事不能
 * 丢，所以图不是整张直接贴上去的：它被一条**扇形遮罩**顺时针揭开（遮罩里那条
 * 圆环的 `dashoffset` 走同一条 CSS 关键帧）。这里钉三件事：
 *
 * 1. 没配图时 DOM 与改动前一致（一圈白弧 + 可选的底轨，没有 `<image>`）；
 * 2. 配了图时不画白弧、也不画底轨，只留遮罩里的那条几何圆环；
 * 3. 两种模式的时长变量是同一个值 —— 环画满的那一刻，动作刚好发生。
 */
describe('PressRing', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(props: { imageUrl?: string | null; imageTintColor?: string | null }): SVGSVGElement {
    act(() => {
      root.render(
        <PressRing
          size={100}
          durationMs={340}
          seq="0,0,1"
          trackColor="rgba(15, 23, 42, 0.4)"
          {...props}
        />,
      );
    });
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('环没渲染出来');
    return svg;
  }

  it('没配图：一圈白弧，没有 <image>', () => {
    const svg = render({});
    expect(svg.querySelector('image')).toBeNull();
    // 底轨 + 进度弧。
    expect(svg.querySelectorAll('circle')).toHaveLength(2);
    const arc = svg.querySelector('circle.press-ring-arc');
    expect(arc).not.toBeNull();
    expect(arc?.getAttribute('stroke')).toBe('#FFFFFF');
    expect(arc?.getAttribute('stroke-dashoffset')).toBe(arc?.getAttribute('stroke-dasharray'));
  });

  it('配了图：画 <image>，用扇形遮罩揭开，不画白弧与底轨', () => {
    const svg = render({ imageUrl: '/api/files/themes/1/press-ring/a.webp' });

    const image = svg.querySelector('image');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('href')).toBe('/api/files/themes/1/press-ring/a.webp');
    // 铺满整格 —— 环的中心与格子中心重合，图不能缩在角落。
    expect(image?.getAttribute('width')).toBe('100');
    expect(image?.getAttribute('height')).toBe('100');

    const maskId = image?.getAttribute('mask')?.replace(/^url\(#|\)$/g, '');
    expect(maskId).toBeTruthy();
    const mask = svg.querySelector(`mask#${maskId}`);
    expect(mask).not.toBeNull();
    // 扇形：半径取半格、线宽取整格 —— 这条圆环覆盖的是一个**圆面**。
    const wedge = mask?.querySelector('circle');
    expect(wedge?.getAttribute('r')).toBe('50');
    expect(wedge?.getAttribute('stroke-width')).toBe('100');

    // 白弧与底轨都不在了：整张图就是那一圈。
    expect(svg.querySelectorAll('circle')).toHaveLength(1);
  });

  it('两种模式的时长是同一条 —— 环与定时器不能各说各话', () => {
    const arcMode = render({});
    const arc = arcMode.querySelector('circle.press-ring-arc') as SVGCircleElement;
    expect(arc.style.getPropertyValue('--press-ring-duration')).toBe('340ms');

    const imageMode = render({ imageUrl: '/ring.webp' });
    const wedge = imageMode.querySelector('mask circle') as SVGCircleElement;
    expect(wedge.style.getPropertyValue('--press-ring-duration')).toBe('340ms');
  });
});

/**
 * v0.9.3 §5：图模式下把「通过 / 未通过」的结果色**染到那张已上传的圆圈图上**。
 *
 * 用户澄清后只染图片本身（调用方有图时不再另画弧），所以这里钉的是：
 * 传色 = image 挂 filter、滤镜只换颜色不换 alpha；不传色（长按计时环）= 没有
 * 滤镜，图保持作者原色。
 */
describe('PressRing 图模式染色（v0.9.3 §7）', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(props: { imageUrl?: string | null; imageTintColor?: string | null }): SVGSVGElement {
    act(() => {
      root.render(
        <PressRing size={100} durationMs={340} seq="0,0,1" {...props} />,
      );
    });
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('环没渲染出来');
    return svg;
  }

  it('纯色染色：RGB 系数全为 0，常数项是结果色，alpha 一行原样通过', () => {
    const matrix = imageTintMatrix('#FF0000');
    expect(matrix?.split(' ')).toEqual([
      '0', '0', '0', '0', '1',
      '0', '0', '0', '0', '0',
      '0', '0', '0', '0', '0',
      '0', '0', '0', '1', '0',
    ]);
  });

  it('三个分量按 #RRGGBB 换算成 0~1 的常数，非法颜色返回 null', () => {
    const green = imageTintMatrix('#16A34A')?.split(' ') ?? [];
    expect(green).toHaveLength(20);
    expect(Number(green[4])).toBeCloseTo(22 / 255, 5);
    expect(Number(green[9])).toBeCloseTo(163 / 255, 5);
    expect(Number(green[14])).toBeCloseTo(74 / 255, 5);
    // 前三行不读原像素，第四行只搬 alpha —— 图再深也染出同一个绿。
    expect(green.slice(0, 4)).toEqual(['0', '0', '0', '0']);
    expect(green.slice(15)).toEqual(['0', '0', '0', '1', '0']);
    expect(imageTintMatrix('green')).toBeNull();
    expect(imageTintMatrix('#12345')).toBeNull();
  });

  it('传了结果色：image 挂 filter，滤镜里是那条矩阵，扇形遮罩仍在', () => {
    const svg = render({ imageUrl: '/ring.webp', imageTintColor: '#16A34A' });
    const image = svg.querySelector('image');
    const id = image?.getAttribute('filter')?.replace(/^url\(#|\)$/g, '');
    expect(id).toBeTruthy();
    const filter = svg.querySelector(`filter#${id}`);
    expect(filter?.getAttribute('color-interpolation-filters')).toBe('sRGB');
    expect(filter?.querySelector('feColorMatrix')?.getAttribute('values')).toBe(
      imageTintMatrix('#16A34A'),
    );
    expect(image?.getAttribute('mask')).toMatch(/^url\(#/);
  });

  it('不传结果色（长按环）：没有 filter 元素，图保持作者的原色', () => {
    const svg = render({ imageUrl: '/ring.webp' });
    expect(svg.querySelector('filter')).toBeNull();
    expect(svg.querySelector('image')?.hasAttribute('filter')).toBe(false);
  });

  it('没配图时就算给颜色也不挂滤镜', () => {
    const svg = render({ imageTintColor: '#DC2626' });
    expect(svg.querySelector('image')).toBeNull();
    expect(svg.querySelector('filter')).toBeNull();
  });
});
