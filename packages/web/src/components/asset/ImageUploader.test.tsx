import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImageUploader } from './ImageUploader';

/**
 * v0.7.6：角色侧不再存原图尺寸 / 体积（三列已删，docs/v0.7.6.md），所以
 * 「1024 × 768 · 123 KB」那行必须**有数才显示**——没数时不能渲染成「? × ?」。
 * 资源形态侧仍然传这三个值，那里的显示不能退化。
 */

describe('ImageUploader — 原图信息行（v0.7.6）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(props: {
    imageUrl: string | null;
    width?: number | null;
    height?: number | null;
    size?: number | null;
  }): void {
    act(() => {
      root.render(
        <ImageUploader
          imageUrl={props.imageUrl}
          width={props.width}
          height={props.height}
          size={props.size}
          uploading={false}
          deleting={false}
          onUpload={() => undefined}
          onDelete={() => undefined}
        />,
      );
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('有尺寸和体积时照旧显示「宽 × 高 · KB」', () => {
    render({ imageUrl: '/a.webp', width: 1024, height: 768, size: 125952 });
    expect(container.textContent).toContain('1024 × 768 · 123 KB');
  });

  it('只有图片、没有原图元数据时退回「已上传」，不出现问号占位', () => {
    render({ imageUrl: '/a.webp' });
    expect(container.textContent).toContain('已上传');
    expect(container.textContent).not.toContain('×');
    expect(container.textContent).not.toContain('?');
  });

  it('没有图片时仍是「尚未上传图片。」', () => {
    render({ imageUrl: null });
    expect(container.textContent).toContain('尚未上传图片。');
  });
});
