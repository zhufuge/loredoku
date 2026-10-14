import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  mapDraftSchema,
  type CellCoord,
  type DraftRegion,
  type EditorTool,
  type Item,
  type MapDraft,
  type PublishViolation,
  type RegionShape,
} from '@murdoku/shared';
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
import { EditorCanvas, type EditorCanvasHandle } from '@/components/editor/EditorCanvas';
import { EditorLeftPanel } from '@/components/editor/EditorLeftPanel';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { EditorBottomBar } from '@/components/editor/EditorBottomBar';
import { EditorInfoDrawer } from '@/components/editor/EditorInfoDrawer';
import { CharacterSlotColumn } from '@/components/editor/CharacterSlotColumn';
import { RegionDialog } from '@/components/editor/RegionDialog';
import { RegionSelectionBar } from '@/components/editor/RegionSelectionBar';
import { VersionHistoryDialog } from '@/components/editor/VersionHistoryDialog';
import { useCharacters } from '@/hooks/useCharacters';
import { useItems } from '@/hooks/useItems';
import { useImportMap, useProjectMap, useSaveMap, useUpdateGridSize } from '@/hooks/useMap';
import { usePublishProject } from '@/hooks/useVersions';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { clampZoom, isInBounds, zoomAtPoint, ZOOM_STEP } from '@/lib/grid';
import type { Coord } from '@/lib/region';
import { isConnected, regionAt } from '@/lib/region';
import { useEditorStore, type ConflictMode, type RegionInput } from '@/stores/editorStore';

interface RegionDialogState {
  open: boolean;
  mode: 'create' | 'edit';
  cells: Coord[];
  region: DraftRegion | null;
}

export function EditorPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const id = Number(projectId);

  const editor = useEditorStore();

  const mapQuery = useProjectMap(id);
  const itemsQuery = useItems({ isActive: true });
  const charactersQuery = useCharacters({ isActive: true });
  const saveMutation = useSaveMap();
  const resizeMutation = useUpdateGridSize();
  const importMutation = useImportMap();
  const publishMutation = usePublishProject(id);
  const leaveGuard = useUnsavedChangesGuard(editor.dirty);

  const canvasRef = useRef<EditorCanvasHandle | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const initKeyRef = useRef<number | null>(null);

  const [spaceHeld, setSpaceHeld] = useState(false);
  const [regionShape, setRegionShape] = useState<RegionShape>('rect');
  const [itemsOpen, setItemsOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [slotCharacterId, setSlotCharacterId] = useState<number | null>(null);
  const [regionDialog, setRegionDialog] = useState<RegionDialogState>({
    open: false,
    mode: 'create',
    cells: [],
    region: null,
  });
  const [deleteRegionTarget, setDeleteRegionTarget] = useState<DraftRegion | null>(null);
  const [regionError, setRegionError] = useState<string | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [violations, setViolations] = useState<PublishViolation[] | null>(null);
  const [resizeTarget, setResizeTarget] = useState<number | null>(null);

  const itemsById = useMemo(() => {
    const map = new Map<number, Item>();
    for (const item of itemsQuery.data ?? []) map.set(item.id, item);
    return map;
  }, [itemsQuery.data]);

  const charactersById = useMemo(() => {
    const map = new Map<number, NonNullable<typeof charactersQuery.data>[number]>();
    for (const character of charactersQuery.data ?? []) map.set(character.id, character);
    return map;
  }, [charactersQuery.data]);

  const pendingItem = useMemo(
    () => (editor.selectedItemId === null ? null : itemsById.get(editor.selectedItemId) ?? null),
    [editor.selectedItemId, itemsById],
  );

  useEffect(() => {
    if (editor.selection || editor.selectedRegionId || slotCharacterId !== null) setInfoOpen(true);
    else setInfoOpen(false);
  }, [editor.selection, editor.selectedRegionId, slotCharacterId]);

  useEffect(() => {
    const data = mapQuery.data;
    if (!data) return;
    const sameDraft =
      initKeyRef.current === id &&
      editor.updatedAt === data.updatedAt &&
      editor.currentVersionNo === data.project.currentVersionNo &&
      editor.status === data.project.status;
    if (sameDraft) return;
    initKeyRef.current = id;
    editor.init(id, data.draft, {
      updatedAt: data.updatedAt,
      currentVersionNo: data.project.currentVersionNo,
      status: data.project.status,
    });
  }, [mapQuery.data, id, editor]);

  const save = (): void => {
    if (saveMutation.isPending) return;
    saveMutation.mutate(
      { id, payload: { data: editor.toDraft(), updatedAt: editor.updatedAt } },
      {
        onSuccess: (data) => {
          editor.markSaved(data.updatedAt ?? new Date().toISOString());
          editor.setVersionInfo({
            currentVersionNo: data.project.currentVersionNo,
            status: data.project.status,
          });
        },
      },
    );
  };

  const setTool = (tool: EditorTool): void => {
    editor.setTool(tool);
    if (tool !== 'select') {
      editor.setSelectedItem(null);
      editor.setSelectedCharacter(null);
    }
  };

  const selectCharacter = (characterId: number, x: number, y: number): void => {
    editor.setSelection({ type: 'character', characterId, x, y });
    editor.setSelectedRegion(regionAt(editor.regions, x, y)?.id ?? null);
    editor.setSelectedCharacter(characterId);
    setSlotCharacterId(null);
  };

  const selectSlotCharacter = (characterId: number | null): void => {
    editor.setSelectedCharacter(characterId);
    if (characterId === null) {
      setSlotCharacterId(null);
      return;
    }
    const placed = editor.placedCharacters.find((item) => item.characterId === characterId);
    if (placed) {
      selectCharacter(characterId, placed.x, placed.y);
      setSlotCharacterId(null);
    } else {
      editor.setSelection(null);
      setSlotCharacterId(characterId);
    }
  };

  const removeCharacter = (x: number, y: number): void => {
    const placed = editor.placedCharacters.find((item) => item.x === x && item.y === y);
    if (!placed) return;
    const emptySlot = editor.characterSlots.findIndex((slot) => slot === null);
    if (emptySlot === -1) {
      toast.error('槽位已满，无法将角色放回槽位');
      return;
    }
    editor.setSlot(emptySlot, placed.characterId);
    editor.removeCharacterAt(x, y);
    editor.setSelection(null);
    editor.setSelectedCharacter(null);
  };

  const assignSlot = (characterId: number): void => {
    const index = editor.characterSlots.findIndex((slot) => slot === null);
    if (index === -1) {
      toast.error('队伍已满，请先移出角色');
      return;
    }
    editor.setSlot(index, characterId);
  };

  const clearSlot = (index: number): void => {
    const slot = editor.characterSlots[index];
    if (slot && slot.characterId === editor.selectedCharacterId) {
      editor.setSelectedCharacter(null);
      setSlotCharacterId(null);
    }
  };

  const submitRegion = (input: RegionInput, conflictMode: ConflictMode): void => {
    if (regionDialog.mode === 'create') {
      editor.createRegion(input, conflictMode);
      editor.clearDraftSelection();
      setTool('select');
    } else if (regionDialog.region) {
      editor.updateRegion(regionDialog.region.id, input);
    }
    setRegionDialog((state) => ({ ...state, open: false }));
  };

  const confirmResize = (): void => {
    const size = resizeTarget;
    setResizeTarget(null);
    if (size === null || size === editor.gridSize) return;
    void (async () => {
      try {
        if (editor.dirty) {
          await saveMutation.mutateAsync({
            id,
            payload: { data: editor.toDraft(), updatedAt: editor.updatedAt },
          });
        }
        const result = await resizeMutation.mutateAsync({ id, gridSize: size });
        const { background, object, regions, charactersReturnedToSlot } = result.removed;
        if (background + object + regions + charactersReturnedToSlot > 0) {
          toast.message('画布已调整', {
            description: `已移除越界内容：背景 ${background}、物体 ${object}、区域 ${regions}、角色 ${charactersReturnedToSlot}`,
          });
        }
      } catch {
        /* errors surfaced via mutation toasts */
      }
    })();
  };

  const publish = (): void => {
    if (editor.dirty || publishMutation.isPending) return;
    publishMutation.mutate(
      {},
      {
        onSuccess: (result) => {
          if (!result.ok) setViolations(result.violations ?? []);
        },
      },
    );
  };

  const exportToFile = (): void => {
    const blob = new Blob([JSON.stringify(editor.toDraft(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${mapQuery.data?.project.name ?? 'map'}-${id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void (async () => {
      try {
        const parsed: unknown = JSON.parse(await file.text());
        const result = mapDraftSchema.safeParse(parsed);
        if (!result.success) {
          toast.error('JSON 格式不正确');
          return;
        }
        importMutation.mutate({ id, data: result.data as MapDraft });
      } catch {
        toast.error('无法读取文件');
      }
    })();
  };

  function zoomBy(direction: 1 | -1): void {
    const rect = canvasRef.current?.getRect() ?? null;
    const next = clampZoom(editor.zoom + direction * ZOOM_STEP);
    if (next === editor.zoom) return;
    if (rect) {
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      editor.setPan(zoomAtPoint(center, rect, editor.pan, next, editor.zoom));
    }
    editor.setZoom(next);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (mod && event.key === '0') {
        event.preventDefault();
        canvasRef.current?.centerView();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selection = editor.selection;
        if (selection && selection.type !== 'region') {
          event.preventDefault();
          editor.eraseAt(selection.x, selection.y);
        }
        return;
      }
      if (event.key === 'Escape') {
        editor.setSelection(null);
        editor.setSelectedItem(null);
        editor.setSelectedCharacter(null);
        editor.clearDraftSelection();
        return;
      }
      if (mod) return;
      if (event.key === 'v' || event.key === 'V') setTool('select');
      else if (event.key === 'r' || event.key === 'R') setTool('region');
      else if (event.key === 'c' || event.key === 'C') setTool('character');
      else if (event.key === 'e' || event.key === 'E') setTool('eraser');
      else if (event.key === 'h' || event.key === 'H') setTool('pan');
      else if (event.key.startsWith('Arrow') && editor.selection && editor.selection.type !== 'region') {
        const step: Record<string, CellCoord> = {
          ArrowUp: { x: 0, y: -1 },
          ArrowDown: { x: 0, y: 1 },
          ArrowLeft: { x: -1, y: 0 },
          ArrowRight: { x: 1, y: 0 },
        };
        const delta = step[event.key] ?? { x: 0, y: 0 };
        const next = { x: editor.selection.x + delta.x, y: editor.selection.y + delta.y };
        if (isInBounds(next, editor.gridSize)) {
          editor.setSelection({ type: 'cell', x: next.x, y: next.y });
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  if (!Number.isFinite(id) || mapQuery.isError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">项目不存在或加载失败。</p>
        <Button variant="outline" onClick={() => navigate('/projects')}>
          返回项目列表
        </Button>
      </div>
    );
  }

  const project = mapQuery.data?.project;

  if (mapQuery.isLoading || !project) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载画布…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportFile}
      />

      <EditorToolbar
        projectName={project.name}
        gridSize={editor.gridSize}
        zoom={editor.zoom}
        dirty={editor.dirty}
        saving={saveMutation.isPending}
        canUndo={editor.past.length > 0}
        canRedo={editor.future.length > 0}
        status={editor.status}
        currentVersionNo={editor.currentVersionNo}
        onBack={() => navigate('/projects')}
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
          onResetZoom={() => canvasRef.current?.centerView()}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onSave={save}
        onPublish={publish}
        onOpenVersions={() => setVersionsOpen(true)}
        onExport={exportToFile}
        onImport={() => importInputRef.current?.click()}
        onResize={setResizeTarget}
      />

      <div className="flex min-h-0 flex-1">
        {itemsOpen ? (
          <EditorLeftPanel
          items={itemsQuery.data}
          itemsLoading={itemsQuery.isLoading}
          itemsError={itemsQuery.isError}
          characters={charactersQuery.data}
          charactersLoading={charactersQuery.isLoading}
          charactersError={charactersQuery.isError}
          activeLayer={editor.activeLayer}
          selectedItemId={editor.selectedItemId}
          characterSlots={editor.characterSlots}
          selectedCharacterId={editor.selectedCharacterId}
          regions={editor.regions}
          selectedRegionId={editor.selectedRegionId}
          onSetTool={setTool}
          onSetLayer={(layer) => {
            editor.setLayer(layer);
            editor.setSelectedItem(null);
          }}
          onSelectItem={(item) => editor.setSelectedItem(item ? item.id : null)}
          onSelectCharacter={editor.setSelectedCharacter}
          onAssignSlot={assignSlot}
          onSelectRegion={editor.setSelectedRegion}
          onEditRegion={(region) => {
            editor.setSelectedRegion(region.id);
            setRegionDialog({ open: true, mode: 'edit', cells: region.cells, region });
          }}
          onDeleteRegion={setDeleteRegionTarget}
        />
        ) : null}

        <CharacterSlotColumn
          slots={editor.characterSlots}
          charactersById={charactersById}
          selectedCharacterId={editor.selectedCharacterId}
          onSelect={selectSlotCharacter}
          onSwap={editor.swapSlots}
          onClear={clearSlot}
        />

        <main className="relative min-h-0 flex-1">
          <EditorCanvas
            ref={canvasRef}
            gridSize={editor.gridSize}
            cells={editor.cells}
            itemsById={itemsById}
            regions={editor.regions}
            placedCharacters={editor.placedCharacters}
            charactersById={charactersById}
            selectedRegionId={editor.selectedRegionId}
            zoom={editor.zoom}
            pan={editor.pan}
            selection={editor.selection}
            activeTool={editor.activeTool}
            regionShape={regionShape}
            spaceHeld={spaceHeld}
            pendingItem={pendingItem}
            pendingCharacterId={editor.selectedCharacterId}
            regionDraftSelection={editor.regionDraftSelection}
            onSelect={(selection) => {
              editor.setSelection(selection);
              setSlotCharacterId(null);
            }}
            onSelectRegion={editor.setSelectedRegion}
            onSelectCharacter={(characterId, x, y) => selectCharacter(characterId, x, y)}
            onDraftToggle={(coord) => editor.toggleDraftCell(coord.x, coord.y)}
            onDraftAdd={editor.addDraftCells}
            onDraftRemove={editor.removeDraftCells}
            onDraftClear={editor.clearDraftSelection}
            onToggleRegionCell={(coord) => {
              if (editor.selectedRegionId !== null) {
                editor.toggleRegionCell(editor.selectedRegionId, coord.x, coord.y);
              }
            }}
            onPlaceItem={(coord) => {
              if (!pendingItem) return;
              if (pendingItem.category === 'background') {
                editor.placeBackground(pendingItem.id, coord.x, coord.y);
              } else {
                editor.placeObject(
                  {
                    id: pendingItem.id,
                    widthCells: pendingItem.widthCells,
                    heightCells: pendingItem.heightCells,
                  },
                  coord.x,
                  coord.y,
                );
              }
            }}
            onPlaceCharacter={(coord) => {
              if (editor.selectedCharacterId !== null) {
                editor.placeCharacter(editor.selectedCharacterId, coord.x, coord.y);
              }
            }}
            onMoveObject={(from, to) => editor.moveObject(from.x, from.y, to.x, to.y)}
            onErase={(coord) => editor.eraseAt(coord.x, coord.y)}
            onZoom={editor.setZoom}
            onPan={editor.setPan}
          />

          {editor.activeTool === 'region' ? (
            <RegionSelectionBar
              count={editor.regionDraftSelection.size}
              onClear={editor.clearDraftSelection}
              onConfirm={() => {
                const cells = Array.from(editor.regionDraftSelection).map(
                  (key) => key.split(',').map(Number) as Coord,
                );
                if (cells.length === 0) {
                  toast.error('请先选择至少一个格子');
                  return;
                }
                if (!isConnected(cells)) {
                  setRegionError('区域必须是相连的方格，请调整选区。');
                  return;
                }
                setRegionDialog({ open: true, mode: 'create', cells, region: null });
              }}
              onCancel={() => {
                editor.clearDraftSelection();
                setTool('select');
              }}
            />
          ) : null}
          <EditorBottomBar
            activeTool={editor.activeTool}
            regionShape={regionShape}
            canUndo={editor.past.length > 0}
            canRedo={editor.future.length > 0}
            zoom={editor.zoom}
            itemsOpen={itemsOpen}
            onSetTool={(tool) => {
              setTool(tool);
              if (tool !== 'region') setRegionShape('rect');
            }}
            onSetRegionShape={setRegionShape}
            onUndo={editor.undo}
            onRedo={editor.redo}
            onZoomIn={() => zoomBy(1)}
            onZoomOut={() => zoomBy(-1)}
            onZoomReset={() => editor.setZoom(1)}
            onFit={() => canvasRef.current?.centerView()}
            onToggleItems={() => setItemsOpen((open) => !open)}
          />

          <EditorInfoDrawer
            open={infoOpen}
            onClose={() => setInfoOpen(false)}
            onOpen={() => setInfoOpen(true)}
            selection={editor.selection}
            cells={editor.cells}
            regions={editor.regions}
            placedCharacters={editor.placedCharacters}
            charactersById={charactersById}
            itemsById={itemsById}
            unplacedCharacterId={slotCharacterId}
            onSelectCharacter={selectCharacter}
            onSaveMeta={(x, y, meta) => editor.setPlacedMeta(x, y, meta)}
            onRemoveCharacter={removeCharacter}
            onClearCell={(x, y) => editor.clearCell(x, y)}
            onClearObject={(x, y) => editor.clearObjectAt(x, y)}
            onEditRegion={(region) => {
              editor.setSelectedRegion(region.id);
              setRegionDialog({ open: true, mode: 'edit', cells: region.cells, region });
            }}
            onDeleteRegion={(region) => setDeleteRegionTarget(region)}
            onLocateRegion={() => canvasRef.current?.centerView()}
          />
        </main>
      </div>

      <RegionDialog
        open={regionDialog.open}
        onOpenChange={(open) => setRegionDialog((state) => ({ ...state, open }))}
        mode={regionDialog.mode}
        cells={regionDialog.cells}
        region={regionDialog.region}
        regions={editor.regions}
        onSubmit={submitRegion}
      />

      <VersionHistoryDialog
        projectId={id}
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        currentVersionNo={editor.currentVersionNo}
      />

      <AlertDialog
        open={deleteRegionTarget !== null}
        onOpenChange={(open) => !open && setDeleteRegionTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除区域「{deleteRegionTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>区域会从草稿中移除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteRegionTarget) editor.deleteRegion(deleteRegionTarget.id);
                setDeleteRegionTarget(null);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resizeTarget !== null} onOpenChange={(open) => !open && setResizeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              调整画布为 {resizeTarget} × {resizeTarget}？
            </AlertDialogTitle>
            <AlertDialogDescription>
              超出新边界的背景、物体、区域与角色会被移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResize}>确认调整</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={violations !== null} onOpenChange={(open) => !open && setViolations(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>无法发布</AlertDialogTitle>
            <AlertDialogDescription>发布前校验未通过，请先修复以下问题：</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-64 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-muted-foreground">
            {(violations ?? []).map((violation, index) => (
              <li key={`${violation.rule}-${index}`}>{violation.message}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setViolations(null)}>关闭</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={regionError !== null} onOpenChange={(open) => !open && setRegionError(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>区域必须是相连的方格</AlertDialogTitle>
            <AlertDialogDescription>{regionError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setRegionError(null)}>我知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaveGuard.open}>
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            leaveGuard.cancelLeave();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>有未保存的修改</AlertDialogTitle>
            <AlertDialogDescription>
              离开将丢失当前修改，确定离开吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={leaveGuard.cancelLeave}>
              取消
            </Button>
            <Button variant="destructive" onClick={leaveGuard.confirmLeave}>
              离开
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
