export function CardsPage(): JSX.Element {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">卡片管理</h1>
        <p className="text-sm text-muted-foreground">维护卡片图案、业务 ID 与触发信息。</p>
      </div>
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        卡片管理将在 M3 阶段接入。
      </div>
    </section>
  );
}
