import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

/**
 * v0.7.8 §10：五个工坊页共用一个页头模板。这里守住三件事 ——
 * 标题必须是 `h1`（页面只有一个一级标题）、副标题单独一句、主操作不传就不占位。
 */
describe('PageHeader (v0.7.8 §10)', () => {
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

  function render(node: JSX.Element): void {
    act(() => root.render(node));
  }

  it('标题是 h1，副标题是一句说明', () => {
    render(<PageHeader title="资源" description="维护背景 / 物品图案与外观形态。" />);
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toBe('资源');
    expect(container.textContent).toContain('维护背景 / 物品图案与外观形态。');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('主操作渲染在页头右侧的独立容器里', () => {
    render(
      <PageHeader title="地图" description="创建、管理并编辑你的地图。" actions={<button>新建地图</button>} />,
    );
    const button = container.querySelector('button');
    expect(button?.textContent).toBe('新建地图');
    // 按钮不是标题块的子节点 —— 它和标题块是兄弟，标题换行不会推着按钮跑。
    expect(button?.closest('h1')).toBeNull();
    expect(container.firstElementChild?.children).toHaveLength(2);
  });

  it('没有主操作时不渲染空的右侧容器', () => {
    render(<PageHeader title="部署" description="共 0 个游戏在线。" />);
    expect(container.firstElementChild?.children).toHaveLength(1);
  });
});
