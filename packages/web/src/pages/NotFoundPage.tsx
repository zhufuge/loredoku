import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { workshopPath } from '@/lib/workspace';

export function NotFoundPage(): JSX.Element {
  return (
    // v0.7.8 §10：`min-h-[60vh]` 与路由的加载占位同档 —— 404 落在视口中部，
    // 而不是写死 `py-24` 挂在页面顶端下面一截。
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      {/* v0.7.9 §4：`text-3xl`（30px）是全站唯一一处 30px —— 梯级里没有这一档。
          收到 24px 并交给文楷：404 不需要喊，只需要不像报错。 */}
      <h1 className="font-kai text-2xl leading-tight tracking-tight">404</h1>
      <p className="text-sm text-muted-foreground">页面不存在。</p>
      <Button asChild>
        {/*
         * v0.8.2：回**概览**，不是地图列表。
         *
         * 工作空间有自己的首页（`/:code/overview`，v0.8.0 §18），404 该把人送回
         * 屋子的门口，而不是某一间房 —— 何况「地图列表」这个名字在导航里已经
         * 不叫这个了。
         */}
        <Link to={workshopPath('overview')}>回到概览</Link>
      </Button>
    </section>
  );
}
