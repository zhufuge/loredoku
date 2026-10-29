import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { toast } from 'sonner';
import {
  DEFAULT_CELL_SIZE,
  prunePuzzleReferences,
  puzzleDraftSchema,
  validatePuzzleReferences,
  type Character,
  type CharacterSlotEntry,
  type Asset,
  type ParticipantTarget,
  type PublishedMapVersion,
  type PuzzleDraft,
  type PuzzleMapContext,
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
import { PuzzleMapSwapDialog } from '@/components/puzzle/PuzzleMapSwapDialog';
import { PuzzleVersionHistoryDialog } from '@/components/puzzle/PuzzleVersionHistoryDialog';
import {
  PuzzleEditorLeftPanel,
  RosterExpandButton,
  type PuzzleEditorLeftPanelHandle,
} from '@/components/puzzle/PuzzleEditorLeftPanel';
import {
  PuzzleInfoDrawer,
  type PuzzleBasicInfo,
  type PuzzleInfoDrawerHandle,
} from '@/components/puzzle/PuzzleInfoDrawer';
import { useCharacters } from '@/hooks/useCharacters';
import { useAssets } from '@/hooks/useAssets';
import { useHighlight } from '@/hooks/useHighlight';
import {
  useForkPuzzleVersion,
  usePublishPuzzle,
  usePuzzle,
  usePuzzleMapContext,
  usePuzzleVersions,
  useRemovePuzzleCover,
  useSavePuzzle,
  useUploadPuzzleCover,
} from '@/hooks/usePuzzles';
import { useEditorPublish } from '@/hooks/useEditorPublish';
import { useEditorSave } from '@/hooks/useEditorSave';
import { useEditorShortcuts } from '@/hooks/useEditorShortcuts';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { versionKeys } from '@/hooks/useVersions';
import { versionsApi } from '@/api/versions';
import { infoDrawerOpen, reduceEditorFocus, type EditorFocus } from '@/lib/editorFocus';
import { resolveHighlight } from '@/lib/highlight';
import { resolveMapStyle } from '@/lib/mapStyle';
import { LoredokuTick } from '@/components/common/LoredokuLoader';
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
 * There is no 「调整画布尺寸」 dialog: the canvas inside the puzzle is a copy the
 * author never edits from here (SPEC-K11).
 *
 * v0.7.2 §3：`?v={n}` = 「编辑此版本」的 fork 态。进来**不建行**（版本行只读，
 * 谁都写不脏），点「保存」才带着当前草稿 fork 出一条新草稿行，随后 replace 到
 * 新行的 URL。没落库之前没有发布按钮 —— 这一屏既不是草稿也不是版本。
 */
export function PuzzleEditorPage(): JSX.Element {
  const { puzzleId } = useParams<{ puzzleId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = Number(puzzleId);
  const valid = Number.isFinite(id) && id > 0;

  /**
   * `?v={n}` = fork 态：`:puzzleId` 仍然是**被点的那一行自己的 id**（版本行是
   * 一条完整的 `puzzles` 行，带整份画布副本），`?v=` 只用来标记「这一屏还没落库」。
   */
  const forkFrom = useMemo(() => {
    const raw = searchParams.get('v');
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  const puzzle = usePuzzleStore();
  const queryClient = useQueryClient();

  const detailQuery = usePuzzle(valid ? id : null);
  const mapQuery = usePuzzleMapContext(valid ? id : null);
  // The referenced snapshot may point at items / characters that are inactive
  // now, so both lists are unfiltered (same rule as the work preview page).
  const assetsQuery = useAssets({});
  const charactersQuery = useCharacters({});
  const saveMutation = useSavePuzzle();
  /** fork 态的保存 mutation：不自己跳转，由下面的 persist 收尾。 */
  const forkSaveMutation = useForkPuzzleVersion({ navigate: false });
  const versionsQuery = usePuzzleVersions(valid ? id : null);
  const publishMutation = usePublishPuzzle(id);
  /** 封面没有 JSON 通道，落库是「先保存草稿、再传文件」两步。 */
  const uploadCoverMutation = useUploadPuzzleCover();
  const removeCoverMutation = useRemovePuzzleCover();
  /** v0.7.3 §3：引入新地图的弹窗 + 取新画布时的忙碌态。 */
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapBusy, setSwapBusy] = useState(false);
  /**
   * v0.7.3 §2.2：抽屉提交的封面改动。它是**行字段**、不是草稿的一部分，且 fork 态
   * 下还没有可写的行，所以留在这里等草稿保存成功之后再上传。
   */
  const [pendingCover, setPendingCover] = useState<{ file: File | null; removed: boolean } | null>(
    null,
  );
  const coverDirty = pendingCover !== null;
  const leaveGuard = useUnsavedChangesGuard(puzzle.dirty || coverDirty);

  const canvasRef = useRef<EditorCanvasHandle | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const puzzleInfoRef = useRef<PuzzleInfoDrawerHandle | null>(null);
  /**
   * v0.7.13：角色列收起后整列都不渲染，「展开」的按钮搬到参与者标题行上。
   * 面板自己是这条状态的 owner（自动收起的记忆在里面），页面只拿一个镜像，
   * 用来决定那颗箭头要不要出现；真的展开还是叫面板自己做（`expand()`）。
   */
  const leftPanelRef = useRef<PuzzleEditorLeftPanelHandle | null>(null);
  const [rosterCollapsed, setRosterCollapsed] = useState(false);

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
   * v0.7.3 §3.4：底图**来源**恒发。服务端按「与存量相同就短路」处理，所以没换过
   * 底图时零查询、也不会因为地图版本后来被删而存不进去；换过之后这里就是新版本，
   * 保存时服务端据此重读一次画布（画布永远不由客户端提供）。
   */
  const mapSource = puzzle.mapContext
    ? { mapId: puzzle.mapContext.mapId, versionNo: puzzle.mapContext.versionNo }
    : undefined;

  /**
   * 封面的第二步：草稿已经落库（fork 态时是刚生成的新行），现在才有 id 可传。
   * 失败由 mutation 自己 toast —— 草稿本身已经保存成功，不该因此拦下整次保存。
   */
  const applyPendingCover = async (
    targetId: number,
    choice: { file: File | null; removed: boolean },
  ): Promise<void> => {
    setPendingCover(null);
    try {
      if (choice.file) await uploadCoverMutation.mutateAsync({ id: targetId, file: choice.file });
      else if (choice.removed) await removeCoverMutation.mutateAsync(targetId);
    } catch {
      /* errors surfaced via mutation toasts */
    }
  };

  /**
   * FIX-F01's single writer is shared with the map editor. The puzzle side keeps
   * its FIX-O18 bookkeeping (remember the `updatedAt` this very save wrote back,
   * so the detail query's answer is not mistaken for a foreign write).
   */
  const { persist, save, saving, saveMaskVisible } = useEditorSave({
    id,
    /**
     * fork 态把「保存」换成 fork：同一个按钮、同一个遮罩，落库后由 `onSaved`
     * 收尾（换身份 + replace 到新行）。两条路都返回 `PuzzleDetail`，所以调用方
     * 看到的是一次保存。
     */
    mutation: {
      isPending: saveMutation.isPending || forkSaveMutation.isPending,
      mutateAsync: async (vars) => {
        if (forkFrom !== null) {
          return forkSaveMutation.mutateAsync({
            id,
            versionNo: forkFrom,
            data: vars.payload.data,
            mapSource,
          });
        }
        return saveMutation.mutateAsync(vars);
      },
    },
    buildPayload: () => ({ data: puzzle.toDraft(), updatedAt: puzzle.updatedAt, mapSource }),
    onSaved: (data) => {
      const savedAt = data.updatedAt ?? new Date().toISOString();
      lastSavedAtRef.current = savedAt;
      /**
       * 封面在草稿之后：fork 态这一刻才有新行 id，普通保存也是「先写 JSON、
       * 再传文件」（上传端点认 id）。
       */
      if (pendingCover) void applyPendingCover(data.id, pendingCover);
      if (forkFrom !== null) {
        /**
         * 这一屏刚落库成一条**新草稿行**：只换身份，画布 / 撤销栈 / 视口都不动
         * （重新 `init` 会把缩放打回 1×、把历史清空，而内容一个字节都没变）。
         * `initKeyRef` 记下新 key，随后的 detail 到达不会再把 store 重播一遍。
         */
        initKeyRef.current = `${data.id}:${data.updatedAt ?? ''}`;
        puzzle.adoptSavedEntry(data);
        toast.success(`已基于 v${forkFrom} 生成新谜题`);
        /**
         * 换 URL 要等 React 把 dirty=false flush 掉：`useUnsavedChangesGuard`
         * 读的是渲染闭包里的 dirty，同一 continuation 里 navigate 会拿旧值把
         * 自己拦下。setTimeout(0) 落在 flush 之后；replace 不留中间态。
         */
        window.setTimeout(() => navigate(`/puzzles/${data.id}/edit`, { replace: true }), 0);
        return;
      }
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
   * SPEC-K05: the puzzle's 基本信息 drawer is a variant, so leaving it with
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

  /**
   * v0.6.3 §3 + v0.7.3 §2：基本信息抽屉的「保存」只应用本地草稿 —— 名称 / 描述 /
   * 布局 / 调色板进 store（可撤销），封面留成 `pendingCover`，等草稿落库后上传。
   */
  const commitPuzzleInfo = (next: PuzzleBasicInfo): void => {
    puzzle.setBasicInfo({
      name: next.name,
      description: next.description,
      clues: next.clues,
      ending: next.ending,
      linkageColors: next.linkageColors,
      characterSlots: next.characterSlots,
      rosterCols: next.rosterCols,
    });
    // 抽屉每次提交都带上当前的封面状态，所以只在真的变了时才改 pending。
    const coverChanged =
      next.coverFile !== (pendingCover?.file ?? null) ||
      next.coverRemoved !== (pendingCover?.removed ?? false);
    if (coverChanged) {
      setPendingCover(
        next.coverFile || next.coverRemoved
          ? { file: next.coverFile, removed: next.coverRemoved }
          : null,
      );
    }
    setPuzzleInfoOpen(false);
  };

  const closePuzzleInfo = (): void => {
    guardPuzzleInfo(() => setPuzzleInfoOpen(false));
  };

  /** Runs the deferred switch, saving first when the user asked to. */
  const resolvePendingPuzzleInfo = (mode: 'save' | 'discard'): void => {
    const action = pendingPuzzleInfoAction;
    setPendingPuzzleInfoAction(null);
    if (mode === 'save') {
      // 名称为空时抽屉拒绝提交 —— 留在原地让用户补完，别顺手切走。
      if (puzzleInfoRef.current?.save() === false) return;
    } else {
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
    // v0.7.13 §11：角色自带的参与者默认值在「加入」这一刻抄进槽位。角色没配
    // 就是两个 `null`，槽位照旧是白色 + 序号。
    const character = charactersById.get(characterId);
    puzzle.assignSlot(characterId, {
      themeColor: character?.color ?? null,
      displayNumber: character?.displayName ?? null,
    });
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
   * v0.7.3 §3：引入新地图。
   *
   * 只换底图 —— 画布取那份已发布版本的快照（`GET /api/maps/:id/versions/:n`），
   * 谜题自己的字段一个不动。指向旧画布的联动目标（`asset` / `region`）在新画布
   * 上不存在，与换底图**同一个撤销步**摘掉，否则这份草稿再也存不进去。
   */
  const swapMap = async (version: PublishedMapVersion): Promise<void> => {
    setSwapBusy(true);
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: versionKeys.detail(version.mapId, version.versionNo),
        queryFn: () => versionsApi.detail(version.mapId, version.versionNo),
      });
      if (detail.gridSize !== gridSize) {
        toast.error(`只能引入方格尺寸相同的地图版本（当前 ${gridSize} × ${gridSize}）`);
        return;
      }
      const context: PuzzleMapContext = {
        mapId: version.mapId,
        versionNo: version.versionNo,
        mapName: detail.mapName || version.mapName,
        gridSize: detail.gridSize,
        cells: detail.data.cells ?? {},
        regions: detail.data.regions ?? [],
        style: resolveMapStyle(detail.data.style),
      };
      const pruned = prunePuzzleReferences(puzzle.characterSlots, {
        cells: context.cells,
        regions: context.regions,
      });
      puzzle.replaceMapContext(context, pruned.slots);
      setPositionPickSlot(null);
      setSwapOpen(false);
      if (pruned.removed.length > 0) {
        toast.message('已引入新地图', {
          description: `${pruned.removed.length} 项联动目标在新地图上不存在，已一并移除（可撤销）`,
        });
      } else {
        toast.success(`已引入「${context.mapName}」v${version.versionNo}`);
      }
    } catch {
      toast.error('引入新地图失败，请稍后重试');
    } finally {
      setSwapBusy(false);
    }
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
        /**
         * fork 态（`?v={n}`，还没落库）这一屏既不是草稿也不是版本：状态徽标与
         * 发布按钮都不出现。保存生成新草稿行 → replace 到新行 URL →
         * `forkFrom` 变 null，二者一起回来。
         */
        status={forkFrom !== null ? null : puzzle.status}
        currentVersionNo={detail?.currentVersionNo ?? null}
        // fork 态下「保存」就是「生成新草稿」，没改过东西也要能点；只换了封面也一样。
        canSave={puzzle.dirty || coverDirty || forkFrom !== null}
        onBack={() => navigate('/puzzles')}
        onSave={save}
        onPublish={forkFrom === null ? openPublishConfirm : undefined}
        onOpenVersions={() => setVersionsOpen(true)}
        onImportMap={() => setSwapOpen(true)}
        mapInfoOpen={puzzleInfoOpen}
        infoTitle="谜题基本信息（名称、封面、描述、参与者布局、联动主题色）"
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

        {/* SPEC-K04: only the 角色 tab survives on this side.
            v0.7.13：收起时它渲染 `null`（不再留一条竖排细条），展开入口挪到下面
            参与者面板的标题行上。 */}
        <PuzzleEditorLeftPanel
          ref={leftPanelRef}
          onCollapsedChange={setRosterCollapsed}
          characters={charactersQuery.data}
          charactersLoading={charactersQuery.isLoading}
          charactersError={charactersQuery.isError}
          charactersRefreshing={charactersQuery.isFetching}
          onRefreshCharacters={() => void charactersQuery.refetch()}
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
          /*
           * v0.7.13：角色列收起之后，「展开角色列表」只剩这一个落点 —— 那颗
           * 箭头挂在「参与者 n/n」标题行的左侧（绝对定位，标题仍然居中）。
           */
          headerLeading={
            rosterCollapsed ? (
              <RosterExpandButton onClick={() => leftPanelRef.current?.expand()} />
            ) : undefined
          }
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
            pendingVariant={null}
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
            /**
             * v0.7.4：地图编辑器的面板改成占据空间，谜题编辑器保持浮层 ——
             * 这边的参与者面板与谜题基本信息都是浮层，只改一个反而更不一致。
             */
            layout="overlay"
            readOnly
          />

          <PuzzleInfoDrawer
            ref={puzzleInfoRef}
            open={puzzleInfoOpen}
            name={puzzle.name}
            description={puzzle.description}
            clues={puzzle.clues}
            ending={puzzle.ending}
            linkageColors={puzzle.linkageColors}
            characterSlots={puzzle.characterSlots}
            rosterCols={puzzle.rosterCols}
            coverUrl={detail?.coverUrl ?? null}
            coverFile={pendingCover?.file ?? null}
            coverRemoved={pendingCover?.removed ?? false}
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

      {/* SPEC-K05: leaving the 基本信息 variant with unsaved edits */}
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
                  <LoredokuTick className="mr-1" />
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

      <PuzzleMapSwapDialog
        open={swapOpen}
        onOpenChange={setSwapOpen}
        current={{
          mapId: mapContext.mapId,
          versionNo: mapContext.versionNo,
          mapName: mapContext.mapName,
          gridSize,
        }}
        busy={swapBusy}
        onConfirm={(version) => {
          void swapMap(version);
        }}
      />

      <EditorUnsavedLeaveDialog guard={leaveGuard} />
    </div>
  );
}
