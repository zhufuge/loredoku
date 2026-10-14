import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  private readonly handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">页面出错了</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {error.message || '发生了未知错误，请重试。'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={this.handleReset}>
            重试
          </Button>
          <Button onClick={() => window.location.assign('/')}>返回首页</Button>
        </div>
      </div>
    );
  }
}
