import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { Card, CellCoord, EditorTool, EffectType, MapCell, RegionData } from '@murdoku/shared';
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
import {
  EditorCanvas,
  type EditorCanvasHandle,
  type HighlightEffect,
} from '@/components/editor/EditorCanvas';
import { EditorLeftPanel } from '@/components/editor/EditorLeftPanel';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { RegionDialog } from '@/components/editor/RegionDialog';
import { useCards } from '@/hooks/useCards';
import { useProjectMap, useSaveMap } from '@/hooks/useMap';
import { clampZoom, isInBounds, zoomAtPoint, ZOOM_STEP } from '@/lib/grid';
import { cellKey, useEditorStore, type NewRegionInput } from '@/stores/editorStore';

interface PaletteDrag {
  card: Card;
  clientX: number;
  clientY: number;
  target: CellCoord | null;
}

interface RegionDialogState {
  open: boolean;
  mode: 'create' | 'edit';
  cells: CellCoord[];
  region: RegionData | null;
}

function parseCellKey(key: string): CellCoord {
  const [x, y] = key.split(',');
  return { x: Number(x), y: Number(y) };
}

export function EditorPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const id = Number(projectId);

  const mapQuery = useProjectMap(id);
  const cardsQuery = useCards({ isActive: true });
  const saveMutation = useSaveMap();

  const gridSize = useEditorStore((state) => state.gridSize);
  const cells = useEditorStore((state) => state.cells);
  const regions = useEditorStore((state) => state.regions);
  const activeTool = useEditorStore((state) => state.activeTool);
  const selection = useEditorStore((state) => state.selection);
  const selectedRegionId = useEditorStore((state) => state.selectedRegionId);
  const zoom = useEditorStore((state) => state.zoom);
  const pan = useEditorStore((state) => state.pan);
  const dirty = useEditorStore((state) => state.dirty);
  const canUndo = useEditorStore((state) => state.past.length > 0);
  const canRedo = useEditorStore((state) => state.future.length > 0);

  const init = useEditorStore((state) => state.init);
  const setTool = useEditorStore((state) => state.setTool);
  const setSelection = useEditorStore((state) => state.setSelection);
  const setSelectedRegion = useEditorStore((state) => state.setSelectedRegion);
  const setZoom = useEditorStore((state) => state.setZoom);
  const setPan = useEditorStore((state) => state.setPan);
  const resetView = useEditorStore((state) => state.resetView);
  const placeCard = useEditorStore((state) => state.placeCard);
  const removeCard = useEditorStore((state) => state.removeCard);
  const moveCard = useEditorStore((state) => state.moveCard);
  const applyRegionCreate = useEditorStore((state) => state.applyRegionCreate);
  const updateRegion = useEditorStore((state) => state.updateRegion);
  const deleteRegion = useEditorStore((state) => state.deleteRegion);
  const toggleRegionCell = useEditorStore((state) => state.toggleRegionCell);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const markSaved = useEditorStore((state) => state.markSaved);

  const canvasRef = useRef<EditorCanvasHandle | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [paletteDrag, setPaletteDrag] = useState<PaletteDrag | null>(null);
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [regionDialog, setRegionDialog] = useState<RegionDialogState>({
    open: false,
    mode: 'create',
    cells: [],
    region: null,
  });
  const [deleteRegionTarget, setDeleteRegionTarget] = useState<RegionData | null>(null);

  const map = mapQuery.data;
  const project = map?.project;

  useEffect(() => {
    if (map) init(map.project.id, map.project.gridSize, { cells: map.cells, regions: map.regions });
  }, [map, init]);

  const cardsById = useMemo(() => {
    const cards = new Map<number, Card>();
    for (const card of cardsQuery.data ?? []) cards.set(card.id, card);
    return cards;
  }, [cardsQuery.data]);

  const selectedCard = useMemo(() => {
    if (!selection) return null;
    const cell = cells.get(cellKey(selection.x, selection.y));
    return cell ? cardsById.get(cell.cardId) ?? null : null;
  }, [selection, cells, cardsById]);

  const highlightEffects = useMemo(() => {
    const effects = new Map<string, HighlightEffect>();
    const active = hoveredCard ?? selectedCard;
    if (!active || active.triggers.length === 0) return effects;
    const pairs = new Map(
      active.triggers.map((trigger) => [
        `${trigger.triggerKey}\u0000${trigger.triggerValue}`,
        trigger,
      ]),
    );
    for (const [key, cell] of cells) {
      if (cell.cardId === active.id) continue;
      const card = cardsById.get(cell.cardId);
      if (!card) continue;
      const match = card.triggers.find((trigger) =>
        pairs.has(`${trigger.triggerKey}\u0000${trigger.triggerValue}`),
      );
      if (match) {
        const source = pairs.get(`${match.triggerKey}\u0000${match.triggerValue}`);
        const text = source?.effectConfig.text;
        effects.set(key, {
          effectType: match.effectType,
          text: typeof text === 'string' ? text : undefined,
        });
      }
    }
    return effects;
  }, [hoveredCard, selectedCard, cells, cardsById]);

  const startPaletteDrag = (event: ReactPointerEvent, card: Card): void => {
    event.preventDefault();
    setPaletteDrag({ card, clientX: event.clientX, clientY: event.clientY, target: null });

    const resolve = (clientX: number, clientY: number, size: number): CellCoord | null => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.containsPoint(clientX, clientY)) return null;
      const coord = canvas.clientToCell(clientX, clientY);
      return isInBounds(coord, size) ? coord : null;
    };

    const cleanup = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };

    const onMove = (moveEvent: PointerEvent): void => {
      setPaletteDrag({
        card,
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY,
        target: resolve(moveEvent.clientX, moveEvent.clientY, gridSize),
      });
    };

    const onUp = (upEvent: PointerEvent): void => {
      cleanup();
      const target = resolve(upEvent.clientX, upEvent.clientY, gridSize);
      if (target) placeCard(target.x, target.y, card.id);
      setPaletteDrag(null);
    };

    const onKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === 'Escape') {
        cleanup();
        setPaletteDrag(null);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
  };

  const save = (): void => {
    if (saveMutation.isPending) return;
    const cellPayload: MapCell[] = [];
    for (const [key, cell] of cells) {
      const coord = parseCellKey(key);
      cellPayload.push({
        x: coord.x,
        y: coord.y,
        cardId: cell.cardId,
        rotation: cell.rotation,
        zIndex: cell.zIndex,
      });
    }
    const regionPayload = regions.map((region) => ({
      name: region.name,
      description: region.description,
      color: region.color,
      borderWidth: region.borderWidth,
      fillOpacity: region.fillOpacity,
      cells: region.cells.map((cell) => ({ x: cell.x, y: cell.y })),
    }));
    saveMutation.mutate(
      {
        id,
        payload: { updatedAt: project?.updatedAt, cells: cellPayload, regions: regionPayload },
      },
      { onSuccess: () => markSaved() },
    );
  };

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

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
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key === '0') {
        event.preventDefault();
        resetView();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selection) {
          removeCard(selection.x, selection.y);
          setSelection(null);
        }
        return;
      }
      if (event.key === 'Escape') {
        setSelection(null);
        return;
      }
      if (mod) return;
      if (event.key === 'v' || event.key === 'V') setTool('select');
      else if (event.key === 'r' || event.key === 'R') setTool('region');
      else if (event.key === 'e' || event.key === 'E') setTool('eraser');
      else if (event.key.startsWith('Arrow') && selection) {
        const delta: Record<string, CellCoord> = {
          ArrowUp: { x: 0, y: -1 },
          ArrowDown: { x: 0, y: 1 },
          ArrowLeft: { x: -1, y: 0 },
          ArrowRight: { x: 1, y: 0 },
        };
        const step = delta[event.key];
        if (step) {
          event.preventDefault();
          const next = { x: selection.x + step.x, y: selection.y + step.y };
          if (isInBounds(next, gridSize)) setSelection(next);
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
  }, [selection, gridSize, setTool, setSelection, removeCard, undo, redo, resetView, save]);

  function zoomBy(direction: 1 | -1): void {
    const canvas = canvasRef.current;
    const rect = canvas?.getRect() ?? null;
    const next = clampZoom(zoom + direction * ZOOM_STEP);
    if (next === zoom || !rect) {
      setZoom(next);
      return;
    }
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    setPan(zoomAtPoint(center, rect, pan, next, zoom));
    setZoom(next);
  }

  const openCreateRegion = (coords: CellCoord[]): void => {
    if (coords.length === 0) return;
    setRegionDialog({ open: true, mode: 'create', cells: coords, region: null });
  };

  const openEditRegion = (region: RegionData): void => {
    setSelectedRegion(region.id);
    setRegionDialog({ open: true, mode: 'edit', cells: region.cells, region });
  };

  const submitRegion = (input: NewRegionInput, conflictMode: 'override' | 'skip'): void => {
    if (regionDialog.mode === 'create') {
      applyRegionCreate(input, conflictMode === 'override');
    } else if (regionDialog.region) {
      updateRegion(regionDialog.region.id, input);
    }
  };

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
      <EditorToolbar
        projectName={project.name}
        gridSize={project.gridSize}
        zoom={zoom}
        dirty={dirty}
        saving={saveMutation.isPending}
        canUndo={canUndo}
        canRedo={canRedo}
        onBack={() => navigate('/projects')}
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
        onResetZoom={resetView}
        onUndo={undo}
        onRedo={redo}
        onSave={save}
      />

      <div className="flex min-h-0 flex-1">
        <EditorLeftPanel
          cards={cardsQuery.data}
          cardsLoading={cardsQuery.isLoading}
          cardsError={cardsQuery.isError}
          regions={regions}
          selectedRegionId={selectedRegionId}
          activeTool={activeTool}
          onSetTool={setTool}
          onStartDrag={startPaletteDrag}
          onHoverCard={setHoveredCard}
          onSelectRegion={setSelectedRegion}
          onEditRegion={openEditRegion}
          onDeleteRegion={setDeleteRegionTarget}
        />

        <main className="relative min-h-0 flex-1">
          <EditorCanvas
            ref={canvasRef}
            gridSize={gridSize}
            cells={cells}
            regions={regions}
            selectedRegionId={selectedRegionId}
            cardsById={cardsById}
            zoom={zoom}
            pan={pan}
            selection={selection}
            activeTool={activeTool}
            spaceHeld={spaceHeld}
            dropPreview={paletteDrag?.target ?? null}
            highlightEffects={highlightEffects}
            onSelect={setSelection}
            onSelectRegion={setSelectedRegion}
            onRegionSelect={openCreateRegion}
            onToggleRegionCell={(coord) => {
              if (selectedRegionId !== null) toggleRegionCell(selectedRegionId, coord);
            }}
            onMoveCard={(from, to) => moveCard(from.x, from.y, to.x, to.y)}
            onErase={(coord) => removeCard(coord.x, coord.y)}
            onZoom={setZoom}
            onPan={setPan}
          />
        </main>
      </div>

      <RegionDialog
        open={regionDialog.open}
        onOpenChange={(open) => setRegionDialog((state) => ({ ...state, open }))}
        mode={regionDialog.mode}
        cells={regionDialog.cells}
        region={regionDialog.region}
        regions={regions}
        onSubmit={submitRegion}
      />

      <AlertDialog
        open={deleteRegionTarget !== null}
        onOpenChange={(open) => !open && setDeleteRegionTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除区域「{deleteRegionTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              仅移除区域标记，区域内的卡片会被保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteRegionTarget) deleteRegion(deleteRegionTarget.id);
                setDeleteRegionTarget(null);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>有未保存的更改</AlertDialogTitle>
            <AlertDialogDescription>离开将丢失当前画布上的修改，确定离开吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>留下</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (blocker.state === 'blocked') blocker.proceed();
              }}
            >
              离开
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {paletteDrag ? (
        <div
          className="pointer-events-none fixed z-50 h-12 w-12 -translate-x-1/2 -translate-y-1/2 opacity-80"
          style={{ left: paletteDrag.clientX, top: paletteDrag.clientY }}
        >
          <img
            src={paletteDrag.card.imageThumbUrl ?? paletteDrag.card.imageUrl ?? undefined}
            alt={paletteDrag.card.name}
            draggable={false}
            className="h-full w-full rounded border object-cover shadow-lg"
          />
        </div>
      ) : null}
    </div>
  );
}
