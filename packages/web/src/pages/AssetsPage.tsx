import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus, Search } from 'lucide-react';
import { ASSET_TYPES, ASSET_TYPE_LABELS, type Asset, type AssetType } from '@loredoku/shared';
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
import { AssetDetailForm } from '@/components/asset/AssetDetailForm';
import { AssetListPanel } from '@/components/asset/AssetListPanel';
import { CreateAssetDialog } from '@/components/asset/CreateAssetDialog';
import { SegmentedRadio } from '@/components/ui/segmented-radio';
import { useDeleteAsset, useAssetUsages, useAssets } from '@/hooks/useAssets';

type StatusFilter = 'all' | 'active' | 'inactive';
type TypeFilter = 'all' | AssetType;

/** FEAT-O11: 全部类型 / 背景 / 物品 as one radio row. */
const TYPE_FILTER_OPTIONS: ReadonlyArray<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: '全部类型' },
  ...ASSET_TYPES.map((value) => ({ value, label: ASSET_TYPE_LABELS[value] })),
];

export function AssetsPage(): JSX.Element {
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get('id');
  const [selectedId, setSelectedId] = useState<number | null>(initialId ? Number(initialId) : null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setKeyword(keywordInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [keywordInput]);

  const params = useMemo(
    () => ({
      keyword: keyword || undefined,
      isActive: status === 'all' ? undefined : status === 'active',
      type: type === 'all' ? undefined : type,
    }),
    [keyword, status, type],
  );

  const { data: assets, isLoading, isError, error, refetch } = useAssets(params);
  const { data: usages } = useAssetUsages(deleteTarget?.id ?? null);
  const deleteMutation = useDeleteAsset();
  const deleting = deleteMutation.isPending;

  useEffect(() => {
    document.title = '资源 · 格物';
  }, []);

  useEffect(() => {
    if (assets && assets.length > 0) {
      const idParam = searchParams.get('id');
      if (idParam) {
        const id = Number(idParam);
        if (assets.some((asset) => asset.id === id)) {
          if (selectedId !== id) setSelectedId(id);
          return;
        }
      }
      if (!assets.some((asset) => asset.id === selectedId)) {
        setSelectedId(assets[0]!.id);
      }
    }
  }, [assets, searchParams, selectedId]);

  const selectedAsset = assets?.find((asset) => asset.id === selectedId) ?? null;

  const selectAsset = (id: number): void => {
    setSelectedId(id);
    setSearchParams({ id: String(id) }, { replace: true });
  };

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

    if (!assets || assets.length === 0) {
      return (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {keyword ? '没有匹配的资源' : '还没有资源，先创建一个吧'}
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建资源
          </Button>
        </Card>
      );
    }

    return <AssetListPanel assets={assets} selectedId={selectedId} onSelect={selectAsset} />;
  }

  return (
    <section className="space-y-5">
      <div>
          <h1 className="text-2xl font-semibold">资源</h1>
        <p className="text-sm text-muted-foreground">维护背景 / 物品图案、占格尺寸与触发信息。</p>
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
          <div className="flex flex-wrap items-center gap-2">
            {/* FEAT-O11 (docs/v0.5.4.md §5.4): 类型 is three buttons now. */}
            <SegmentedRadio
              ariaLabel="类型筛选"
              value={type}
              options={TYPE_FILTER_OPTIONS}
              onChange={(next) => setType(next)}
            />
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
          {selectedAsset ? (
            <AssetDetailForm asset={selectedAsset} onRequestDelete={setDeleteTarget} />
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center text-sm text-muted-foreground">
              选择左侧资源进行编辑
            </div>
          )}
        </Card>
      </div>

      <CreateAssetDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false);
          setSelectedId(id);
          setSearchParams({ id: String(id) }, { replace: true });
        }}
      />

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
            <AlertDialogTitle>彻底删除资源「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {usages && usages.length > 0
                ? `该资源正被 ${usages.length} 张地图使用（${usages
                    .map((usage) => usage.mapName)
                    .join('、')}）。删除将从数据库移除该资源，并清除草稿中的引用。`
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
