import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EditorCanvas, type CharacterDragPreview, type EditorCanvasHandle } from '@/components/editor/EditorCanvas';
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
import { useProjectMap, useSaveMap, useUpdateGridSize } from '@/hooks/useMap';
import { usePublishProject } from '@/hooks/useVersions';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { clampZoom, isInBounds, zoomAtPoint, ZOOM_STEP } from '@/lib/grid';
import { DROP_REJECTION_MESSAGES, validateCharacterDrop } from '@/lib/characterDrop';
import type { Coord } from '@/lib/region';
import { isConnected, regionAt } from '@/lib/region';
import { cn } from '@/lib/utils';
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
  const [regionAnchorActive, setRegionAnchorActive] = useState(false);
  const [saveMaskVisible, setSaveMaskVisible] = useState(false);
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
  const [resizeOpen, setResizeOpen] = useState(false);
  const [resizeValue, setResizeValue] = useState(editor.gridSize);
  const [pendingImport, setPendingImport] = useState<MapDraft | null>(null);
  const [rulerVisible, setRulerVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('murdoku.editor.ruler') !== 'hidden';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('murdoku.editor.ruler', rulerVisible ? 'visible' : 'hidden');
    }
  }, [rulerVisible]);

  useEffect(() => {
    if (resizeOpen) setResizeValue(editor.gridSize);
  }, [resizeOpen, editor.gridSize]);

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
    const returned = editor.returnCharacterToSlot(placed.characterId);
    if (!returned) {
      toast.error('无可用槽位，请先清理槽位');
      return;
    }
    toast.success('已移除角色');
    editor.setSelection(null);
    editor.setSelectedCharacter(placed.characterId);
    setSlotCharacterId(placed.characterId);
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
    if (!slot) return;
    editor.clearCharacterSlot(index);
    if (slot.characterId === editor.selectedCharacterId) {
      editor.setSelectedCharacter(null);
      setSlotCharacterId(null);
    }
  };

  // ---- Roster → canvas pointer drag (docs/v0.2.5.md BUG-403) ----
  const [characterDrag, setCharacterDrag] = useState<CharacterDragPreview | null>(null);
  const characterDragRef = useRef<CharacterDragPreview | null>(null);
  characterDragRef.current = characterDrag;

  const resolveDropCell = (pointer: { x: number; y: number }): CellCoord | null => {
    const handle = canvasRef.current;
    if (!handle) return null;
    const cell = handle.clientToCell(pointer.x, pointer.y);
    return isInBounds(cell, editor.gridSize) ? cell : null;
  };

  const checkDrop = (
    characterId: number,
    cell: CellCoord | null,
  ): { cell: CellCoord | null; valid: boolean } => {
    if (!cell) return { cell: null, valid: false };
    const result = validateCharacterDrop({
      cell,
      gridSize: editor.gridSize,
      cells: editor.cells,
      placedCharacters: editor.placedCharacters,
      characterId,
      itemsById,
    });
    return { cell, valid: result.ok };
  };

  const beginCharacterDrag = (payload: {
    characterId: number;
    sourceSlotIndex: number;
    pointer: { x: number; y: number };
  }): void => {
    setCharacterDrag({
      characterId: payload.characterId,
      sourceSlotIndex: payload.sourceSlotIndex,
      pointer: payload.pointer,
      target: null,
      valid: false,
    });
  };

  const moveCharacterDrag = (pointer: { x: number; y: number }): void => {
    const drag = characterDragRef.current;
    if (!drag) return;
    const { cell, valid } = checkDrop(drag.characterId, resolveDropCell(pointer));
    setCharacterDrag({ ...drag, pointer, target: cell, valid });
  };

  const cancelCharacterDrag = (): void => setCharacterDrag(null);

  const endCharacterDrag = (pointer: { x: number; y: number }): void => {
    const drag = characterDragRef.current;
    if (!drag) return;
    setCharacterDrag(null);

    // Dropping onto another roster slot reorders the roster.
    const slotNode = document
      .elementFromPoint(pointer.x, pointer.y)
      ?.closest('[data-slot-index]');
    if (slotNode) {
      const targetIndex = Number(slotNode.getAttribute('data-slot-index'));
      if (Number.isInteger(targetIndex) && targetIndex !== drag.sourceSlotIndex) {
        editor.swapSlots(drag.sourceSlotIndex, targetIndex);
      }
      return;
    }

    const cell = resolveDropCell(pointer);
    if (!cell) {
      toast.error(DROP_REJECTION_MESSAGES['out-of-bounds']);
      return;
    }
    const result = validateCharacterDrop({
      cell,
      gridSize: editor.gridSize,
      cells: editor.cells,
      placedCharacters: editor.placedCharacters,
      characterId: drag.characterId,
      itemsById,
    });
    if (!result.ok) {
      toast.error(DROP_REJECTION_MESSAGES[result.reason]);
      return;
    }
    editor.placeCharacter(drag.characterId, cell.x, cell.y, drag.sourceSlotIndex);
    toast.success('已放置角色');
  };

  useEffect(() => {
    if (!characterDrag) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancelCharacterDrag();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [characterDrag]);

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
    const size = resizeValue;
    if (size === editor.gridSize) {
      setResizeOpen(false);
      return;
    }
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
        } else {
          toast.success('画布已调整');
        }
        setResizeOpen(false);
      } catch {
        /* errors surfaced via mutation toasts; keep dialog open */
      }
    })();
  };

  const resizePending = saveMutation.isPending || resizeMutation.isPending;

  const resizeImpact = useMemo(() => {
    if (!resizeOpen) {
      return { items: [] as string[], regions: [] as string[], characters: [] as string[] };
    }
    const size = resizeValue;
    const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < size && y < size;
    const items: string[] = [];
    const seenObjects = new Set<string>();
    for (const [key, cell] of editor.cells.entries()) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      if (cell.background && !inBounds(x, y)) {
        const item = itemsById.get(cell.background.itemId);
        items.push(`物品「${item?.name ?? `#${cell.background.itemId}`}」位于 C${x + 1},R${y + 1}`);
      }
      if (
        cell.object &&
        !(inBounds(x, y) && x + cell.object.w <= size && y + cell.object.h <= size)
      ) {
        if (!seenObjects.has(key)) {
          seenObjects.add(key);
          const item = itemsById.get(cell.object.itemId);
          items.push(
            `物品「${item?.name ?? `#${cell.object.itemId}`}」(${cell.object.w}×${cell.object.h}) 位于 C${x + 1},R${y + 1}`,
          );
        }
      }
    }
    const regions: string[] = [];
    for (const region of editor.regions) {
      const count = region.cells.filter(([x, y]) => !inBounds(x, y)).length;
      if (count > 0) regions.push(`区域「${region.name}」部分格子越界（${count} 格）`);
    }
    const characters: string[] = [];
    for (const placed of editor.placedCharacters) {
      if (!inBounds(placed.x, placed.y)) {
        const character = charactersById.get(placed.characterId);
        characters.push(`角色「${character?.name ?? `#${placed.characterId}`}」将被撤回槽位`);
      }
    }
    return { items, regions, characters };
  }, [
    resizeOpen,
    resizeValue,
    editor.cells,
    editor.regions,
    editor.placedCharacters,
    itemsById,
    charactersById,
  ]);

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

  const previewCellSize = Math.max(3, Math.floor(180 / editor.gridSize));
  const panelsLocked = editor.activeTool === 'region';
  const panelsDisabled = editor.activeTool === 'eraser';

  const saving = saveMutation.isPending;
  useEffect(() => {
    if (saving) {
      setSaveMaskVisible(true);
      return;
    }
    const timer = setTimeout(() => setSaveMaskVisible(false), 150);
    return () => clearTimeout(timer);
  }, [saving]);

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

  const confirmImport = (): void => {
    if (!pendingImport) return;
    editor.applyDraft(pendingImport);
    setPendingImport(null);
    toast.success('已导入地图，可撤销');
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
        setPendingImport(result.data as MapDraft);
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
        setSlotCharacterId(null);
        if (editor.activeTool !== 'region') editor.clearDraftSelection();
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
        dirty={editor.dirty}
        saving={saveMutation.isPending}
        status={editor.status}
        currentVersionNo={editor.currentVersionNo}
        onBack={() => navigate('/projects')}
        onSave={save}
        onPublish={publish}
        onOpenVersions={() => setVersionsOpen(true)}
        onExport={exportToFile}
        onImport={() => importInputRef.current?.click()}
      />

      <div className="relative flex min-h-0 flex-1">
        {saveMaskVisible ? (
          <div
            className={cn(
              'absolute inset-0 z-50 flex items-center justify-center gap-2 text-sm text-muted-foreground transition-opacity duration-150',
              saving ? 'opacity-100' : 'opacity-0',
            )}
            style={{ background: 'rgba(255,255,255,0.6)', pointerEvents: 'auto' }}
            aria-hidden={!saving}
          >
            <Loader2 className="h-5 w-5 animate-spin" />
            保存中…
          </div>
        ) : null}

        {itemsOpen ? (
          <div
            className={cn(
              'flex min-h-0 transition-opacity',
              panelsLocked ? 'pointer-events-none opacity-60' : undefined,
              panelsDisabled ? 'pointer-events-none opacity-50' : undefined,
            )}
          >
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
          </div>
        ) : null}

        <div
          className={cn(
            'flex min-h-0 transition-opacity',
            panelsLocked ? 'pointer-events-none opacity-60' : undefined,
            panelsDisabled ? 'pointer-events-none opacity-50' : undefined,
          )}
        >
          <CharacterSlotColumn
            slots={editor.characterSlots}
            charactersById={charactersById}
            selectedCharacterId={editor.selectedCharacterId}
            draggingIndex={characterDrag?.sourceSlotIndex ?? null}
            onSelect={selectSlotCharacter}
            onClear={clearSlot}
            onDragBegin={beginCharacterDrag}
            onDragMove={moveCharacterDrag}
            onDragEnd={endCharacterDrag}
            onDragCancel={cancelCharacterDrag}
          />
        </div>

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
            showRulers={rulerVisible}
            pendingItem={pendingItem}
            regionDraftSelection={editor.regionDraftSelection}
            characterDrag={characterDrag}
            onSelect={(selection) => {
              editor.setSelection(selection);
              setSlotCharacterId(null);
            }}
            onSelectRegion={editor.setSelectedRegion}
            onSelectCharacter={(characterId, x, y) => selectCharacter(characterId, x, y)}
            onAnchorChange={(anchor) => setRegionAnchorActive(anchor !== null)}
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
            onErase={(coord) => editor.eraseAt(coord.x, coord.y)}
            onZoom={editor.setZoom}
            onPan={editor.setPan}
          />

          {editor.activeTool === 'region' ? (
            <RegionSelectionBar
              count={editor.regionDraftSelection.size}
              anchored={regionAnchorActive}
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
            gridSize={editor.gridSize}
            itemsOpen={itemsOpen}
            rulerVisible={rulerVisible}
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
            onToggleRuler={() => setRulerVisible((visible) => !visible)}
            onOpenResize={() => setResizeOpen(true)}
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

      <Dialog
        open={resizeOpen}
        onOpenChange={(open) => {
          if (!open && !resizePending) setResizeOpen(false);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>调整画布尺寸</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              当前：{editor.gridSize} × {editor.gridSize}
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={GRID_SIZE_MIN}
                max={GRID_SIZE_MAX}
                value={resizeValue}
                disabled={resizePending}
                onChange={(event) => setResizeValue(Number(event.target.value))}
                className="h-2 flex-1 cursor-pointer accent-primary"
              />
              <Input
                type="number"
                min={GRID_SIZE_MIN}
                max={GRID_SIZE_MAX}
                value={resizeValue}
                disabled={resizePending}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) setResizeValue(value);
                }}
                onBlur={() =>
                  setResizeValue((value) =>
                    Math.min(GRID_SIZE_MAX, Math.max(GRID_SIZE_MIN, Math.round(value))),
                  )
                }
                className="w-20"
              />
            </div>

            <div className="flex justify-center">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${editor.gridSize}, ${previewCellSize}px)`,
                }}
              >
                {Array.from({ length: editor.gridSize * editor.gridSize }, (_, index) => {
                  const x = index % editor.gridSize;
                  const y = Math.floor(index / editor.gridSize);
                  const removed = x >= resizeValue || y >= resizeValue;
                  return (
                    <div
                      key={index}
                      style={{
                        width: previewCellSize,
                        height: previewCellSize,
                        backgroundColor: removed
                          ? 'rgba(239,68,68,0.25)'
                          : 'rgba(34,197,94,0.25)',
                        border: '1px solid rgba(0,0,0,0.12)',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {resizeImpact.items.length +
              resizeImpact.regions.length +
              resizeImpact.characters.length >
            0 ? (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <p className="mb-1 font-medium">将被移除：</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {[
                    ...resizeImpact.items,
                    ...resizeImpact.regions,
                    ...resizeImpact.characters,
                  ].map((line, index) => (
                    <li key={index}>· {line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={resizePending}
              onClick={() => setResizeOpen(false)}
            >
              取消
            </Button>
            <Button type="button" disabled={resizePending} onClick={confirmResize}>
              {resizePending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  调整中…
                </>
              ) : (
                '确认调整'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingImport !== null}
        onOpenChange={(open) => !open && setPendingImport(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>导入地图？</AlertDialogTitle>
            <AlertDialogDescription>
              导入会覆盖当前画布内容，导入后可通过撤销回退。
              {editor.dirty ? ' 当前有未保存的修改。' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>确认导入</AlertDialogAction>
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
