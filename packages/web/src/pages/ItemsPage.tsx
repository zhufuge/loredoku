import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { ITEM_CATEGORIES, ITEM_CATEGORY_LABELS, type Item, type ItemCategory } from '@murdoku/shared';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ItemDetailForm } from '@/components/item/ItemDetailForm';
import { ItemListPanel } from '@/components/item/ItemListPanel';
import { CreateItemDialog } from '@/components/item/CreateItemDialog';
import { useDeleteItem, useItemUsages, useItems } from '@/hooks/useItems';

type StatusFilter = 'all' | 'active' | 'inactive';
type CategoryFilter = 'all' | ItemCategory;

export function ItemsPage(): JSX.Element {
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setKeyword(keywordInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [keywordInput]);

  const params = useMemo(
    () => ({
      keyword: keyword || undefined,
      isActive: status === 'all' ? undefined : status === 'active',
      category: category === 'all' ? undefined : category,
    }),
    [keyword, status, category],
  );

  const { data: items, isLoading, isError, error, refetch } = useItems(params);
  const { data: usages } = useItemUsages(deleteTarget?.id ?? null);
  const deleteMutation = useDeleteItem();
  const deleting = deleteMutation.isPending;

  useEffect(() => {
    document.title = '物品 · Murdoku Maker';
  }, []);

  useEffect(() => {
    if (items && items.length > 0 && !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]!.id);
    }
  }, [items, selectedId]);

  const selectedItem = items?.find((item) => item.id === selectedId) ?? null;

  const runDelete = (options: { hard: boolean; clearReferences: boolean }): void => {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { id: deleteTarget.id, ...options },
      { onSuccess: () => setDeleteTarget(null) },
    );
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
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : '加载失败'}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            重试
          </Button>
        </Card>
      );
    }

    if (!items || items.length === 0) {
      return (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {keyword ? '没有匹配的物品' : '还没有物品，先创建一个吧'}
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建物品
          </Button>
        </Card>
      );
    }

    return <ItemListPanel items={items} selectedId={selectedId} onSelect={setSelectedId} />;
  }

  return (
    <section className="space-y-5">
      <div>
          <h1 className="text-2xl font-semibold">物品</h1>
        <p className="text-sm text-muted-foreground">维护背景 / 物体图案、占格尺寸与触发信息。</p>
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
          <div className="grid grid-cols-2 gap-2">
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as CategoryFilter)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">全部分类</option>
              {ITEM_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {ITEM_CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">全部状态</option>
              <option value="active">仅启用</option>
              <option value="inactive">仅停用</option>
            </select>
          </div>
          {renderList()}
        </div>

        <Card className="p-6">
          {selectedItem ? (
            <ItemDetailForm item={selectedItem} onRequestDelete={setDeleteTarget} />
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center text-sm text-muted-foreground">
              选择左侧物品进行编辑
            </div>
          )}
        </Card>
      </div>

      <CreateItemDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setSelectedId} />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            if (deleting) event.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>彻底删除物品「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {usages && usages.length > 0
                ? `该物品正被 ${usages.length} 个项目使用（${usages
                    .map((usage) => usage.projectName)
                    .join('、')}）。删除将从数据库移除该物品，并清除草稿中的引用。`
                : '删除后记录将从数据库中移除，且无法恢复。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            {usages && usages.length > 0 ? (
              <Button
                variant="outline"
                disabled={deleting}
                onClick={() => runDelete({ hard: false, clearReferences: false })}
              >
                仅停用
              </Button>
            ) : null}
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() =>
                runDelete({ hard: true, clearReferences: Boolean(usages && usages.length > 0) })
              }
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  删除中…
                </>
              ) : (
                '删除'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
