import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Card } from '@murdoku/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card as CardBox } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CardDetailForm } from '@/components/card/CardDetailForm';
import { CardListPanel } from '@/components/card/CardListPanel';
import { CreateCardDialog } from '@/components/card/CreateCardDialog';
import { useCardUsages, useCards, useDeleteCard } from '@/hooks/useCards';

type ActiveFilter = 'all' | 'active' | 'inactive';

export function CardsPage(): JSX.Element {
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<ActiveFilter>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Card | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setKeyword(keywordInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [keywordInput]);

  const params = useMemo(
    () => ({
      keyword: keyword || undefined,
      isActive: filter === 'all' ? undefined : filter === 'active',
    }),
    [keyword, filter],
  );

  const { data: cards, isLoading, isError, error, refetch } = useCards(params);
  const { data: usages } = useCardUsages(deleteTarget?.id ?? null);
  const deleteMutation = useDeleteCard();

  useEffect(() => {
    if (cards && cards.length > 0 && !cards.some((card) => card.id === selectedId)) {
      setSelectedId(cards[0]!.id);
    }
  }, [cards, selectedId]);

  const selectedCard = cards?.find((card) => card.id === selectedId) ?? null;

  const confirmDelete = (clearReferences: boolean): void => {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget.id, clearReferences });
      setDeleteTarget(null);
    }
  };

  function renderList(): JSX.Element {
    if (isLoading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      );
    }

    if (isError) {
      return (
        <CardBox className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : '加载失败'}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            重试
          </Button>
        </CardBox>
      );
    }

    if (!cards || cards.length === 0) {
      return (
        <CardBox className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {keyword ? '没有匹配的卡片' : '还没有卡片，先创建一张吧'}
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建卡片
          </Button>
        </CardBox>
      );
    }

    return <CardListPanel cards={cards} selectedId={selectedId} onSelect={setSelectedId} />;
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">卡片管理</h1>
        <p className="text-sm text-muted-foreground">维护卡片图案、业务 ID 与触发信息。</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder="搜索名称 / 业务 ID"
                className="pl-9"
              />
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as ActiveFilter)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">全部状态</option>
            <option value="active">仅启用</option>
            <option value="inactive">仅停用</option>
          </select>
          {renderList()}
        </div>

        <CardBox className="p-6">
          {selectedCard ? (
            <CardDetailForm card={selectedCard} onRequestDelete={setDeleteTarget} />
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center text-sm text-muted-foreground">
              选择左侧卡片进行编辑
            </div>
          )}
        </CardBox>
      </div>

      <CreateCardDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setSelectedId} />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>停用卡片「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {usages && usages.length > 0
                ? `该卡片正被 ${usages.length} 个项目使用（${usages
                    .map((usage) => usage.projectName)
                    .join('、')}）。`
                : '该卡片尚未被任何项目使用。'}
              {' '}停用后不会出现在卡片面板中。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            {usages && usages.length > 0 ? (
              <AlertDialogAction onClick={() => confirmDelete(true)}>
                停用并清空引用
              </AlertDialogAction>
            ) : null}
            <AlertDialogAction onClick={() => confirmDelete(false)}>仅停用</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
