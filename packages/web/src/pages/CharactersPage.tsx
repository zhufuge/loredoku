import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus, Search } from 'lucide-react';
import type { Character } from '@loredoku/shared';
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
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { CharacterDetailForm } from '@/components/character/CharacterDetailForm';
import { CharacterListPanel } from '@/components/character/CharacterListPanel';
import { CreateCharacterDialog } from '@/components/character/CreateCharacterDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { useCharacterUsages, useCharacters, useDeleteCharacter } from '@/hooks/useCharacters';

type StatusFilter = 'all' | 'active' | 'inactive';

export function CharactersPage(): JSX.Element {
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get('id');
  const [selectedId, setSelectedId] = useState<number | null>(initialId ? Number(initialId) : null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setKeyword(keywordInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [keywordInput]);

  const params = useMemo(
    () => ({
      keyword: keyword || undefined,
      isActive: status === 'all' ? undefined : status === 'active',
    }),
    [keyword, status],
  );

  const { data: characters, isLoading, isError, error, refetch } = useCharacters(params);
  const { data: usages } = useCharacterUsages(deleteTarget?.id ?? null);
  const deleteMutation = useDeleteCharacter();
  const deleting = deleteMutation.isPending;

  useEffect(() => {
    document.title = '角色 · 格物';
  }, []);

  useEffect(() => {
    if (characters && characters.length > 0) {
      const idParam = searchParams.get('id');
      if (idParam) {
        const id = Number(idParam);
        if (characters.some((character) => character.id === id)) {
          if (selectedId !== id) setSelectedId(id);
          return;
        }
      }
      if (!characters.some((character) => character.id === selectedId)) {
        setSelectedId(characters[0]!.id);
      }
    }
  }, [characters, searchParams, selectedId]);

  const selectedCharacter = characters?.find((character) => character.id === selectedId) ?? null;

  const selectCharacter = (id: number): void => {
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

    if (!characters || characters.length === 0) {
      return (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {keyword ? '没有匹配的角色' : '还没有角色，先创建一个吧'}
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建角色
          </Button>
        </Card>
      );
    }

    return (
      <CharacterListPanel
        characters={characters}
        selectedId={selectedId}
        onSelect={selectCharacter}
      />
    );
  }

  return (
    <section className="space-y-6">
      {/* v0.7.8 §10：与资源页同一套页头 —— 主操作在右，搜索行只留搜索。 */}
      <PageHeader
        title="角色"
        description="维护角色头像与描述，供谜题安排参与者使用。"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建角色
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              placeholder="搜索名称 / 业务 ID"
              className="pl-9"
            />
          </div>
          {/* v0.7.8 §10：`w-auto` —— 与资源页的筛选行同一个处理：下拉按内容收窄，
              在 340px 窄栏里读成一个筛选芯片，而不是一条横贯整栏的空框。 */}
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="w-auto"
          >
            <option value="all">全部状态</option>
            <option value="active">仅启用</option>
            <option value="inactive">仅停用</option>
          </Select>
          {renderList()}
        </div>

        <Card className="p-6">
          {selectedCharacter ? (
            <CharacterDetailForm
              character={selectedCharacter}
              onRequestDelete={setDeleteTarget}
            />
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center text-sm text-muted-foreground">
              选择左侧角色进行编辑
            </div>
          )}
        </Card>
      </div>

      <CreateCharacterDialog
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
            <AlertDialogTitle>彻底删除角色「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {usages && usages.length > 0
                ? `该角色正被 ${usages.length} 张地图使用（${usages
                    .map((usage) => usage.mapName)
                    .join('、')}）。删除将从数据库移除该角色，并从草稿中移除其放置与槽位。`
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
