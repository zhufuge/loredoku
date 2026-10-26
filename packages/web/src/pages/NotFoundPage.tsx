import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage(): JSX.Element {
  return (
    // v0.7.8 §10：`min-h-[60vh]` 与路由的加载占位同档 —— 404 落在视口中部，
    // 而不是写死 `py-24` 挂在页面顶端下面一截。
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-sm text-muted-foreground">页面不存在。</p>
      <Button asChild>
        <Link to="/maps">返回地图列表</Link>
      </Button>
    </section>
  );
}
