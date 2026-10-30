import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
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
import { PageHeader } from '@/components/layout/PageHeader';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { ScopedEmpty } from '@/components/theme/ScopedEmpty';
import { SegmentedRadio } from '@/components/ui/segmented-radio';
import { Select } from '@/components/ui/select';
import { useDeleteAsset, useAssetUsages, useAssets } from '@/hooks/useAssets';
import { LoredokuTick } from '@/components/common/LoredokuLoader';

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
  /** v0.8.0 §18：主题来自地址（`/:code/assets`），不再是一条可切换的作用域条。 */
  const workspace = useWorkspace();
  const themeCode = workspace?.themeCode ?? null;
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
      themeCode: themeCode ?? undefined,
    }),
    [keyword, status, type, themeCode],
  );

  const { data: assets, isLoading, isError, error, refetch } = useAssets(params);
  const { data: usages } = useAssetUsages(deleteTarget?.id ?? null);
  const deleteMutation = useDeleteAsset();
  const deleting = deleteMutation.isPending;

  useEffect(() => {
    document.title = workspace ? `${workspace.theme.name} · 资源 · 格物` : '资源 · 格物';
  }, [workspace?.theme.name]);

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
      // 搜索无果是另一句话：有筛选条件时不说「还没有资源」（§16.12 的第四种之外
      // 仍然保留第二种）。
      if (keyword) {
        return (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">没有匹配的资源</p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              新建资源
            </Button>
          </Card>
        );
      }
      return (
        <Card className="flex flex-col items-center p-8">
          <ScopedEmpty
            themeName={workspace?.theme.name ?? null}
            noun="资源"
            action="新建资源"
            onCreate={() => setCreateOpen(true)}
          />
        </Card>
      );
    }

    return <AssetListPanel assets={assets} selectedId={selectedId} onSelect={selectAsset} />;
  }

  return (
    <section className="space-y-6">
      {/* v0.7.8 §10：主操作从搜索行搬到页头，五个工坊页共用同一个页头模板。 */}
      <PageHeader
        title="资源"
        description="维护背景 / 物品图案与外观形态。"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建资源
          </Button>
        }
      />

      <div className="space-y-4">
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder="搜索名称 / 编码"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* FEAT-O11 (docs/v0.5.4.md §5.4): 类型 is three buttons now.
                  v0.7.8 §10：`h-10` 把分段控件抬到和右边下拉一样高 —— 一行里两种
                  高度（32 / 40）会让下边缘差 4px，扫视时看得见。 */}
              <SegmentedRadio
                ariaLabel="类型筛选"
                value={type}
                options={TYPE_FILTER_OPTIONS}
                onChange={(next) => setType(next)}
                className="h-10"
              />
              {/* v0.7.8 §3：`w-auto` 让它与分段控件并排；默认 `w-full` 会在
                  `flex-wrap` 里独占一整行，把类型按钮挤到上面去。 */}
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
                className="w-auto"
              >
                <option value="all">全部状态</option>
                <option value="active">仅启用</option>
                <option value="inactive">仅停用</option>
              </Select>
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
          defaultThemeCode={themeCode}
          onCreated={(id) => {
            setCreateOpen(false);
            setSelectedId(id);
            setSearchParams({ id: String(id) }, { replace: true });
          }}
        />
      </div>

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
                  <LoredokuTick className="mr-1" />
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
