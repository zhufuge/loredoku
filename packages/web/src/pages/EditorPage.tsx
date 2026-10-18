import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_CELL_SIZE,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  mapDraftSchema,
  type DraftRegion,
  type EditorTool,
  type Item,
  type MapDraft,
  type MapStyle,
  type RegionShape,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EditorCanvas, type EditorCanvasHandle } from '@/components/editor/EditorCanvas';
import { EditorLeftPanel } from '@/components/editor/EditorLeftPanel';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { EditorBottomBar } from '@/components/editor/EditorBottomBar';
import { EditorInfoDrawer } from '@/components/editor/EditorInfoDrawer';
import {
  EditorErrorState,
  EditorImportInput,
  EditorLoadingState,
  EditorPendingInfoActionDialog,
  EditorSaveMask,
  EditorUnsavedLeaveDialog,
} from '@/components/editor/EditorShell';
import {
  MapInfoDrawer,
  type MapInfoDrawerHandle,
} from '@/components/editor/MapInfoDrawer';
import { MapInitDialog } from '@/components/editor/MapInitDialog';
import { RegionDialog } from '@/components/editor/RegionDialog';
import { RegionSelectionBar } from '@/components/editor/RegionSelectionBar';
import { VersionHistoryDialog } from '@/components/editor/VersionHistoryDialog';
import { useItems } from '@/hooks/useItems';
import { useProjectMap, useSaveMap, useUpdateGridSize, useImportMap } from '@/hooks/useMap';
import { usePublishProject, useForkVersion, useVersionDetail, useVersions } from '@/hooks/useVersions';
import { useEditorPublish } from '@/hooks/useEditorPublish';
import { useEditorResize } from '@/hooks/useEditorResize';
import { useEditorSave } from '@/hooks/useEditorSave';
import { useEditorShortcuts } from '@/hooks/useEditorShortcuts';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { clampZoom, isInBounds, zoomAtPoint, ZOOM_STEP } from '@/lib/grid';
import { canPlaceItemOnLayer } from '@/lib/canvasLayers';
import { infoDrawerOpen, reduceEditorFocus } from '@/lib/editorFocus';
import { resolveEditorInit } from '@/lib/editorInit';
import type { Coord } from '@/lib/region';
import { isConnected } from '@/lib/region';
import { cn } from '@/lib/utils';
import { useEditorStore, type ConflictMode, type RegionInput } from '@/stores/editorStore';

interface RegionDialogState {
  open: boolean;
  mode: 'create' | 'edit';
  cells: Coord[];
  region: DraftRegion | null;
}

/**
 * v0.5.0 SPEC-K12 (docs/v0.5.0.md §9.1): the map editor is 只编辑地图 again.
 *
 * The roster, the participant panel, the participant drawer and the whole
 * linkage-highlight chain moved to the puzzle editor — the map no longer owns a
 * participant. `editorStore` follows suit (§9.2), so everything below reads
 * canvas state only.
 */
export function EditorPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = Number(projectId);

  /**
   * v0.5.8 §13: `?v={n}` = 「以此为底稿新建」的 fork 态 —— 版本条目从列表
   * 直达这里，快照装进本地 store，**保存时才生成草稿**。没有 `?v=` 就是
   * 普通的工作条目编辑。
   */
  const forkFrom = useMemo(() => {
    const raw = searchParams.get('v');
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  const editor = useEditorStore();

  const mapQuery = useProjectMap(id);
  const itemsQuery = useItems({ isActive: true });
  const versionsQuery = useVersions(Number.isFinite(id) ? id : null);
  /**
   * v0.5.8 §13: fork 态的数据源是**版本快照**，不是工作条目草稿 —— 草稿可能
   * 还没初始化（`null`），而能发布出去的版本必然带完整 data。
   */
  const versionQuery = useVersionDetail(forkFrom !== null && Number.isFinite(id) ? id : null, forkFrom);
  const saveMutation = useSaveMap();
  const resizeMutation = useUpdateGridSize();
  const importMutation = useImportMap();
  const publishMutation = usePublishProject(id);
  /** fork 态的保存 mutation：不自己跳转，由 {@link persist} 收尾。 */
  const forkSaveMutation = useForkVersion({ navigate: false });
  const leaveGuard = useUnsavedChangesGuard(editor.dirty);

  const canvasRef = useRef<EditorCanvasHandle | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const initKeyRef = useRef<number | null>(null);
  const mapInfoRef = useRef<MapInfoDrawerHandle | null>(null);
  /**
   * v0.5.8: 「初始化地图」弹窗的两件事 —— 写尺寸进行中，以及「这次文件选择
   * 来自初始化弹窗」（那条路直接调导入接口，不走「覆盖当前画布」的二次确认，
   * 因为此时画布还是空的）。
   */
  const [initPending, setInitPending] = useState(false);
  const initImportRef = useRef(false);
  /**
   * FEAT-E01: a drawer switch (or a close) that is waiting for the user to
   * decide what happens to unsaved 基本信息 edits.
   */
  const [pendingMapInfoAction, setPendingMapInfoAction] = useState<(() => void) | null>(null);

  const [spaceHeld, setSpaceHeld] = useState(false);
  const [regionShape, setRegionShape] = useState<RegionShape>('rect');
  const [itemsOpen, setItemsOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  /** v0.3.8 FEAT-D01: the 「地图基本信息」drawer. */
  const [mapInfoOpen, setMapInfoOpen] = useState(false);
  /** FEAT-D03: the adaptive value the canvas last computed. */
  const [autoCellSize, setAutoCellSize] = useState<number>(DEFAULT_CELL_SIZE);
  const [regionAnchorActive, setRegionAnchorActive] = useState(false);
  const [regionDialog, setRegionDialog] = useState<RegionDialogState>({
    open: false,
    mode: 'create',
    cells: [],
    region: null,
  });
  const [deleteRegionTarget, setDeleteRegionTarget] = useState<DraftRegion | null>(null);
  const [regionError, setRegionError] = useState<string | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<MapDraft | null>(null);
  const [rulerVisible, setRulerVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('loredoku.editor.ruler') !== 'hidden';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('loredoku.editor.ruler', rulerVisible ? 'visible' : 'hidden');
    }
  }, [rulerVisible]);

  const itemsById = useMemo(() => {
    const map = new Map<number, Item>();
    for (const item of itemsQuery.data ?? []) map.set(item.id, item);
    return map;
  }, [itemsQuery.data]);

  const pendingItem = useMemo(
    () => (editor.selectedItemId === null ? null : itemsById.get(editor.selectedItemId) ?? null),
    [editor.selectedItemId, itemsById],
  );

  /**
   * v0.5.6: the save / publish / resize flows are hooks now. The page keeps
   * only what is specific to the map editor: the 基本信息 form, the FIX-F03
   * first-entry save, the canvas callbacks and the dialogs' JSX.
   */
  const { persist: persistDraft, save: saveDraft, saving: savePending, saveMaskVisible } =
    useEditorSave({
      id,
      mutation: saveMutation,
      buildPayload: () => ({ data: editor.toDraft(), updatedAt: editor.updatedAt }),
      onSaved: (data) => {
        editor.markSaved(data.updatedAt ?? new Date().toISOString());
        editor.setVersionInfo({
          currentVersionNo: data.project.currentVersionNo,
          status: data.project.status,
        });
      },
    });

  /**
   * v0.5.8 §13: fork 态的保存 = 「fork 一行新草稿（带上编辑器当前画布）→ 把
   * store 标记成已保存 → replace 到新行的编辑器 URL」。换 URL 而不是留在原地
   * 是因为此后所有操作（再保存 / 发布 / 调整尺寸）都必须落在新行 id 上；
   * replace 不留历史，用户按返回不会回到这个中间态。
   *
   * 没保存就离开 → 什么都没发生（这正是「保存时才生成草稿」的意义）。
   */
  const forkAndSave = async (): Promise<boolean> => {
    if (forkFrom === null || forkSaveMutation.isPending) return false;
    try {
      const project = await forkSaveMutation.mutateAsync({
        id,
        versionNo: forkFrom,
        data: editor.toDraft(),
      });
      editor.markSaved(project.updatedAt);
      editor.setVersionInfo({
        currentVersionNo: project.currentVersionNo,
        status: project.status,
      });
      // 换 URL 必须等 React 把 dirty=false flush 掉：`useBlocker` 的判定读的是
      // 渲染闭包里的 dirty，同一 continuation 里 navigate 会拿旧值把自己拦下
      // （弹「有未保存更改」）。setTimeout(0) 落在 flush 之后。
      window.setTimeout(() => navigate(`/maps/${project.id}/edit`, { replace: true }), 0);
      return true;
    } catch {
      /* errors surfaced via mutation toasts */
      return false;
    }
  };

  const persist = async (): Promise<boolean> =>
    forkFrom !== null ? forkAndSave() : persistDraft();

  const save = (): void => {
    void persist();
  };

  /** fork 期间也亮保存中（mask + 按钮禁用），两次写入用户眼里是一次保存。 */
  const saving = savePending || forkSaveMutation.isPending;
  const maskVisible = saveMaskVisible || forkSaveMutation.isPending;

  const {
    resizeOpen,
    setResizeOpen,
    resizeValue,
    setResizeValue,
    resizePending,
    resizeImpact,
    confirmResize,
  } = useEditorResize({
    id,
    gridSize: editor.gridSize,
    cells: editor.cells,
    regions: editor.regions,
    itemsById,
    dirty: editor.dirty,
    saving,
    persist,
    resizeMutation,
  });

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
    currentVersionNo: editor.currentVersionNo,
    dirty: editor.dirty,
    saving,
    persist,
    publishMutation,
  });

  /**
   * v0.5.8 §13: fork 态点「发布」= 先落盘成草稿，再请用户点一次发布。发布
   * 必须发生在**新行**上，而 `publishMutation` 在 hook 创建时就绑定了旧 id
   * （工作条目），fork 后它的上下文已经过期 —— 与其把发布链路整个挪进
   * continuation（闭包里的 id / versions 全是旧的），不如让用户在新编辑器里
   * 再点一次，状态全部是新的。
   */
  const handlePublishClick = (): void => {
    if (forkFrom === null) {
      openPublishConfirm();
      return;
    }
    void (async () => {
      if (await persist()) {
        toast.success('已生成草稿', { description: '请再次点击「发布」' });
      }
    })();
  };

  /**
   * BUG-G01 (docs/v0.4.0.md §1): a click on a cell writes **both** `selection`
   * and `selectedRegionId` (see `EditorCanvas.selectCellAt`), so this effect
   * must not blindly re-open the info drawer — otherwise closing the
   * 「地图基本信息」drawer (which clears those axes) makes the empty-state info
   * drawer pop back up underneath it.
   */
  useEffect(() => {
    if (mapInfoOpen) {
      setInfoOpen(false);
      return;
    }
    if (editor.selection || editor.selectedRegionId !== null) {
      setInfoOpen(true);
    } else {
      setInfoOpen(false);
    }
  }, [editor.selection, editor.selectedRegionId, mapInfoOpen]);

  /**
   * v0.5.8 §13: fork 态（`?v={n}`）整段让位给版本快照 —— 快照是已发布版本
   * 的完整 data，装进本地 store 即可开改，**不写任何库表**。草稿删除 /
   * 未初始化都不影响这条路：数据源是 `map_versions` 行，不是工作条目。
   */
  useEffect(() => {
    if (forkFrom !== null) {
      const snapshot = versionQuery.data;
      if (!snapshot) return;
      const action = resolveEditorInit({
        loadedProjectId: initKeyRef.current,
        projectId: id,
        storedUpdatedAt: editor.updatedAt,
        fetchedUpdatedAt: snapshot.publishedAt,
        storedVersionNo: editor.currentVersionNo,
        fetchedVersionNo: snapshot.versionNo,
        storedStatus: editor.status,
        fetchedStatus: 'draft',
      });
      if (action === 'none') return;
      if (action === 'sync-version') {
        editor.setVersionInfo({ currentVersionNo: snapshot.versionNo, status: 'draft' });
        return;
      }
      initKeyRef.current = id;
      editor.init(id, snapshot.data, {
        updatedAt: snapshot.publishedAt,
        currentVersionNo: snapshot.versionNo,
        status: 'draft',
      });
      return;
    }

    const data = mapQuery.data;
    if (!data) return;
    /**
     * v0.5.8: `draft === null` = 这张地图还没初始化。此时不 init、不保存 ——
     * 页面主体让位给 {@link MapInitDialog}，由用户决定填尺寸还是导入。
     */
    if (data.draft === null) return;
    /**
     * FIX-E01 (docs/v0.3.9.md §1): publishing bumps `currentVersionNo` /
     * `status` on the project row and invalidates this query, but it does **not**
     * touch the draft. Only a changed draft triggers a real re-init (which
     * resets zoom / pan); a metadata-only change just refreshes the version
     * badge, so the canvas stays exactly where the user left it.
     */
    const action = resolveEditorInit({
      loadedProjectId: initKeyRef.current,
      projectId: id,
      storedUpdatedAt: editor.updatedAt,
      fetchedUpdatedAt: data.updatedAt,
      storedVersionNo: editor.currentVersionNo,
      fetchedVersionNo: data.project.currentVersionNo,
      storedStatus: editor.status,
      fetchedStatus: data.project.status,
    });
    if (action === 'none') return;
    if (action === 'sync-version') {
      editor.setVersionInfo({
        currentVersionNo: data.project.currentVersionNo,
        status: data.project.status,
      });
      return;
    }
    initKeyRef.current = id;
    editor.init(id, data.draft, {
      updatedAt: data.updatedAt,
      currentVersionNo: data.project.currentVersionNo,
      status: data.project.status,
    });
  }, [forkFrom, versionQuery.data, mapQuery.data, id, editor]);

  /**
   * FEAT-E01 (docs/v0.3.9.md §3): the 「地图基本信息」drawer is a form, so
   * leaving it with unsaved edits has to be confirmed. Every path that closes
   * the drawer or hands focus to another panel goes through this guard.
   *
   * BUG-G01 (v0.4.0 验收补充): leaving for a cell / region label must **close**
   * the drawer, not just run the action — otherwise the drawer stays on top and
   * keeps the info drawer suppressed.
   */
  const guardMapInfo = (proceed: () => void): void => {
    if (!mapInfoOpen) {
      proceed();
      return;
    }
    if (!mapInfoRef.current?.isDirty()) {
      setMapInfoOpen(false);
      proceed();
      return;
    }
    setPendingMapInfoAction(() => proceed);
  };

  const commitMapInfo = (next: MapStyle, nextGridSize: number): void => {
    const gridSizeChanged = nextGridSize !== editor.gridSize;
    editor.setMapStyle(() => next);
    // FIX-F01: the canvas size is part of the same form now, so it is applied
    // locally (undoable, immediate visual feedback) and then persisted below.
    if (gridSizeChanged) editor.setGridSize(nextGridSize);
    setMapInfoOpen(false);
    void (async () => {
      // The style (and everything else) goes first, so the resize that follows
      // re-seeds the editor from a draft that already carries the new style.
      if (!(await persist())) return;
      if (!gridSizeChanged) return;
      try {
        const result = await resizeMutation.mutateAsync({ id, gridSize: nextGridSize });
        const { background, object, regions } = result.removed;
        if (background + object + regions > 0) {
          toast.message('画布已调整', {
            description: `已移除越界内容：背景 ${background}、物体 ${object}、区域 ${regions}`,
          });
        } else {
          toast.success('已保存地图基本信息');
        }
      } catch {
        /* errors surfaced via mutation toasts; keep the drawer closed */
      }
    })();
  };

  const closeMapInfo = (): void => {
    guardMapInfo(() => setMapInfoOpen(false));
  };

  /** Runs the deferred switch, saving first when the user asked to. */
  const resolvePendingMapInfo = (mode: 'save' | 'discard'): void => {
    const action = pendingMapInfoAction;
    setPendingMapInfoAction(null);
    if (mode === 'save') mapInfoRef.current?.save();
    else {
      mapInfoRef.current?.discard();
      setMapInfoOpen(false);
    }
    action?.();
  };

  const setTool = (tool: EditorTool): void => {
    editor.setTool(tool);
    if (tool !== 'select') {
      editor.setSelectedItem(null);
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

  const previewCellSize = Math.max(3, Math.floor(180 / editor.gridSize));
  const panelsLocked = editor.activeTool === 'region';
  const panelsDisabled = editor.activeTool === 'eraser';

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

  /**
   * v0.5.8 §3: 初始化弹窗的「填尺寸」。复用改尺寸那条路 —— 服务端在草稿为
   * 空时新建一份只带 `gridSize` 的草稿，成功后 query 失效重拉，`draft` 不再
   * 是 `null`，页面主体随即渲染。
   */
  const handleInitSize = (gridSize: number): void => {
    setInitPending(true);
    resizeMutation.mutateAsync({ id, gridSize }).finally(() => setInitPending(false));
  };

  /** v0.5.8 §3: 初始化弹窗的「导入地图」—— 打开隐藏的文件选择框。 */
  const handleInitImport = (): void => {
    initImportRef.current = true;
    importInputRef.current?.click();
  };

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void (async () => {
      try {
        const parsed: unknown = JSON.parse(await file.text());
        /**
         * SPEC-K14 §8.4 (Q12): a v2 file still carries `characterSlots` /
         * `style.linkageColors`. `mapDraftSchema` is `.strict()`, so it is
         * rejected — and the author is told **why** instead of being left with
         * a bare 「JSON 格式不正确」 (a silent strip would look like the
         * participants had been imported).
         */
        const raw =
          typeof parsed === 'object' && parsed !== null
            ? (parsed as Record<string, unknown>)
            : null;
        const styleBlock =
          raw && typeof raw.style === 'object' && raw.style !== null
            ? (raw.style as Record<string, unknown>)
            : null;
        if (raw && ('characterSlots' in raw || (styleBlock && 'linkageColors' in styleBlock))) {
          toast.error('该 JSON 是旧版（含参与者 / 联动主题色），请先移除这两部分，或改用导入到谜题');
          return;
        }
        const result = mapDraftSchema.safeParse(parsed);
        if (!result.success) {
          toast.error('JSON 格式不正确');
          return;
        }
        // 初始化流程：画布还是空的，没有「覆盖」可言，直接写入草稿。
        if (initImportRef.current) {
          initImportRef.current = false;
          importMutation.mutate({ id, data: result.data as MapDraft });
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

  /**
   * v0.5.6: the keys both canvases share live in `useEditorShortcuts`
   * (Ctrl+S / Space / Ctrl+Z / Ctrl+0 / arrows); what stays here is the part
   * that is specific to the writable map canvas.
   */
  const handleEditorEscape = (): void => {
    if (mapInfoOpen) {
      // FEAT-E01: Esc leaves the info drawer first — and asks when there
      // are unsaved edits. It does not touch the cell focus.
      closeMapInfo();
      return;
    }
    editor.setSelection(null);
    editor.setSelectedItem(null);
    if (editor.activeTool !== 'region') editor.clearDraftSelection();
  };

  /** Map-only keys — erase and the tool switches. `true` = handled. */
  const handleEditorKey = (event: KeyboardEvent): boolean => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const selection = editor.selection;
      if (selection && selection.type === 'cell') {
        event.preventDefault();
        editor.eraseAt(selection.x, selection.y);
      }
      return true;
    }
    if (event.key === 'v' || event.key === 'V') setTool('select');
    else if (event.key === 'r' || event.key === 'R') setTool('region');
    else if (event.key === 'e' || event.key === 'E') setTool('eraser');
    // FEAT-E03: no pan-tool shortcut any more — drag the empty area outside
    // the board (or hold Space) to pan.
    return false;
  };

  const moveSelection = (dx: number, dy: number): void => {
    const selection = editor.selection;
    if (!selection || selection.type !== 'cell') return;
    const next = { x: selection.x + dx, y: selection.y + dy };
    if (isInBounds(next, editor.gridSize)) {
      editor.setSelection({ type: 'cell', x: next.x, y: next.y });
    }
  };

  useEditorShortcuts({
    save,
    undo: editor.undo,
    redo: editor.redo,
    centerView: () => canvasRef.current?.centerView(),
    moveSelection,
    onSpaceHeldChange: setSpaceHeld,
    onEscape: handleEditorEscape,
    onKey: handleEditorKey,
  });

  // v0.5.8 §13: fork 态的 `?v=` 指向一个不存在的版本时也要走错误态 ——
  // 否则 versionQuery 永远不 resolve，页面转圈到天荒地老。
  if (!Number.isFinite(id) || mapQuery.isError || (forkFrom !== null && versionQuery.isError)) {
    return (
      <EditorErrorState
        message={forkFrom !== null ? '地图版本不存在或加载失败。' : '地图不存在或加载失败。'}
        backLabel="返回地图列表"
        onBack={() => navigate('/projects')}
      />
    );
  }

  const project = mapQuery.data?.project;

  // v0.5.8 §13: fork 态还要多等一个版本快照（数据源换成 map_versions 行）。
  if (mapQuery.isLoading || !project || (forkFrom !== null && versionQuery.isLoading)) {
    return <EditorLoadingState />;
  }

  /**
   * v0.5.8 §3: 没初始化过的地图没有画布可渲染 —— 整个页面主体让位给初始化
   * 弹窗（所有 hooks 都已在上面跑完，这里的提前返回不违反 hooks 规则）。
   *
   * v0.5.8 §13: fork 态跳过这条 —— 画布来自版本快照（必然带 data），与工作
   * 条目草稿初始化与否无关。
   */
  if (forkFrom === null && mapQuery.data?.draft == null) {
    return (
      <MapInitDialog
        mapName={project.name}
        pending={initPending || importMutation.isPending}
        onInitSize={handleInitSize}
        onImport={handleInitImport}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <EditorImportInput inputRef={importInputRef} onChange={handleImportFile} />

      {/* v0.5.8 §13: fork 态横幅 —— 用户必须随时知道「我现在改的是旧版本的
          副本，没保存就不落库，保存后会另存一条草稿」。 */}
      {forkFrom !== null ? (
        <div className="flex items-center gap-2 border-b bg-secondary/50 px-4 py-1.5 text-xs text-muted-foreground">
          <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
            基于 v{forkFrom}
          </span>
          正在基于已发布版本编辑 · 保存后将生成新草稿（不会改动原版本）
        </div>
      ) : null}

      <EditorToolbar
        projectName={project.name}
        dirty={editor.dirty}
        saving={saving}
        publishing={publishMutation.isPending}
        status={editor.status}
        currentVersionNo={editor.currentVersionNo}
        onBack={() => navigate('/projects')}
        onSave={save}
        onPublish={handlePublishClick}
        onOpenVersions={() => setVersionsOpen(true)}
        mapInfoOpen={mapInfoOpen}
        onOpenMapInfo={() => {
          if (mapInfoOpen) {
            closeMapInfo();
            return;
          }
          // FEAT-D01: opening it drops any cell / region focus.
          // BUG-G01: `selectedRegionId` belongs to the same set of focus axes —
          // a click on a cell inside a region sets it too (EditorCanvas
          // .selectCellAt), so leaving it behind re-opened the info drawer
          // through the effect below and left an empty panel on screen.
          setMapInfoOpen(true);
          editor.setSelection(null);
          editor.setSelectedRegion(null);
          setInfoOpen(false);
        }}
        onExport={exportToFile}
        onImport={() => importInputRef.current?.click()}
      />

      <div className="relative flex min-h-0 flex-1">
        <EditorSaveMask saving={saving} visible={saveMaskVisible} />

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
              activeLayer={editor.activeLayer}
              selectedItemId={editor.selectedItemId}
              regions={editor.regions}
              selectedRegionId={editor.selectedRegionId}
              onSetTool={setTool}
              onSetLayer={(layer) => {
                editor.setLayer(layer);
                editor.setSelectedItem(null);
              }}
              onSelectItem={(item) => editor.setSelectedItem(item ? item.id : null)}
              onSelectRegion={editor.setSelectedRegion}
              onEditRegion={(region) => {
                editor.setSelectedRegion(region.id);
                setRegionDialog({ open: true, mode: 'edit', cells: region.cells, region });
              }}
              onDeleteRegion={setDeleteRegionTarget}
            />
          </div>
        ) : null}

        <main className="relative min-h-0 flex-1">
          <EditorCanvas
            ref={canvasRef}
            gridSize={editor.gridSize}
            cells={editor.cells}
            itemsById={itemsById}
            regions={editor.regions}
            style={editor.style}
            onAutoCellSize={setAutoCellSize}
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
            // SPEC-K12 §9.1: the map editor has no participants, so there is
            // no linkage highlight to show — the layer stays empty.
            highlight={null}
            onSelect={(selection) => {
              // OPT-C07: clicking the board hands the focus to the cell.
              // FEAT-E01: switching away from the info drawer is confirmed first.
              guardMapInfo(() => editor.setSelection(selection));
            }}
            onSelectRegion={(regionId) => {
              // OPT-C07 / BUG-G01: a region label click is a focus switch too,
              // so it leaves the basic-info drawer the same way a cell does.
              guardMapInfo(() => editor.setSelectedRegion(regionId));
            }}
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
              // OPT-904 §4.1: the placement layer must match the item category
              // (the background layer only accepts `category === 'background'`).
              if (!canPlaceItemOnLayer(pendingItem, editor.activeLayer)) {
                toast.error('该物品不能放在当前图层');
                return;
              }
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
            open={infoDrawerOpen({ infoOpen, mapInfoOpen, selectedSlotIndex: null })}
            onClose={() => setInfoOpen(false)}
            onOpen={() => setInfoOpen(true)}
            selection={editor.selection}
            cells={editor.cells}
            regions={editor.regions}
            itemsById={itemsById}
            onClearCell={(x, y) => editor.clearCell(x, y)}
            onClearObject={(x, y) => editor.clearObjectAt(x, y)}
            onEditRegion={(region) => {
              editor.setSelectedRegion(region.id);
              setRegionDialog({ open: true, mode: 'edit', cells: region.cells, region });
            }}
            onDeleteRegion={setDeleteRegionTarget}
            onLocateRegion={() => canvasRef.current?.centerView()}
          />

          <MapInfoDrawer
            ref={mapInfoRef}
            open={mapInfoOpen}
            gridSize={editor.gridSize}
            autoCellSize={autoCellSize}
            style={editor.style}
            onRequestClose={closeMapInfo}
            onCommit={commitMapInfo}
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
        defaultBorderWidth={editor.style.regionOutline.width}
        onSubmit={submitRegion}
      />

      <VersionHistoryDialog
        projectId={id}
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        currentVersionNo={editor.currentVersionNo}
        onPreview={({ projectId: ownerId, versionNo }) =>
          navigate(`/maps/${ownerId}/views?v=${versionNo}`)
        }
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

            {resizeImpact.items.length + resizeImpact.regions.length > 0 ? (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <p className="mb-1 font-medium">将被移除：</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {[...resizeImpact.items, ...resizeImpact.regions].map((line, index) => (
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

      {/* SPEC-K13 §7.4: 发布前确认（v0.5.8 去掉备注输入框；v0.5.8 第三阶段把
          版本号变成可填的输入框，默认血统 MAX+1；dirty 时分形态为「保存并发布」） */}
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
              标记的地图条目，出现在地图列表中；当前工作条目不会被覆盖，你可以继续编辑并发布下一版。
              发布后该版本不可修改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="publish-version" className="text-sm font-medium">
              版本号
            </label>
            <Input
              id="publish-version"
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
          {editor.dirty ? (
            <p className="text-xs text-muted-foreground">有未保存的修改，将先保存再发布。</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={publishMutation.isPending}
              onClick={(event) => {
                // Keep the dialog up while the request is in flight.
                event.preventDefault();
                confirmPublish();
              }}
            >
              {publishMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  发布中…
                </>
              ) : editor.dirty ? (
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

      {/* FEAT-E01: leaving the 「地图基本信息」form with unsaved edits */}
      <EditorPendingInfoActionDialog
        open={pendingMapInfoAction !== null}
        onOpenChange={(open) => !open && setPendingMapInfoAction(null)}
        onResolve={resolvePendingMapInfo}
      />

      <EditorUnsavedLeaveDialog guard={leaveGuard} />
    </div>
  );
}
