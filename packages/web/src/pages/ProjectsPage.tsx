export function ProjectsPage(): JSX.Element {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">地图项目</h1>
          <p className="text-sm text-muted-foreground">创建、管理并编辑你的地图。</p>
        </div>
      </div>
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        项目列表将在 M2 阶段接入。
      </div>
    </section>
  );
}
