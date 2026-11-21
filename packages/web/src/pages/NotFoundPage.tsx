import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { workshopPath } from '@/lib/workspace';

export function NotFoundPage(): JSX.Element {
  return (
    // v0.7.8 §10：`min-h-[60vh]` 与路由的加载占位同档 —— 404 落在视口中部，
    // 而不是写死 `py-24` 挂在页面顶端下面一截。
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      {/* 404 不需要喊，只需要不像报错：收到 24px 并交给文楷。 */}
      <h1 className="font-kai text-2xl leading-tight tracking-tight">404</h1>
      <p className="text-sm text-muted-foreground">页面不存在。</p>
      <Button asChild>
        {/* 404 回工作空间概览（/:code/overview），不回地图列表：送回屋子门口，而不是某一间房。 */}
        <Link to={workshopPath('overview')}>回到概览</Link>
      </Button>
    </section>
  );
}
