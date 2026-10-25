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
  resolveAssetForm,
  type DraftRegion,
  type EditorTool,
  type Asset,
  type MapDraft,
  type MapStyle,
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
import { EditorCanvas, type EditorCanvasHandle } from '@/components/map-editor/EditorCanvas';
import { EditorLeftPanel } from '@/components/map-editor/EditorLeftPanel';
import { EditorToolbar } from '@/components/map-editor/EditorToolbar';
import { EditorBottomBar } from '@/components/map-editor/EditorBottomBar';
import { EditorInfoDrawer } from '@/components/map-editor/EditorInfoDrawer';
import {
  EditorErrorState,
  EditorImportInput,
  EditorLoadingState,
  EditorPendingInfoActionDialog,
  EditorSaveMask,
  EditorUnsavedLeaveDialog,
} from '@/components/map-editor/EditorShell';
import {
  MapInfoDrawer,
  type MapInfoDrawerHandle,
  type MapInfoEntryDraft,
} from '@/components/map-editor/MapInfoDrawer';
import { MapInitDialog } from '@/components/map-editor/MapInitDialog';
import { RegionDialog } from '@/components/map-editor/RegionDialog';
import { RegionSelectionBar } from '@/components/map-editor/RegionSelectionBar';
import { VersionHistoryDialog } from '@/components/map-editor/VersionHistoryDialog';
import { useAssets } from '@/hooks/useAssets';
import { useMapCanvas, useSaveMap, useUpdateGridSize, useImportMap } from '@/hooks/useMapCanvas';
import {
  useRemoveMapCover,
  useUpdateMap,
  useUploadMapCover,
} from '@/hooks/useMaps';
import { usePublishMap, useForkVersion, useVersionDetail, useVersions } from '@/hooks/useVersions';
import { useEditorPublish } from '@/hooks/useEditorPublish';
import { useEditorResize } from '@/hooks/useEditorResize';
import { useEditorSave } from '@/hooks/useEditorSave';
import { useEditorShortcuts } from '@/hooks/useEditorShortcuts';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { isInBounds } from '@/lib/grid';
import { canPlaceAssetOnLayer } from '@/lib/canvasLayers';
import { infoDrawerOpen, reduceEditorFocus, regionFocusSelection } from '@/lib/editorFocus';
import { resolveEditorInit } from '@/lib/editorInit';
import type { Coord } from '@/lib/region';
import { isConnected } from '@/lib/region';
import { useEditorStore, type ConflictMode, type RegionInput } from '@/stores/editorStore';

interface RegionDialogState {
  open: boolean;
  cells: Coord[];
}

/**
 * v0.5.0 SPEC-K12 (docs/v0.5.0.md §9.1): the map editor is 只编辑地图 again.
 *
 * The roster, the participant panel, the participant drawer and the whole
 * linkage-highlight chain moved to the puzzle editor — the map no longer owns a
 * participant. `editorStore` follows suit (§9.2), so everything below reads
 * canvas state only.
 */
export function MapEditorPage(): JSX.Element {
  const { mapId } = useParams<{ mapId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = Number(mapId);

  /**
   * `?v={n}` = 「以此为底稿新建」的 fork 态 —— 版本条目从列表
   * 直达这里，快照装进本地 store，**保存时才生成草稿**。没有 `?v=` 就是
   * 普通的工作条目编辑。
   */
  const forkFrom = useMemo(() => {
    const raw = searchParams.get('v');
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  const editor = useEditorStore();

  const mapQuery = useMapCanvas(id);
  const assetsQuery = useAssets({ isActive: true });
  const versionsQuery = useVersions(Number.isFinite(id) ? id : null);
  /**
   * fork 态的数据源是**版本快照**，不是工作条目草稿 —— 草稿可能
   * 还没初始化（`null`），而能发布出去的版本必然带完整 data。
   */
  const versionQuery = useVersionDetail(forkFrom !== null && Number.isFinite(id) ? id : null, forkFrom);
  const saveMutation = useSaveMap();
  const resizeMutation = useUpdateGridSize();
  const importMutation = useImportMap();
  const publishMutation = usePublishMap(id);
  /** fork 态的保存 mutation：不自己跳转，由 {@link persist} 收尾。 */
  const forkSaveMutation = useForkVersion({ navigate: false });
  /** 基本信息（名称 / 描述 / 封面）—— 只在右上角「保存」时才发请求。 */
  const updateMapMutation = useUpdateMap();
  const uploadCoverMutation = useUploadMapCover();
  const removeCoverMutation = useRemoveMapCover();
  /**
   * 抽屉里改过尺寸、但服务端还没裁剪过。失败时保留，下一次保存接着补 ——
   * 否则草稿里会一直留着被截断的物品。
   */
  const gridTrimRef = useRef(false);
  /** 一次「保存」要连发多个请求，用这个标记把整段算作「保存中」。 */
  const busyRef = useRef(false);
  const [savingBusy, setSavingBusy] = useState(false);

  const canvasRef = useRef<EditorCanvasHandle | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const initKeyRef = useRef<number | null>(null);
  const mapInfoRef = useRef<MapInfoDrawerHandle | null>(null);
  /**
   * 「初始化地图」弹窗的两件事 —— 写尺寸进行中，以及「这次文件选择
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
  /**
   * 「地图基本信息」里已应用到页面、但**还没写库**的条目字段。
   * 抽屉的「保存」只把值放到这里，右上角「保存」才发请求 —— 所以它是
   * dirty 的一部分，也要参与离开编辑器时的拦截。
   */
  const [pendingEntryInfo, setPendingEntryInfo] = useState<MapInfoEntryDraft | null>(null);
  /**
   * 同一份值的同步副本。右上角「保存」可能在抽屉还开着的时候被点：那里先
   * 把抽屉的草稿提交到本地，随后立刻要写库 —— 但 state 要等下一次渲染才更新，
   * 直接读 `pendingEntryInfo` 会漏掉刚提交的内容。
   */
  const pendingEntryRef = useRef<MapInfoEntryDraft | null>(null);
  /**
   * 离开编辑器时的拦截：画布 dirty **或** 有未写库的基本信息 / 区域表单，都算
   * 没保存。`entryDirty` 在下面派生，这里直接读 state，免得把拦截放到后面。
   */
  const [regionInfoDirty, setRegionInfoDirty] = useState(false);
  const leaveGuard = useUnsavedChangesGuard(
    editor.dirty || pendingEntryInfo !== null || regionInfoDirty,
  );

  const [spaceHeld, setSpaceHeld] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  /** v0.3.8 FEAT-D01: the 「地图基本信息」drawer. */
  const [mapInfoOpen, setMapInfoOpen] = useState(false);
  /** FEAT-D03: the adaptive value the canvas last computed. */
  const [autoCellSize, setAutoCellSize] = useState<number>(DEFAULT_CELL_SIZE);
  const [regionDialog, setRegionDialog] = useState<RegionDialogState>({
    open: false,
    cells: [],
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

  const assetsById = useMemo(() => {
    const map = new Map<number, Asset>();
    for (const item of assetsQuery.data ?? []) map.set(item.id, item);
    return map;
  }, [assetsQuery.data]);

  /**
   * v0.6.1: the palette selects a (asset, form) pair — the form supplies the
   * footprint, the asset supplies the layer rules and the name.
   */
  const pendingForm = useMemo(() => {
    if (editor.selectedAssetId === null) return null;
    const asset = assetsById.get(editor.selectedAssetId);
    if (!asset) return null;
    const form = resolveAssetForm(asset, editor.selectedFormId);
    return form ? { asset, form } : null;
  }, [editor.selectedAssetId, editor.selectedFormId, assetsById]);

  /**
   * the save / publish / resize flows are hooks now. The page keeps
   * only what is specific to the map editor: the 基本信息 form, the FIX-F03
   * first-entry save, the canvas callbacks and the dialogs' JSX.
   */
  const { persist: persistDraft, saving: savePending, saveMaskVisible } = useEditorSave({
    id,
    mutation: saveMutation,
    buildPayload: () => ({ data: editor.toDraft() }),
    onSaved: (data) => {
      editor.markSaved();
      editor.setVersionInfo({
        currentVersionNo: data.map.currentVersionNo,
        status: data.map.status,
      });
    },
  });

  /**
   * fork 态的保存 = 「fork 一行新草稿（带上编辑器当前画布）→ 把
   * store 标记成已保存 → replace 到新行的编辑器 URL」。换 URL 而不是留在原地
   * 是因为此后所有操作（再保存 / 发布 / 调整尺寸）都必须落在新行 id 上；
   * replace 不留历史，用户按返回不会回到这个中间态。
   *
   * 返回新草稿的 id（失败 `null`）—— 同一轮保存里紧跟其后的基本信息
   * 与尺寸都要写到这个新行上。
   *
   * 没保存就离开 → 什么都没发生（这正是「保存时才生成草稿」的意义）。
   */
  const forkAndSave = async (): Promise<number | null> => {
    if (forkFrom === null || forkSaveMutation.isPending) return null;
    try {
      const mapEntry = await forkSaveMutation.mutateAsync({
        id,
        versionNo: forkFrom,
        data: editor.toDraft(),
      });
      editor.markSaved();
      editor.setVersionInfo({
        currentVersionNo: mapEntry.currentVersionNo,
        status: mapEntry.status,
      });
      // fork 的提示放在这里而不是页面顶部：保存之前什么都没发生，说「会生成
      // 新草稿」只是噪音。落库之后一条提示说清「基于谁、生成了什么」—— 原版本
      // 未改动是这个动作的题中之义，不再单挂一行说明。
      toast.success(`已基于 v${forkFrom} 生成新地图`);
      // 画布内容此刻已在新行里，落掉 `initKeyRef` 让随后的 effect 判定成
      // 「同一张图」—— 否则它会整份重载，视口跟着跳回 1:1。
      initKeyRef.current = mapEntry.id;
      // 换 URL 必须等 React 把 dirty=false flush 掉：`useBlocker` 的判定读的是
      // 渲染闭包里的 dirty，同一 continuation 里 navigate 会拿旧值把自己拦下
      // （弹「有未保存更改」）。setTimeout(0) 落在 flush 之后。
      window.setTimeout(() => navigate(`/maps/${mapEntry.id}/edit`, { replace: true }), 0);
      return mapEntry.id;
    } catch {
      /* errors surfaced via mutation toasts */
      return null;
    }
  };

  /**
   * 名称 / 描述 / 封面 —— 抽屉只把它们留在本地，这里才发请求。
   *
   * 名与描述用 PATCH，封面是第二步（先有行、再传文件）；只有真正变了的
   * 那一项才写，避免「只换了封面」也回一句「地图已更新」。
   */
  const persistEntryInfo = async (
    targetId: number,
    pending: MapInfoEntryDraft | null,
  ): Promise<boolean> => {
    if (!pending) return true;
    const description = pending.description.trim();
    const current = mapQuery.data?.map;
    const nameChanged = current ? pending.name !== current.name : true;
    const descriptionChanged = current
      ? (description === '' ? null : description) !== current.description
      : true;
    try {
      if (nameChanged || descriptionChanged) {
        await updateMapMutation.mutateAsync({
          id: targetId,
          payload: {
            ...(nameChanged ? { name: pending.name } : {}),
            ...(descriptionChanged ? { description: description === '' ? null : description } : {}),
          },
        });
      }
      if (pending.coverFile) {
        await uploadCoverMutation.mutateAsync({ id: targetId, file: pending.coverFile });
      } else if (pending.coverRemoved) {
        await removeCoverMutation.mutateAsync(targetId);
      }
      // 只换封面时没有任何别的提示，补一条，别让保存看起来没发生。
      if (!nameChanged && !descriptionChanged) toast.success('封面已更新');
    } catch {
      return false;
    }
    pendingEntryRef.current = null;
    setPendingEntryInfo(null);
    return true;
  };

  /**
   * 画布尺寸的落库：草稿保存已经把新尺寸写进 `data.gridSize`，但缩小尺寸
   * 时被截断的物品 / 区域要由 resize 接口抹掉（前端只裁了整格越界的内容）。
   * 基线取**保存前**缓存里的尺寸：保存之后缓存里的值就是刚写进去的新尺寸，
   * 拿它比较会永远相等。
   */
  const persistGridSize = async (targetId: number, beforeSave: number | null): Promise<boolean> => {
    const needed = gridTrimRef.current || (beforeSave !== null && editor.gridSize !== beforeSave);
    if (!needed) return true;
    try {
      const result = await resizeMutation.mutateAsync({ id: targetId, gridSize: editor.gridSize });
      gridTrimRef.current = false;
      const { background, item, regions } = result.removed;
      if (background + item + regions > 0) {
        toast.message('画布已调整', {
          description: `已移除越界内容：背景 ${background}、物品 ${item}、区域 ${regions}`,
        });
      }
      return true;
    } catch {
      return false;
    }
  };

  /**
   * 唯一的写入口：草稿 → 基本信息 → 尺寸，顺序固定（后一步都依赖前一步
   * 已经落在同一个 id 上）。抽屉的「保存」不经过这里 —— 它只应用本地草稿。
   *
   * 这一轮可能连发 3~4 个请求，`busyRef` 把它们盖成一次保存：中途不许再进，
   * 遮罩与按钮也不会在两个请求之间闪一下。
   */
  const persist = async (entryOverride?: MapInfoEntryDraft | null): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setSavingBusy(true);
    try {
      const entry = entryOverride === undefined ? pendingEntryInfo : entryOverride;
      // fork 出来的新草稿就是拿当前画布建的，没有越界内容要裁。
      const serverGridSize =
        forkFrom !== null ? null : (mapQuery.data?.draft?.gridSize ?? null);
      let targetId: number;
      if (forkFrom !== null) {
        const forkedId = await forkAndSave();
        if (forkedId === null) return false;
        targetId = forkedId;
      } else {
        // 只有基本信息待写时不必重发整份画布。
        if (editor.dirty && !(await persistDraft())) return false;
        targetId = id;
      }
      if (!(await persistEntryInfo(targetId, entry))) return false;
      return persistGridSize(targetId, serverGridSize);
    } finally {
      busyRef.current = false;
      setSavingBusy(false);
    }
  };

  const save = (): void => {
    /**
     * 右上角「保存」是用户的「保存」动作 —— 抽屉还开着、里面又有改动时，
     * 先把那份草稿应用到本地，再一起写库，免得「点了保存但名字没存」。
     */
    if (mapInfoOpen && mapInfoRef.current?.isDirty()) {
      if (mapInfoRef.current.save() === false) return;
    }
    void persist(pendingEntryRef.current);
  };

  /**
   * v0.7.4 §3：头部「预览」= **先落库、再进只读预览页**。
   *
   * 预览页读的是服务端那一行的 `data`，不先保存就等于给用户看上一版；而弹一句
   * 「有未保存的修改，离开将丢失」再让用户选一次，只是把同一个念头问两遍 ——
   * 「我想看现在的样子」本身就是那个问题的答案。
   */
  const openPreview = async (): Promise<void> => {
    if (mapInfoOpen && mapInfoRef.current?.isDirty()) {
      if (mapInfoRef.current.save() === false) return;
    }
    if (editor.dirty || pendingEntryRef.current !== null) {
      if (!(await persist(pendingEntryRef.current))) return;
    }
    // 与 `forkAndSave` 同一个理由：`useBlocker` 读的是渲染闭包里的 dirty，
    // 同一 continuation 里 navigate 会拿旧值把自己拦下。setTimeout(0) 落在
    // React flush 之后。
    window.setTimeout(() => navigate(`/maps/${id}/views`, { state: { from: 'editor' } }), 0);
  };

  /**
   * 「保存中」覆盖这一轮可能连发的四个请求；mask 跟着它们一起亮，用户眼里
   * 仍然是一次保存。
   */
  const saving =
    savingBusy ||
    savePending ||
    forkSaveMutation.isPending ||
    updateMapMutation.isPending ||
    uploadCoverMutation.isPending ||
    removeCoverMutation.isPending ||
    resizeMutation.isPending;
  const maskVisible =
    savingBusy ||
    saveMaskVisible ||
    forkSaveMutation.isPending ||
    updateMapMutation.isPending ||
    uploadCoverMutation.isPending ||
    removeCoverMutation.isPending;

  /** 抽屉里改过、但还没写库的条目字段 —— 与画布的 dirty 并列。 */
  const entryDirty = pendingEntryInfo !== null;

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
    assetsById,
    dirty: editor.dirty || entryDirty,
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
    dirty: editor.dirty || entryDirty,
    saving,
    persist,
    publishMutation,
  });

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
   * fork 态（`?v={n}`）整段让位给版本快照 —— 快照是已发布版本
   * 的完整 data，装进本地 store 即可开改，**不写任何库表**。草稿删除 /
   * 未初始化都不影响这条路：数据源是 `map_versions` 行，不是工作条目。
   */
  useEffect(() => {
    if (forkFrom !== null) {
      const snapshot = versionQuery.data;
      if (!snapshot) return;
      const action = resolveEditorInit({
        loadedMapId: initKeyRef.current,
        mapId: id,
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
        currentVersionNo: snapshot.versionNo,
        status: 'draft',
      });
      return;
    }

    const data = mapQuery.data;
    if (!data) return;
    /**
     * `draft === null` = 这张地图还没初始化。此时不 init、不保存 ——
     * 页面主体让位给 {@link MapInitDialog}，由用户决定填尺寸还是导入。
     */
    if (data.draft === null) return;
    /**
     * FIX-E01 (docs/v0.3.9.md §1): publishing bumps `currentVersionNo` /
     * `status` on the map row and invalidates this query, but it does **not**
     * touch the draft. Only a changed draft triggers a real re-init (which
     * resets zoom / pan); a metadata-only change just refreshes the version
     * badge, so the canvas stays exactly where the user left it.
     */
    const action = resolveEditorInit({
      loadedMapId: initKeyRef.current,
      mapId: id,
      storedVersionNo: editor.currentVersionNo,
      fetchedVersionNo: data.map.currentVersionNo,
      storedStatus: editor.status,
      fetchedStatus: data.map.status,
    });
    if (action === 'none') return;
    if (action === 'sync-version') {
      editor.setVersionInfo({
        currentVersionNo: data.map.currentVersionNo,
        status: data.map.status,
      });
      return;
    }
    initKeyRef.current = id;
    editor.init(id, data.draft, {
      currentVersionNo: data.map.currentVersionNo,
      status: data.map.status,
    });
  }, [forkFrom, versionQuery.data, mapQuery.data, id, editor]);

  /**
   * FEAT-E01 (docs/v0.3.9.md §3): the 「地图基本信息」drawer is a form, so
   * leaving it with unsaved edits has to be confirmed. Every path that closes
   * the drawer or hands focus to another panel goes through this guard.
   *
   * BUG-G01: leaving for a cell / region label must **close**
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

  /**
   * 抽屉的「保存」= **只应用本地草稿**，一个请求都不发。
   *
   * 画布尺寸与样式直接进 store（可撤销、立即看到效果）；名称 / 描述 / 封面
   * 不在 store 里，所以落进 `pendingEntryInfo` 作为 dirty 的一部分，等右上角
   * 「保存」时由 {@link persist} 统一写库。基线取视图层当前生效的值
   * （`pendingEntryInfo` 优先），这样连改两次也只留最后一次。
   */
  const commitMapInfo = (
    next: MapStyle,
    nextGridSize: number,
    entry: MapInfoEntryDraft,
  ): void => {
    const gridSizeChanged = nextGridSize !== editor.gridSize;
    editor.setMapStyle(() => next);
    // FIX-F01: 画布尺寸属于同一张表单，本地生效（可撤销、有即时反馈），
    // 写库等右上角保存。
    if (gridSizeChanged) {
      editor.setGridSize(nextGridSize);
      gridTrimRef.current = true;
    }
    const current = mapQuery.data?.map;
    const name = entry.name.trim();
    const description = entry.description.trim();
    const entryChanged =
      name !== (pendingEntryInfo?.name ?? current?.name ?? '') ||
      description !==
        (pendingEntryInfo?.description ?? (current?.description ?? '')) ||
      entry.coverFile !== (pendingEntryInfo?.coverFile ?? null) ||
      entry.coverRemoved !== (pendingEntryInfo?.coverRemoved ?? false);
    const nextEntry = entryChanged
      ? {
          name,
          description,
          coverFile: entry.coverFile,
          coverRemoved: entry.coverRemoved,
        }
      : null;
    pendingEntryRef.current = nextEntry;
    setPendingEntryInfo(nextEntry);
    setMapInfoOpen(false);
  };

  const closeMapInfo = (): void => {
    guardMapInfo(() => setMapInfoOpen(false));
  };

  /** Runs the deferred switch, applying the drawer's draft first when asked to. */
  const resolvePendingMapInfo = (mode: 'save' | 'discard'): void => {
    const action = pendingMapInfoAction;
    setPendingMapInfoAction(null);
    if (mode === 'save') {
      // 名称为空时抽屉拒绝提交 —— 留在原地让用户补完，别顺手切走。
      if (mapInfoRef.current?.save() === false) return;
    } else {
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

  /**
   * v0.7.0: 区域的外观编辑在右边信息框里完成（默认填入「地图基本信息」的
   * 缺省值，保存时只记差异）；对话框只剩「创建」这一步 ——  ID 与名称。
   */
  const submitRegion = (input: RegionInput, conflictMode: ConflictMode): void => {
    editor.createRegion(input, conflictMode);
    editor.clearDraftSelection();
    setTool('select');
    setRegionDialog((state) => ({ ...state, open: false }));
  };

  /** 右边信息框里区域表单的未保存修改 —— 离开编辑器时一并拦截。 */
  const submitRegionEdit = (regionId: string, input: RegionInput): void => {
    editor.updateRegion(regionId, input);
  };

  const previewCellSize = Math.max(3, Math.floor(180 / editor.gridSize));

  const exportToFile = (): void => {
    const blob = new Blob([JSON.stringify(editor.toDraft(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${mapQuery.data?.map.name ?? 'map'}-${id}.json`;
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
   * 初始化弹窗的「填尺寸」。复用改尺寸那条路 —— 服务端在草稿为空时新建一份
   * 只带 `gridSize` 的草稿，成功后 query 失效重拉，`draft` 不再是 `null`，
   * 页面主体随即渲染。
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
   * the keys both canvases share live in `useEditorShortcuts`
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
    else if (event.key === 'h' || event.key === 'H') setTool('pan');
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

  // fork 态的 `?v=` 指向一个不存在的版本时也要走错误态 ——
  // 否则 versionQuery 永远不 resolve，页面转圈到天荒地老。
  if (!Number.isFinite(id) || mapQuery.isError || (forkFrom !== null && versionQuery.isError)) {
    return (
      <EditorErrorState
        message={forkFrom !== null ? '地图版本不存在或加载失败。' : '地图不存在或加载失败。'}
        backLabel="返回地图列表"
        onBack={() => navigate('/maps')}
      />
    );
  }

  const mapEntry = mapQuery.data?.map;

  // fork 态还要多等一个版本快照（数据源换成 map_versions 行）。
  if (mapQuery.isLoading || !mapEntry || (forkFrom !== null && versionQuery.isLoading)) {
    return <EditorLoadingState />;
  }

  /**
   * 页面上生效的条目信息：先在本地改的值优先，其次才是库里读到的。
   * 抽屉的「保存」不发请求，所以标题 / 封面就得靠这一层先改过来。
   */
  const entryInfo = {
    name: pendingEntryInfo?.name ?? mapEntry.name,
    description: pendingEntryInfo?.description ?? (mapEntry.description ?? ''),
    coverUrl: mapEntry.coverUrl,
    coverFile: pendingEntryInfo?.coverFile ?? null,
    coverRemoved: pendingEntryInfo?.coverRemoved ?? false,
  };

  /**
   * 没初始化过的地图没有画布可渲染 —— 整个页面主体让位给初始化
   * 弹窗（所有 hooks 都已在上面跑完，这里的提前返回不违反 hooks 规则）。
   *
   * fork 态跳过这条 —— 画布来自版本快照（必然带 data），与工作
   * 条目草稿初始化与否无关。
   */
  if (forkFrom === null && mapQuery.data?.draft == null) {
    return (
      <MapInitDialog
        mapName={mapEntry.name}
        pending={initPending || importMutation.isPending}
        onInitSize={handleInitSize}
        onImport={handleInitImport}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <EditorImportInput inputRef={importInputRef} onChange={handleImportFile} />

      <EditorToolbar
        mapName={entryInfo.name}
        dirty={editor.dirty || entryDirty}
        saving={saving}
        publishing={publishMutation.isPending}
        /**
         * fork 态（`?v={n}`，还没保存）这一屏是「以 v{n} 为底稿」，不是草稿：
         * 徽标与发布按钮都不出现。保存成功 → replace 到新草稿行的 URL →
         * `forkFrom` 变 null，二者一起回来。
         */
        status={forkFrom !== null ? null : editor.status}
        currentVersionNo={editor.currentVersionNo}
        // fork 态下「保存」就是「生成新草稿」，没改过东西也要能点。
        canSave={editor.dirty || entryDirty || forkFrom !== null}
        onBack={() => navigate('/maps')}
        onSave={save}
        onPublish={forkFrom === null ? openPublishConfirm : undefined}
        onOpenVersions={() => setVersionsOpen(true)}
        onPreview={forkFrom === null ? () => void openPreview() : undefined}
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
          <div className="flex min-h-0">
            <EditorLeftPanel
              assets={assetsQuery.data}
              assetsLoading={assetsQuery.isLoading}
              assetsError={assetsQuery.isError}
              activeLayer={editor.activeLayer}
              selectedAssetId={editor.selectedAssetId}
              selectedFormId={editor.selectedFormId}
              regions={editor.regions}
              selectedRegionId={editor.selectedRegionId}
              onSetTool={setTool}
              onSetLayer={(layer) => {
                editor.setLayer(layer);
                editor.setSelectedItem(null);
              }}
              onSelectAsset={(asset, form) => {
                // 橡皮擦 / 平移 / 区域都与放置互斥：点资源即回到选择 / 放置。
                // store 的 setTool 离开区域工具时会一并清掉圈选草稿，所以这条
                // 打断路径不会留下不能确认也不能取消的半截选区。
                if (editor.activeTool !== 'select') setTool('select');
                editor.setSelectedItem(asset ? asset.id : null, form ? form.id : null);
              }}
              onSelectRegion={(regionId) => {
                // 与画布上的区域标签同一套动作：聚焦区域 + 信息框渲染区域分支。
                // 此前这里只设了 `selectedRegionId`，`selection` 仍是 null ——
                // 抽屉会弹出来却是空的（点列表项信息框空白）。
                // 区域 / 平移 / 橡皮擦工具下点击 = 取消当前功能，回到选择。
                guardMapInfo(() => {
                  if (regionId !== null && editor.activeTool !== 'select') setTool('select');
                  editor.setSelection(regionFocusSelection(regionId));
                  editor.setSelectedRegion(regionId);
                });
              }}
              onDeleteRegion={setDeleteRegionTarget}
            />
          </div>
        ) : null}

        {/*
         * v0.7.4 (docs/v0.7.4.md §4): 右侧两个面板是这一行的**兄弟节点**，
         * 不是浮在画布上的 absolute 层 —— 打开就把 320px 从画布那儿拿走。
         * 内层 div 只装画布与两条浮在画布上的工具条，所以底部工具条仍居中于
         * 「看得见的画布」，而不是居中于整行。
         */}
        <main className="relative flex min-h-0 flex-1">
          <div className="relative min-h-0 flex-1">
            <EditorCanvas
              ref={canvasRef}
              gridSize={editor.gridSize}
              cells={editor.cells}
              assetsById={assetsById}
              regions={editor.regions}
              style={editor.style}
              onAutoCellSize={setAutoCellSize}
              selectedRegionId={editor.selectedRegionId}
              zoom={editor.zoom}
              pan={editor.pan}
              selection={editor.selection}
              activeTool={editor.activeTool}
              spaceHeld={spaceHeld}
              showRulers={rulerVisible}
              pendingForm={pendingForm}
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
              onDraftAdd={editor.addDraftCells}
              onDraftRemove={editor.removeDraftCells}
              onDraftClear={editor.clearDraftSelection}
              onToggleRegionCell={(coord) => {
                if (editor.selectedRegionId !== null) {
                  editor.toggleRegionCell(editor.selectedRegionId, coord.x, coord.y);
                }
              }}
              onPlaceItem={(coord) => {
                if (!pendingForm) return;
                // OPT-904 §4.1: the placement layer must match the item category
                // (the background layer only accepts `type === 'background'`).
                if (!canPlaceAssetOnLayer(pendingForm.asset, editor.activeLayer)) {
                  toast.error('该物品不能放在当前图层');
                  return;
                }
                if (pendingForm.asset.type === 'background') {
                  editor.placeBackground(
                    pendingForm.asset.id,
                    pendingForm.form.id,
                    coord.x,
                    coord.y,
                  );
                } else {
                  editor.placeItem(
                    {
                      assetId: pendingForm.asset.id,
                      formId: pendingForm.form.id,
                      w: pendingForm.form.widthCells,
                      h: pendingForm.form.heightCells,
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
                  setRegionDialog({ open: true, cells });
                }}
                onCancel={() => {
                  editor.clearDraftSelection();
                  setTool('select');
                }}
              />
            ) : null}

            <EditorBottomBar
              activeTool={editor.activeTool}
              canUndo={editor.past.length > 0}
              canRedo={editor.future.length > 0}
              zoom={editor.zoom}
              gridSize={editor.gridSize}
              itemsOpen={itemsOpen}
              rulerVisible={rulerVisible}
              selectedAsset={pendingForm?.asset ?? null}
              selectedForm={pendingForm?.form ?? null}
              onSetTool={setTool}
              onUndo={editor.undo}
              onRedo={editor.redo}
              onZoomIn={() => zoomBy(1)}
              onZoomOut={() => zoomBy(-1)}
              onZoomReset={() => editor.setZoom(1)}
              onFit={() => canvasRef.current?.centerView()}
              onToggleItems={() => setItemsOpen((open) => !open)}
              onToggleRuler={() => setRulerVisible((visible) => !visible)}
              onOpenResize={() => setResizeOpen(true)}
              onRevealItems={() => setItemsOpen(true)}
            />
          </div>

          <EditorInfoDrawer
            open={infoDrawerOpen({ infoOpen, mapInfoOpen, selectedSlotIndex: null })}
            onClose={() => setInfoOpen(false)}
            onOpen={() => setInfoOpen(true)}
            selection={editor.selection}
            cells={editor.cells}
            regions={editor.regions}
            assetsById={assetsById}
            style={editor.style}
            onClearCell={(x, y) => editor.clearCell(x, y)}
            onClearItem={(x, y) => editor.clearItemAt(x, y)}
            onItemTransform={(x, y, patch) => editor.setItemTransform(x, y, patch)}
            onSubmitRegion={submitRegionEdit}
            onDeleteRegion={setDeleteRegionTarget}
            onRegionDirtyChange={setRegionInfoDirty}
          />

          <MapInfoDrawer
            ref={mapInfoRef}
            open={mapInfoOpen}
            gridSize={editor.gridSize}
            autoCellSize={autoCellSize}
            style={editor.style}
            name={entryInfo.name}
            description={entryInfo.description}
            coverUrl={entryInfo.coverUrl}
            coverFile={entryInfo.coverFile}
            coverRemoved={entryInfo.coverRemoved}
            onRequestClose={closeMapInfo}
            onCommit={commitMapInfo}
          />
        </main>
      </div>

      <RegionDialog
        open={regionDialog.open}
        onOpenChange={(open) => setRegionDialog((state) => ({ ...state, open }))}
        cells={regionDialog.cells}
        regions={editor.regions}
        onSubmit={submitRegion}
      />

      <VersionHistoryDialog
        mapId={id}
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        currentVersionNo={editor.currentVersionNo}
        onPreview={(version) => navigate(`/maps/${version.id}/views`)}
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
