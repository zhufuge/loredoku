import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_CELL_SIZE,
  puzzleDraftSchema,
  validatePuzzleReferences,
  type Character,
  type CharacterSlotEntry,
  type Asset,
  type ParticipantTarget,
  type PuzzleDraft,
} from '@loredoku/shared';
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
import { EditorCanvas, type EditorCanvasHandle } from '@/components/map-editor/EditorCanvas';
import { EditorInfoDrawer } from '@/components/map-editor/EditorInfoDrawer';
import { EditorToolbar } from '@/components/map-editor/EditorToolbar';
import {
  EditorErrorState,
  EditorImportInput,
  EditorLoadingState,
  EditorPendingInfoActionDialog,
  EditorSaveMask,
  EditorUnsavedLeaveDialog,
} from '@/components/map-editor/EditorShell';
import {
  ParticipantDrawer,
  type PlacedItemOption,
} from '@/components/map-editor/ParticipantDrawer';
import { ParticipantPanel } from '@/components/map-editor/ParticipantPanel';
import { Input } from '@/components/ui/input';
import { PuzzleBottomBar } from '@/components/puzzle/PuzzleBottomBar';
import { PuzzleVersionHistoryDialog } from '@/components/puzzle/PuzzleVersionHistoryDialog';
import { PuzzleEditorLeftPanel } from '@/components/puzzle/PuzzleEditorLeftPanel';
import {
  PuzzleInfoDrawer,
  type PuzzleInfoDrawerHandle,
} from '@/components/puzzle/PuzzleInfoDrawer';
import { useCharacters } from '@/hooks/useCharacters';
import { useAssets } from '@/hooks/useAssets';
import { useHighlight } from '@/hooks/useHighlight';
import {
  usePublishPuzzle,
  usePuzzle,
  usePuzzleMapContext,
  usePuzzleVersions,
  useSavePuzzle,
} from '@/hooks/usePuzzles';
import { useEditorPublish } from '@/hooks/useEditorPublish';
import { useEditorSave } from '@/hooks/useEditorSave';
import { useEditorShortcuts } from '@/hooks/useEditorShortcuts';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { infoDrawerOpen, reduceEditorFocus, type EditorFocus } from '@/lib/editorFocus';
import { resolveHighlight } from '@/lib/highlight';
import {
  mapContextCells,
  mapContextRegions,
  resolveMapContextStyle,
  usePuzzleStore,
} from '@/stores/puzzleStore';

/** FEAT-F01 (kept from the work preview): the reader's ruler preference. */
const RULER_STORAGE_KEY = 'loredoku.puzzle.ruler';

function readStoredRulerVisible(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(RULER_STORAGE_KEY) !== 'hidden';
}

/**
 * v0.5.0 FEAT-K01 (docs/v0.5.0.md §2.5 / §4 / §5): the puzzle editor.
 *
 * It is the map editor's skeleton with the canvas turned into a **read-only
 * reference** (`GET /api/puzzles/:id/map`), the roster / palette / participant
 * drawer moved back in from the map side, and every canvas-writing affordance
 * removed (§4.1 / §4.4). Two stores therefore cooperate:
 *
 * - `usePuzzleStore` — the puzzle's own data (undoable) + the read-only
 *   `mapContext` (never in the undo stack, §2.6);
 * - nothing else writes the canvas, which is what SPEC-K07's 「尺寸仅展示」
 *   and SPEC-K06's read-only info box both rest on.
 *
 * There is no 发布 button (Q17) and no 「调整画布尺寸」 dialog: the canvas
 * belongs to the referenced map version, which is immutable (SPEC-K11).
 */
export function PuzzleEditorPage(): JSX.Element {
  const { puzzleId } = useParams<{ puzzleId: string }>();
  const navigate = useNavigate();
  const id = Number(puzzleId);
  const valid = Number.isFinite(id) && id > 0;

  const puzzle = usePuzzleStore();

  const detailQuery = usePuzzle(valid ? id : null);
  const mapQuery = usePuzzleMapContext(valid ? id : null);
  // The referenced snapshot may point at items / characters that are inactive
  // now, so both lists are unfiltered (same rule as the work preview page).
  const assetsQuery = useAssets({});
  const charactersQuery = useCharacters({});
  const saveMutation = useSavePuzzle();
  const versionsQuery = usePuzzleVersions(valid ? id : null);
  const publishMutation = usePublishPuzzle(id);
  const leaveGuard = useUnsavedChangesGuard(puzzle.dirty);

  const canvasRef = useRef<EditorCanvasHandle | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const puzzleInfoRef = useRef<PuzzleInfoDrawerHandle | null>(null);

  const [spaceHeld, setSpaceHeld] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  /** SPEC-K05: the puzzle's 「基本信息」drawer (描述 + 联动主题色). */
  const [puzzleInfoOpen, setPuzzleInfoOpen] = useState(false);
  /** The character whose detail the info drawer shows (the old 「未落地角色」). */
  const [unplacedCharacterId, setUnplacedCharacterId] = useState<number | null>(null);
  const [removeParticipantTarget, setRemoveParticipantTarget] = useState<number | null>(null);
  /**
   * FEAT-E01 §7.3(a): while the participant drawer is picking a position
   * condition, the next canvas click sets it instead of moving focus.
   */
  const [positionPickSlot, setPositionPickSlot] = useState<number | null>(null);
  const [pickedPosition, setPickedPosition] = useState<{ x: number; y: number } | null>(null);
  /** Slot → slot reorder preview (CLAR-603: never drops onto the canvas). */
  const [slotDrag, setSlotDrag] = useState<number | null>(null);
  const [pendingImport, setPendingImport] = useState<PuzzleDraft | null>(null);
  const [autoCellSize, setAutoCellSize] = useState<number>(DEFAULT_CELL_SIZE);
  const [rulerVisible, setRulerVisible] = useState<boolean>(readStoredRulerVisible);
  /**
   * FEAT-E01: a drawer switch (or a close) waiting for the user to decide what
   * happens to unsaved 基本信息 edits.
   */
  const [pendingPuzzleInfoAction, setPendingPuzzleInfoAction] = useState<(() => void) | null>(null);
  /** 「版本历史」面板（§5.5）。 */
  const [versionsOpen, setVersionsOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RULER_STORAGE_KEY, rulerVisible ? 'visible' : 'hidden');
    }
  }, [rulerVisible]);

  const assetsById = useMemo(() => {
    const map = new Map<number, Asset>();
    for (const item of assetsQuery.data ?? []) map.set(item.id, item);
    return map;
  }, [assetsQuery.data]);

  const charactersById = useMemo(() => {
    const map = new Map<number, Character>();
    for (const character of charactersQuery.data ?? []) map.set(character.id, character);
    return map;
  }, [charactersQuery.data]);

  const mapContext = puzzle.mapContext;
  const cells = useMemo(() => mapContextCells(mapContext), [mapContext]);
  const regions = useMemo(() => mapContextRegions(mapContext), [mapContext]);
  const style = useMemo(() => resolveMapContextStyle(mapContext), [mapContext]);
  const gridSize = mapContext?.gridSize ?? 0;

  /**
   * Seeds the store once both halves have landed. `mapContext` is stable
   * (`staleTime: Infinity`), so this effect fires on the detail's first arrival
   * — and again only if the puzzle was re-fetched with a newer `updatedAt`.
   */
  const initKeyRef = useRef<string | null>(null);
  /**
   * FIX-O18 (docs/v0.5.4.md §7.5): the `updatedAt` this session's own 保存
   * wrote back. `useSavePuzzle` seeds the detail query with the server's answer,
   * so `detailQuery.data.updatedAt` changes on **every** save — which used to
   * re-run `init()` and throw the board back to the top-left (and wipe the undo
   * stack). A save is not a reason to re-seed; only a foreign write is.
   */
  const lastSavedAtRef = useRef<string | null>(null);
  /**
   * FIX-F01's single writer is shared with the map editor now. The
   * puzzle side keeps its FIX-O18 bookkeeping (remember the `updatedAt` this
   * very save wrote back, so the detail query's answer is not mistaken for a
   * foreign write).
   */
  const { persist, save, saving, saveMaskVisible } = useEditorSave({
    id,
    mutation: saveMutation,
    buildPayload: () => ({ data: puzzle.toDraft(), updatedAt: puzzle.updatedAt }),
    onSaved: (data) => {
      const savedAt = data.updatedAt ?? new Date().toISOString();
      lastSavedAtRef.current = savedAt;
      puzzle.markSaved(savedAt);
    },
  });
  /**
   * 发布流程与地图共用 `useEditorPublish`：下一个版本号取自整个血统的版本历史，
   * 版本号可手填（填空洞号），dirty 时先保存再发布。
   */
  const {
    publishOpen,
    setPublishOpen,
    violations,
    setViolations,
    nextVersionNo,
    versionInput,
    setVersionInput,
    versionError,
    setVersionError,
    validateVersion,
    openPublishConfirm,
    confirmPublish,
  } = useEditorPublish({
    versions: versionsQuery.data,
    currentVersionNo: detailQuery.data?.currentVersionNo ?? null,
    dirty: puzzle.dirty,
    saving,
    persist,
    publishMutation,
    entryNoun: '谜题',
  });
  useEffect(() => {
    if (!detailQuery.data || !mapQuery.data) return;
    const key = `${detailQuery.data.id}:${detailQuery.data.updatedAt ?? ''}`;
    if (initKeyRef.current === key) return;
    initKeyRef.current = key;
    if (lastSavedAtRef.current !== null && detailQuery.data.updatedAt === lastSavedAtRef.current) {
      return;
    }
    puzzle.init(detailQuery.data, mapQuery.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailQuery.data, mapQuery.data]);

  useEffect(() => {
    // OPT-G01 (kept): the tab is titled with the puzzle's name once it lands.
    const name = detailQuery.data?.name;
    document.title = name ? `${name} · 格物` : '谜题编辑 · 格物';
  }, [detailQuery.data?.name]);

  // ---- CLAR-603 + MOD-802: participant linkage lives entirely in the roster ----
  const {
    highlight,
    show: showHighlight,
    clear: clearHighlight,
    leaving: highlightLeaving,
  } = useHighlight();

  const selectedSlot =
    puzzle.selectedSlotIndex === null
      ? null
      : puzzle.characterSlots[puzzle.selectedSlotIndex] ?? null;

  const activeSlot =
    puzzle.activeParticipantId === null
      ? null
      : puzzle.characterSlots[puzzle.activeParticipantId] ?? null;

  /**
   * MOD-802 §1.2.4: the highlight is a pure projection of the single-active
   * state machine — persistent while active, faded out (150ms) afterwards.
   *
   * v0.5.0 Q16: the palette is the puzzle's own, so it is passed explicitly
   * instead of being read off `MapStyle`.
   */
  useEffect(() => {
    if (!activeSlot) {
      clearHighlight();
      return;
    }
    showHighlight(
      resolveHighlight(activeSlot.linkages, {
        gridSize,
        cells,
        characterSlots: puzzle.characterSlots,
        regions,
        style,
        linkageColors: puzzle.linkageColors,
      }),
    );
  }, [
    activeSlot,
    gridSize,
    cells,
    puzzle.characterSlots,
    puzzle.linkageColors,
    regions,
    style,
    showHighlight,
    clearHighlight,
  ]);

  const placedItems = useMemo<PlacedItemOption[]>(() => {
    const list: PlacedItemOption[] = [];
    for (const [key, cell] of cells.entries()) {
      if (!cell.item) continue;
      const [x, y] = key.split(',').map(Number) as [number, number];
      list.push({
        assetId: cell.item.assetId,
        name: assetsById.get(cell.item.assetId)?.name ?? '',
        // FIX-N12 §6.5: carried through to the linkage picker.
        code: assetsById.get(cell.item.assetId)?.code ?? '',
        x,
        y,
      });
    }
    return list;
  }, [cells, assetsById]);

  /**
   * OPT-C07 (docs/v0.3.7.md §OPT-C07): the participant activation and the cell
   * selection are mutually exclusive. The rule lives in `lib/editorFocus.ts`
   * so it can be unit-tested without a DOM — reused verbatim from the map
   * editor, only the store it drives changed.
   */
  const applyFocus = (event: Parameters<typeof reduceEditorFocus>[1]): void => {
    const current: EditorFocus = {
      activation: {
        activeParticipantId: puzzle.activeParticipantId,
        activationMode: puzzle.activationMode,
      },
      selection: puzzle.selection,
    };
    const next = reduceEditorFocus(current, event);
    if (next.activation.activeParticipantId === null) {
      if (current.activation.activeParticipantId !== null) puzzle.clearActivation();
    } else if (
      next.activation.activeParticipantId !== current.activation.activeParticipantId ||
      next.activation.activationMode !== current.activation.activationMode
    ) {
      puzzle.activateParticipantClick(next.activation.activeParticipantId);
    }
    if (next.selection !== current.selection) puzzle.setSelection(next.selection);
  };

  /**
   * SPEC-K05: the puzzle's 基本信息 drawer is a form, so leaving it with
   * unsaved edits has to be confirmed (v0.3.9 FEAT-E01 + BUG-G01, moved here
   * verbatim).
   */
  const guardPuzzleInfo = (proceed: () => void): void => {
    if (!puzzleInfoOpen) {
      proceed();
      return;
    }
    if (!puzzleInfoRef.current?.isDirty()) {
      setPuzzleInfoOpen(false);
      proceed();
      return;
    }
    setPendingPuzzleInfoAction(() => proceed);
  };

  /** v0.6.3 §3: the layout column count rides along with the other basics. */
  const commitPuzzleInfo = (next: Parameters<typeof puzzle.setBasicInfo>[0]): void => {
    puzzle.setBasicInfo(next);
    setPuzzleInfoOpen(false);
  };

  const closePuzzleInfo = (): void => {
    guardPuzzleInfo(() => setPuzzleInfoOpen(false));
  };

  /** Runs the deferred switch, saving first when the user asked to. */
  const resolvePendingPuzzleInfo = (mode: 'save' | 'discard'): void => {
    const action = pendingPuzzleInfoAction;
    setPendingPuzzleInfoAction(null);
    if (mode === 'save') puzzleInfoRef.current?.save();
    else {
      puzzleInfoRef.current?.discard();
      setPuzzleInfoOpen(false);
    }
    action?.();
  };

  const saveParticipant = (
    slotIndex: number,
    patch: {
      themeColor: string;
      clue: string;
      linkages: ParticipantTarget[];
      positionConditions: Array<{ x: number; y: number }>;
      /** v0.6.4 §2: 编号展示；`''` = 清回序号。 */
      displayNumber: string;
    },
  ): void => {
    puzzle.setParticipantConfig(slotIndex, patch);
    /**
     * FIX-N13 (docs/v0.5.3.md §6.6): 保存 closes the drawer and leaves no focus
     * behind — neither the pick mode, nor the slot, nor a cell / region
     * selection. Any one of them would let the 方格信息框 spring back up the
     * moment the drawer is gone.
     */
    setPositionPickSlot(null);
    puzzle.setSelectedSlot(null);
    puzzle.setSelection(null);
    setPickedPosition(null);
    setInfoOpen(false);
    toast.success('已保存参与者配置');
  };

  const confirmRemoveParticipant = (): void => {
    if (removeParticipantTarget === null) return;
    const slotIndex = removeParticipantTarget;
    puzzle.clearCharacterSlot(slotIndex);
    // MOD-802: the removed participant can no longer own the active linkage.
    if (puzzle.activeParticipantId === slotIndex) puzzle.clearActivation();
    if (puzzle.selectedSlotIndex === slotIndex) {
      puzzle.setSelectedSlot(null);
    }
    setRemoveParticipantTarget(null);
    toast.success('已移除参与者');
  };

  const clearSlot = (index: number): void => {
    const slot = puzzle.characterSlots[index];
    if (!slot) return;
    setRemoveParticipantTarget(index);
  };

  const assignSlot = (characterId: number): void => {
    const index = puzzle.characterSlots.findIndex((slot) => slot === null);
    if (index === -1) {
      toast.error('参与者区已满，请先移出角色');
      return;
    }
    puzzle.assignSlot(characterId);
  };

  // ---- Slot → slot reorder (never drops onto the read-only canvas) ----
  const beginSlotDrag = (payload: { slotIndex: number; pointer: { x: number; y: number } }): void => {
    setSlotDrag(payload.slotIndex);
  };

  const moveSlotDrag = (_pointer: { x: number; y: number }): void => {
    /* the swap is resolved on drop; nothing to do while moving */
  };

  const cancelSlotDrag = (): void => setSlotDrag(null);

  const endSlotDrag = (pointer: { x: number; y: number }): void => {
    const from = slotDrag;
    setSlotDrag(null);
    if (from === null) return;
    const slotNode = document.elementFromPoint(pointer.x, pointer.y)?.closest('[data-slot-index]');
    if (!slotNode) return;
    const targetIndex = Number(slotNode.getAttribute('data-slot-index'));
    if (Number.isInteger(targetIndex) && targetIndex !== from) {
      puzzle.swapSlots(from, targetIndex);
    }
  };

  /**
   * FEAT-E01 §7.3(a): `Esc` leaves the position-selection mode (and the slot
   * drag, and the info drawer first). v0.5.6: these used to be two extra window
   * listeners next to the main shortcut handler; the shared hook's Escape now
   * walks the same cascade — see `handlePuzzleEscape` below.
   */

  // ---- SPEC-K06 / BUG-G01: the info drawer follows the focus axes ----
  useEffect(() => {
    // While the puzzle's 基本信息 drawer is up, the cell info box stays closed
    // (BUG-G01: the two panels stack, and closing the top one must not let the
    // bottom one pop back up).
    if (puzzleInfoOpen) {
      setInfoOpen(false);
      return;
    }
    setInfoOpen(puzzle.selection !== null || puzzle.selectedSlotIndex !== null);
  }, [puzzle.selection, puzzle.selectedSlotIndex, puzzleInfoOpen]);

  // ---- FEAT-K08: JSON export / import ----
  const exportToFile = (): void => {
    const blob = new Blob([JSON.stringify(puzzle.toDraft(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${puzzle.name || 'puzzle'}-puzzle.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const confirmImport = (): void => {
    if (!pendingImport) return;
    puzzle.applyDraft(pendingImport);
    setPendingImport(null);
    toast.success('已导入谜题，可撤销');
  };

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void (async () => {
      try {
        const parsed: unknown = JSON.parse(await file.text());
        const result = puzzleDraftSchema.safeParse(parsed);
        if (!result.success) {
          toast.error('JSON 格式不正确');
          return;
        }
        const draft = result.data;
        const context = mapQuery.data;
        if (!context) {
          toast.error('画布尚未加载完成，请稍后再试');
          return;
        }
        // §15 Q6: the map reference is fixed at creation time. Importing a file
        // that points at another version would silently re-target the puzzle.
        if (
          draft.map.mapId !== context.mapId ||
          draft.map.versionNo !== context.versionNo
        ) {
          toast.error(
            `导入文件引用了另一个地图版本（v${draft.map.versionNo}），请新建谜题再导入`,
          );
          return;
        }
        // §5.2: item / region targets live in the map version, so the schema
        // cannot see them — the same check the server runs before writing.
        const issues = validatePuzzleReferences(draft, {
          cells: context.cells,
          regions: context.regions,
        });
        if (issues.length > 0) {
          toast.error(`导入失败：${issues[0]!.message}`);
          return;
        }
        setPendingImport(draft);
      } catch {
        toast.error('无法读取文件');
      }
    })();
  };

  /**
   * v0.6.3: the zoom maths lives in the canvas (next to the wheel handler) so
   * the button path marks the view as user-adjusted too — otherwise the
   * adaptive auto-centre pass centres the new zoom away on the next render
   * and the buttons look dead until a wheel zoom sets that flag.
   */
  function zoomBy(direction: 1 | -1): void {
    canvasRef.current?.zoomByStep(direction);
  }

  /**
   * the shared keys live in `useEditorShortcuts`. The puzzle canvas is
   * read-only (SPEC-K07 §4.4), so there is no `onKey` — no V / R / E tool
   * switches, and `Delete` / `Backspace` no longer erase a selected cell — and
   * Escape walks the page's own cascade.
   */
  const handlePuzzleEscape = (): void => {
    if (puzzleInfoOpen) {
      // SPEC-K05: Esc leaves the info drawer first — and asks when there
      // are unsaved edits. It does not touch the cell focus.
      closePuzzleInfo();
      return;
    }
    if (slotDrag !== null) {
      cancelSlotDrag();
      return;
    }
    if (positionPickSlot !== null) {
      setPositionPickSlot(null);
      return;
    }
    puzzle.setSelection(null);
    puzzle.setSelectedSlot(null);
    setUnplacedCharacterId(null);
  };

  const moveSelection = (dx: number, dy: number): void => {
    const selection = puzzle.selection;
    if (!selection || selection.type !== 'cell') return;
    const next = { x: selection.x + dx, y: selection.y + dy };
    if (next.x >= 0 && next.y >= 0 && next.x < gridSize && next.y < gridSize) {
      puzzle.setSelection({ type: 'cell', x: next.x, y: next.y });
    }
  };

  useEditorShortcuts({
    save,
    undo: puzzle.undo,
    redo: puzzle.redo,
    centerView: () => canvasRef.current?.centerView(),
    moveSelection,
    onSpaceHeldChange: setSpaceHeld,
    onEscape: handlePuzzleEscape,
  });

  if (!valid || detailQuery.isError || mapQuery.isError) {
    return (
      <EditorErrorState
        message="谜题不存在或加载失败。"
        backLabel="返回谜题列表"
        onBack={() => navigate('/puzzles')}
      />
    );
  }

  if (detailQuery.isLoading || mapQuery.isLoading || !mapContext) {
    return <EditorLoadingState />;
  }

  const detail = detailQuery.data;

  // Resolve highlight character → slot index mapping for the roster panel.
  const highlightedSlots = new Set<number>();
  const highlightColors = new Map<number, string>();
  for (const character of highlight?.characters ?? []) {
    highlightedSlots.add(character.slotIndex);
    highlightColors.set(character.slotIndex, character.color);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <EditorImportInput inputRef={importInputRef} onChange={handleImportFile} />

      <EditorToolbar
        mapName={puzzle.name || detail?.name || ''}
        dirty={puzzle.dirty}
        saving={saving}
        publishing={publishMutation.isPending}
        status={puzzle.status}
        currentVersionNo={detail?.currentVersionNo ?? null}
        onBack={() => navigate('/puzzles')}
        onSave={save}
        onPublish={openPublishConfirm}
        onOpenVersions={() => setVersionsOpen(true)}
        mapInfoOpen={puzzleInfoOpen}
        infoTitle="谜题基本信息（描述、参与者布局、联动主题色）"
        onOpenMapInfo={() => {
          if (puzzleInfoOpen) {
            closePuzzleInfo();
            return;
          }
          setPuzzleInfoOpen(true);
          puzzle.setSelection(null);
          puzzle.setSelectedSlot(null);
          setUnplacedCharacterId(null);
          setInfoOpen(false);
        }}
        onExport={exportToFile}
        onImport={() => importInputRef.current?.click()}
      />

      <div className="relative flex min-h-0 flex-1">
        <EditorSaveMask saving={saving} visible={saveMaskVisible} />

        {/* SPEC-K04: only the 角色 tab survives on this side. */}
        <PuzzleEditorLeftPanel
          characters={charactersQuery.data}
          charactersLoading={charactersQuery.isLoading}
          charactersError={charactersQuery.isError}
          characterSlots={puzzle.characterSlots}
          selectedCharacterId={unplacedCharacterId}
          onAssignSlot={assignSlot}
          onSelectCharacter={(cid) => {
            if (cid === null) {
              setUnplacedCharacterId(null);
              return;
            }
            setUnplacedCharacterId(cid);
            puzzle.setSelectedSlot(null);
          }}
        />

        <ParticipantPanel
          slots={puzzle.characterSlots}
          charactersById={charactersById}
          cols={puzzle.rosterCols}
          selectedSlotIndex={puzzle.selectedSlotIndex}
          draggingIndex={slotDrag}
          activeSlotIndex={puzzle.activeParticipantId}
          highlightedSlots={highlightedSlots}
          highlightColors={highlightColors}
          onSelect={(index) => {
            guardPuzzleInfo(() => {
              puzzle.setSelectedSlot(index);
              if (index === null) {
                setUnplacedCharacterId(null);
              }
            });
          }}
          onActivateHover={puzzle.activateParticipantHover}
          onDeactivateHover={puzzle.deactivateParticipantHover}
          onActivateClick={(index) => {
            // OPT-C07: pinning a participant drops the cell selection so the
            // drawer stays exclusive. SPEC-K05: confirmed when the info drawer
            // has unsaved edits.
            guardPuzzleInfo(() => {
              applyFocus({ type: 'participant', participantId: index });
            });
          }}
          onClearRequest={clearSlot}
          onDragBegin={beginSlotDrag}
          onDragMove={moveSlotDrag}
          onDragEnd={endSlotDrag}
          onDragCancel={cancelSlotDrag}
        />

        <main className="relative min-h-0 flex-1">
          <EditorCanvas
            ref={canvasRef}
            gridSize={gridSize}
            cells={cells}
            assetsById={assetsById}
            regions={regions}
            style={style}
            onAutoCellSize={setAutoCellSize}
            selectedRegionId={
              puzzle.selection?.type === 'region' ? puzzle.selection.regionId : null
            }
            zoom={puzzle.zoom}
            pan={puzzle.pan}
            selection={puzzle.selection}
            // SPEC-K07: the canvas is a read-only reference, so the tool is
            // pinned and nothing can be placed or erased on it.
            activeTool="select"
            spaceHeld={spaceHeld}
            showRulers={rulerVisible}
            pendingForm={null}
            regionDraftSelection={new Set<string>()}
            highlight={highlight}
            highlightLeaving={highlightLeaving}
            onSelect={(selection) => {
              // FEAT-E01 §7.3(a): while a position condition is being picked,
              // the click *is* the answer — it must not move the focus or open
              // the cell info box.
              if (positionPickSlot !== null) {
                if (selection?.type === 'cell') {
                  setPickedPosition({ x: selection.x, y: selection.y });
                }
                return;
              }
              // OPT-C07: clicking the board clears the participant activation
              // (hover- or click-pinned) and hands the focus to the cell.
              guardPuzzleInfo(() => {
                applyFocus({ type: 'cell', selection });
                if (selection) {
                  puzzle.setSelectedSlot(null);
                  setUnplacedCharacterId(null);
                }
              });
            }}
            onSelectRegion={(regionId) => {
              /**
               * FIX-N13 (docs/v0.5.3.md §6.6): `selectCellAt` reports the cell
               * **and** the region it belongs to. `onSelect` already ignored the
               * click while a position condition was being picked; this one did
               * not — so picking a cell inside a region set a region selection
               * and the 方格信息框 popped up as soon as the drawer closed.
               */
              if (positionPickSlot !== null) return;
              guardPuzzleInfo(() => {
                puzzle.setSelection(regionId === null ? null : { type: 'region', regionId });
              });
            }}
            onDraftAdd={() => undefined}
            onDraftRemove={() => undefined}
            onDraftClear={() => undefined}
            onToggleRegionCell={() => undefined}
            onPlaceItem={() => undefined}
            onErase={() => undefined}
            onZoom={puzzle.setZoom}
            onPan={puzzle.setPan}
          />

          <PuzzleBottomBar
            canUndo={puzzle.past.length > 0}
            canRedo={puzzle.future.length > 0}
            zoom={puzzle.zoom}
            gridSize={gridSize}
            rulerVisible={rulerVisible}
            onUndo={puzzle.undo}
            onRedo={puzzle.redo}
            onZoomIn={() => zoomBy(1)}
            onZoomOut={() => zoomBy(-1)}
            onZoomReset={() => puzzle.setZoom(1)}
            onFit={() => canvasRef.current?.centerView()}
            onToggleRuler={() => setRulerVisible((visible) => !visible)}
          />

          <EditorInfoDrawer
            open={infoDrawerOpen({
              infoOpen,
              mapInfoOpen: puzzleInfoOpen,
              selectedSlotIndex: puzzle.selectedSlotIndex,
            })}
            onClose={() => setInfoOpen(false)}
            onOpen={() => setInfoOpen(true)}
            selection={puzzle.selection}
            cells={cells}
            regions={regions}
            assetsById={assetsById}
            style={style}
            onClearCell={() => undefined}
            onClearItem={() => undefined}
            onSubmitRegion={() => undefined}
            onDeleteRegion={() => undefined}
            onLocateRegion={() => canvasRef.current?.centerView()}
            readOnly
          />

          <PuzzleInfoDrawer
            ref={puzzleInfoRef}
            open={puzzleInfoOpen}
            description={puzzle.description}
            linkageColors={puzzle.linkageColors}
            characterSlots={puzzle.characterSlots}
            rosterCols={puzzle.rosterCols}
            onRequestClose={closePuzzleInfo}
            onCommit={commitPuzzleInfo}
          />
        </main>

        {/*
         * FIX-N10 (docs/v0.5.3.md §6.3): the 参与者信息框 is `absolute
         * inset-y-0`, so its containing block decides where it starts. It used
         * to be a child of the page root — which is **not** positioned — so
         * `inset-y-0` resolved against the viewport and the drawer ran from the
         * very top, covering the header bar. Inside this row (a sibling of the
         * header, and `relative`) it starts at the header's bottom edge.
         */}
        <ParticipantDrawer
          open={puzzle.selectedSlotIndex !== null}
          onClose={() => {
            setPositionPickSlot(null);
            puzzle.setSelectedSlot(null);
          }}
          slotIndex={puzzle.selectedSlotIndex}
          slots={puzzle.characterSlots}
          character={selectedSlot ? charactersById.get(selectedSlot.characterId) : undefined}
          charactersById={charactersById}
          placedItems={placedItems}
          regions={regions}
          gridSize={gridSize}
          linkageColors={puzzle.linkageColors}
          positionPickActive={positionPickSlot !== null}
          onTogglePositionPick={() =>
            setPositionPickSlot((current) => (current === null ? puzzle.selectedSlotIndex : null))
          }
          pickedPosition={pickedPosition}
          onPositionPicked={() => setPickedPosition(null)}
          onSave={saveParticipant}
        />
      </div>

      <AlertDialog
        open={pendingImport !== null}
        onOpenChange={(open) => !open && setPendingImport(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>导入谜题？</AlertDialogTitle>
            <AlertDialogDescription>
              导入会覆盖当前的描述、联动主题色与参与者配置，导入后可通过撤销回退。
              {pendingImport && pendingImport.map.versionNo !== mapContext.versionNo
                ? ' 注意：导入文件的地图版本与当前谜题不一致。'
                : ''}
              {puzzle.dirty ? ' 当前有未保存的修改。' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>确认导入</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MOD-705: participant removal confirmation */}
      <AlertDialog
        open={removeParticipantTarget !== null}
        onOpenChange={(open) => !open && setRemoveParticipantTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              确定移除参与者「
              {removeParticipantTarget !== null
                ? charactersById.get(
                    puzzle.characterSlots[removeParticipantTarget]?.characterId ?? 0,
                  )?.name ?? ''
                : ''}
              」吗？
            </AlertDialogTitle>
            <AlertDialogDescription>
              该参与者及其线索与联动配置将一并移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveParticipant}>移除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* SPEC-K05: leaving the 基本信息 form with unsaved edits */}
      <EditorPendingInfoActionDialog
        open={pendingPuzzleInfoAction !== null}
        onOpenChange={(open) => !open && setPendingPuzzleInfoAction(null)}
        onResolve={resolvePendingPuzzleInfo}
      />

      {/* 发布确认（与地图同一套：版本号可填、dirty 时「保存并发布」） */}
      <AlertDialog
        open={publishOpen}
        onOpenChange={(open) => {
          if (!open && !publishMutation.isPending) setPublishOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              发布为 v{versionInput.trim() === '' ? nextVersionNo : versionInput.trim()}？
            </AlertDialogTitle>
            <AlertDialogDescription>
              将新增一个带 v{versionInput.trim() === '' ? nextVersionNo : versionInput.trim()}{' '}
              标记的谜题版本，出现在谜题列表中，可以部署为游戏。当前草稿不会被覆盖，你可以继续编辑并发布下一版。
              发布后该版本不可修改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="puzzle-publish-version" className="text-sm font-medium">
              版本号
            </label>
            <Input
              id="puzzle-publish-version"
              inputMode="numeric"
              value={versionInput}
              disabled={publishMutation.isPending}
              onChange={(event) => {
                setVersionInput(event.target.value);
                setVersionError(null);
              }}
              onBlur={() => setVersionError(validateVersion(versionInput))}
            />
            <p className={versionError ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              {versionError ?? `默认 v${nextVersionNo}，可改成任意正整数（不必连续）。`}
            </p>
          </div>
          {puzzle.dirty ? (
            <p className="text-xs text-muted-foreground">有未保存的修改，将先保存再发布。</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={publishMutation.isPending}
              onClick={(event) => {
                // 请求在飞时保持弹窗打开。
                event.preventDefault();
                confirmPublish();
              }}
            >
              {publishMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  发布中…
                </>
              ) : puzzle.dirty ? (
                '保存并发布'
              ) : (
                '确认发布'
              )}
            </AlertDialogAction>
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

      <PuzzleVersionHistoryDialog
        puzzleId={valid ? id : null}
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        currentVersionNo={detail?.currentVersionNo ?? null}
        onPreview={(version) => {
          setVersionsOpen(false);
          navigate(`/puzzles/${version.id}/view`);
        }}
      />

      <EditorUnsavedLeaveDialog guard={leaveGuard} />
    </div>
  );
}
