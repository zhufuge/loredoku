import { useParams } from 'react-router-dom';

export function EditorPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="font-semibold">编辑器 · 项目 #{projectId}</div>
        <div className="text-sm text-muted-foreground">M4 阶段接入画布</div>
      </header>
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        画布与拖拽功能将在 M4 阶段实现。
      </div>
    </div>
  );
}
