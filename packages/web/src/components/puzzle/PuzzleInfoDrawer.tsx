import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { HelpCircle, Plus, Trash2, Upload, X } from 'lucide-react';
import {
  GAME_TOOL_ICON_KINDS,
  GAME_TOOL_ICON_LABELS,
  LINKAGE_COLOR_KEY_PATTERN,
  LINKAGE_COLOR_LABEL_MAX_LENGTH,
  LINKAGE_COLOR_MAX_COUNT,
  LINKAGE_COLOR_MIN_COUNT,
  PUZZLE_CLUE_MAX_LENGTH,
  PUZZLE_CLUES_MAX_COUNT,
  PUZZLE_DESCRIPTION_MAX_LENGTH,
  PUZZLE_ENDING_MAX_LENGTH,
  PUZZLE_NAME_MAX_LENGTH,
  ROSTER_COLS_MAX,
  UI_Z,
  fileUrlFromPath,
  type CharacterSlotEntry,
  type UploadedImage,
  type GameToolIconKind,
  type GameToolIcons,
  type MapLinkageColor,
} from '@loredoku/shared';
import { CoverPicker } from '@/components/common/CoverPicker';
import { TOOL_ICON_FALLBACKS } from '@/lib/toolIcons';
import { resolveMarkImage } from '@/lib/mark';
import {
  computeParticipantLayout,
  resolveRosterCols,
  rosterRows,
} from '@/lib/participantLayout';
import { Button } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  countLinkageColorUsage,
  isValidStyleColor,
  nextLinkageKey,
  resolveLinkageColors,
  retargetLinkageColors,
} from '@/lib/mapStyle';
import { cn } from '@/lib/utils';

/**
 * SPEC-K05 (docs/v0.5.0.md §4.2): the puzzle's 「基本信息」 drawer.
 *
 * It holds what the puzzle owns — **名称 / 封面**（v0.7.3）、the **description**,
 * the **题面**（v0.7.14：全局线索 + 结束语）, the **联动主题色 palette** and
 * (v0.6.3 §3) the **参与者布局** column count — and nothing else. Everything the
 * map drawer carries (画布尺寸 / `cellSize` /
 * `canvasFrame` / `gridSeparator` / `mouseCursorBox` / `operationCursorBox` /
 * `regionLabel` / `regionOutline` / `regionHighlight` / `ruler`) belongs to the
 * map and is deliberately absent: the puzzle only **references** a map version
 * (§5.1).
 *
 * 名称与其余字段一起进草稿（撤销 + 随保存落库）；封面不同 —— 它没有 JSON 通道，
 * 且 fork 态（`?v=`）下还没有可写的行，所以这里只产出 `{ file, removed }`，
 * 由页面留在本地、等草稿保存成功后再上传（与 `MapInfoDrawer` 同一套契约）。
 *
 * The draft-then-commit contract: every control writes a local draft, the store
 * is only touched on 保存, and the imperative handle lets the page defer a panel
 * switch until the user has decided.
 */
export interface PuzzleInfoDrawerHandle {
  /** True while the draft differs from the committed name / description / palette / cover. */
  isDirty: () => boolean;
  /** Commits the draft (same as pressing 保存). `false` = the name is invalid. */
  save: () => boolean;
  /** Drops the draft and re-reads the committed values. */
  discard: () => void;
}

export interface PuzzleBasicInfo {
  /** v0.7.3 §2: the puzzle's own name (required). */
  name: string;
  description: string;
  /** v0.7.14：全局线索（已 trim、已去空行）。 */
  clues: string[];
  /** v0.7.14：结束语（已 trim；空串 = 不显示）。 */
  ending: string;
  linkageColors: MapLinkageColor[];
  /** The roster, re-pointed at surviving palette keys (FEAT-D04 §UI 规则). */
  characterSlots: Array<CharacterSlotEntry | null>;
  /** v0.6.3 (docs/v0.6.3.md §3): `null` = 自动. */
  rosterCols: number | null;
  /**
   * v0.8.6 (docs/v0.8.6.md §4): 玩家侧「标记」用的那张上传图。
   * `null` = 默认的 `×` 字形。
   */
  mark: UploadedImage | null;
  /** v0.8.7 §7：三枚工具按钮图标；`null` = 三枚都跟随主题。 */
  toolIcons: GameToolIcons | null;
  /** v0.7.3 §2: a freshly picked cover file, or `null` to keep the stored one. */
  coverFile: File | null;
  /** v0.7.3 §2: the stored cover should be dropped. */
  coverRemoved: boolean;
}

interface PuzzleInfoDrawerProps {
  open: boolean;
  /** The committed values — the drawer edits a copy of them. */
  name: string;
  description: string;
  /** v0.7.14：已提交的全局线索 / 结束语。 */
  clues: string[];
  ending: string;
  linkageColors: MapLinkageColor[];
  /** Needed only to re-point (and to preview) palette deletions. */
  characterSlots: Array<CharacterSlotEntry | null>;
  /** v0.6.3 §3: the committed column count. `null` = 自动. */
  rosterCols: number | null;
  /**
   * v0.8.6 §4 / v0.8.7 §4: 已提交的标记图；`null` = 这一题没单独配置
   * （跟随主题，见 `themeMark`；两边都没有才是 `×`）。
   * 值形状是 `{ path }` —— `path` 是 `storage/uploads` 下的相对路径。
   */
  mark: UploadedImage | null;
  /**
   * v0.8.7 §4：主题的「标记」缺省 —— 这一题没配时**玩家看到的就是这张**。
   *
   * 抽屉拿它只做两件事：预览画这张（否则作者看到的 `×` 与玩家看到的图对不上），
   * 以及那句「未单独配置，跟随主题」的说明。`null` = 主题也没配。
   */
  themeMark: UploadedImage | null;
  /**
   * v0.8.7 §7：这一题提交过的工具按钮图标（清除 / 撤回 / 提交）。`null` = 三枚都
   * 没单独配 —— 玩家看到的是主题那一套。形状与标记相同：`{ path }`。
   */
  toolIcons: GameToolIcons | null;
  /** v0.8.7 §7：主题的那一套；这一题没配的那几枚，预览与说明都靠它。 */
  themeToolIcons: GameToolIcons | null;
  /**
   * v0.8.7 §7：选中文件后**立即上传**，返回落盘路径 —— 抽屉把它写进本地草稿的
   * `toolIcons[icon]`，随「保存」一个撤销步。失败返回 `null`。
   */
  onUploadToolIcon: (
    icon: GameToolIconKind,
    file: File,
  ) => Promise<{ path: string; url: string } | null>;
  /**
   * v0.8.6 §4: 选中文件后**立即上传**。成功返回落盘路径（抽屉把它写进本地草稿，
   * 与其它字段同一个「保存」/ 撤销步）；失败返回 `null` —— 抽屉保留原值并提示。
   */
  onUploadMark: (file: File) => Promise<{ path: string; url: string } | null>;
  /** The cover currently on the server (`null` when it has none). */
  coverUrl: string | null;
  /** A cover file already applied to the page's local state but not uploaded yet. */
  coverFile: File | null;
  /** The page's local state already marks the stored cover as removed. */
  coverRemoved: boolean;
  /**
   * The drawer never closes itself: both × and 取消 call this, and the page
   * decides whether to prompt for unsaved edits first.
   */
  onRequestClose: () => void;
  /** Applies the whole draft in a single undo step. */
  onCommit: (next: PuzzleBasicInfo) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/** Draft-then-commit wrapper so the store is only touched on 保存. */
function useDraft<T>(source: T, open: boolean): [T, (next: T) => void] {
  const [draft, setDraft] = useState<T>(source);
  useEffect(() => {
    // Re-seed on every open so a cancelled edit never leaks into the next one.
    if (open) setDraft(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return [draft, setDraft];
}

function Hint({ text }: { text: string }): JSX.Element {
  return (
    <span
      className="ml-1 inline-flex shrink-0 items-center text-muted-foreground"
      title={text}
      aria-label={text}
      role="img"
    >
      <HelpCircle className="h-3.5 w-3.5 cursor-help" />
    </span>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="space-y-2 border-b px-4 py-3 last:border-b-0">
      <h3 className="flex items-center text-xs font-semibold text-foreground">
        <span>{title}</span>
        {hint ? <Hint text={hint} /> : null}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/** Compares the two palettes field by field (both sides already normalised). */
function paletteEquals(a: MapLinkageColor[], b: MapLinkageColor[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * v0.7.14：线索按**落库后的样子**比较 —— trim 掉首尾空格、丢掉空行。
 *
 * 少了这一步会有一种很别扭的状态：作者点「新增线索」又什么都没写就点保存，
 * 数组长度变了、dirty 为真，于是白白多一个撤销步；而落库时那行又会被过滤掉，
 * 撤销按下去看不出任何变化。比较用归一化后的值，保存时也交归一化后的值，
 * 两边才是同一件事。
 */
function normalizeClues(list: readonly string[]): string[] {
  return list.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function cluesEqual(a: readonly string[], b: readonly string[]): boolean {
  return JSON.stringify(normalizeClues(a)) === JSON.stringify(normalizeClues(b));
}

/** v0.8.6 §4：缺席 / `null` 都表示「默认 ×」，两者相等。 */
function markEquals(
  a: UploadedImage | null,
  b: UploadedImage | null,
): boolean {
  return (a?.path ?? null) === (b?.path ?? null);
}

/**
 * v0.8.7 §7：三枚图标逐枚比 `path`。用 `every` 而不是比对象 —— 键的**顺序**不该参与
 * 「改没改」的判断，作者先换「提交」再换「清除」和反过来是同一份结果。
 */
function toolIconsEqual(a: GameToolIcons | null, b: GameToolIcons | null): boolean {
  return GAME_TOOL_ICON_KINDS.every(
    (kind) => (a?.[kind]?.path ?? null) === (b?.[kind]?.path ?? null),
  );
}

export const PuzzleInfoDrawer = forwardRef<PuzzleInfoDrawerHandle, PuzzleInfoDrawerProps>(
  function PuzzleInfoDrawer(
    {
      open,
      name,
      description,
      clues,
      ending,
      linkageColors,
      characterSlots,
      rosterCols,
      mark,
      themeMark,
      toolIcons,
      themeToolIcons,
      onUploadMark,
      onUploadToolIcon,
      coverUrl,
      coverFile,
      coverRemoved,
      onRequestClose,
      onCommit,
      onDirtyChange,
    },
    ref,
  ): JSX.Element {
    const [draftName, setDraftName] = useDraft<string>(name, open);
    const [draftDescription, setDraftDescription] = useDraft<string>(description, open);
    /** v0.7.14：题面两段文字也走草稿 —— 与描述同一套提交时机。 */
    const [draftClues, setDraftClues] = useDraft<string[]>(clues, open);
    const [draftEnding, setDraftEnding] = useDraft<string>(ending, open);
    const [draftPalette, setDraftPalette] = useDraft<MapLinkageColor[]>(linkageColors, open);
    /** v0.6.3 §3: the column count is drafted like everything else here. */
    const [draftCols, setDraftCols] = useDraft<number | null>(rosterCols, open);
    /** v0.8.6 §4: 标记也走草稿 —— 与其余基本信息同一套提交时机。 */
    const [draftMark, setDraftMark] = useDraft<UploadedImage | null>(
      mark,
      open,
    );
    /** v0.8.7 §7：三枚工具按钮图标也走草稿 —— 同一套提交时机、同一个撤销步。 */
    const [draftToolIcons, setDraftToolIcons] = useDraft<GameToolIcons | null>(toolIcons, open);
    /**
     * v0.8.7 §4：预览画「这一题最终会用的那张」—— 自己配了就是它，没配就是主题的。
     * `null` = 两边都没有，玩家侧是 `×`。
     */
    const previewMark = draftMark ?? themeMark;
    /**
     * v0.8.6 §4: 上传在选完文件那一刻就发生，所以「上传中 / 失败」是控件的短暂状态，
     * 不进草稿、也不算一次编辑。
     */
    const [markUploading, setMarkUploading] = useState(false);
    const [markUploadError, setMarkUploadError] = useState<string | null>(null);
    /** 上传控件的真身：一个隐藏的 `<input type="file">`。 */
    const markInputRef = useRef<HTMLInputElement | null>(null);
    /**
     * v0.8.7 §7：三枚工具图标共用**一个**隐藏 input —— `pendingToolIcon` 记住这次点的是
     * 哪一枚，选完文件才知道往哪个键上放。上传中 / 失败同样是控件的短暂状态。
     */
    const [toolIconUploading, setToolIconUploading] = useState<GameToolIconKind | null>(null);
    const [toolIconError, setToolIconError] = useState<string | null>(null);
    const [pendingToolIcon, setPendingToolIcon] = useState<GameToolIconKind | null>(null);
    const toolIconInputRef = useRef<HTMLInputElement | null>(null);
    /** v0.7.3 §2: the cover is drafted as `{ file, removed }` and uploaded on save. */
    const [draftCoverFile, setDraftCoverFile] = useDraft<File | null>(coverFile, open);
    const [draftCoverRemoved, setDraftCoverRemoved] = useDraft<boolean>(coverRemoved, open);
    /**
     * The roster the draft carries. It only ever differs from the committed one
     * because a palette key was renamed or deleted — the drawer never edits a
     * participant itself.
     */
    const [draftSlots, setDraftSlots] = useDraft<Array<CharacterSlotEntry | null>>(
      characterSlots,
      open,
    );
    /** Set while committing / discarding, so the deferred switch reads clean. */
    const settledRef = useRef(false);

    const nameBlank = draftName.trim().length === 0;
    const dirty =
      draftName !== name ||
      draftDescription !== description ||
      !cluesEqual(draftClues, clues) ||
      draftEnding.trim() !== ending.trim() ||
      !paletteEquals(draftPalette, linkageColors) ||
      draftCols !== rosterCols ||
      !markEquals(draftMark, mark) ||
      !toolIconsEqual(draftToolIcons, toolIcons) ||
      draftCoverFile !== coverFile ||
      draftCoverRemoved !== coverRemoved;
    const latest = useRef({
      draftName,
      draftDescription,
      draftClues,
      draftEnding,
      draftPalette,
      draftSlots,
      draftCols,
      draftMark,
      draftToolIcons,
      draftCoverFile,
      draftCoverRemoved,
      dirty,
      blocked: nameBlank,
    });
    latest.current = {
      draftName,
      draftDescription,
      draftClues,
      draftEnding,
      draftPalette,
      draftSlots,
      draftCols,
      draftMark,
      draftToolIcons,
      draftCoverFile,
      draftCoverRemoved,
      dirty,
      blocked: nameBlank,
    };

    useEffect(() => {
      if (open) settledRef.current = false;
    }, [open]);

    useEffect(() => {
      // 每次打开都从「没有错误」开始 —— 上一次失败的提示不该留到下一次。
      if (open) {
        setMarkUploadError(null);
        setToolIconError(null);
        setPendingToolIcon(null);
      }
    }, [open]);

    useEffect(() => {
      onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    useImperativeHandle(
      ref,
      () => ({
        isDirty: () => !settledRef.current && latest.current.dirty,
        save: () => {
          const current = latest.current;
          // 名称为空时不提交、也不关 —— 留在原地让用户补完。
          if (current.blocked) return false;
          settledRef.current = true;
          if (current.dirty)
            onCommit({
              name: current.draftName.trim(),
              description: current.draftDescription,
              clues: normalizeClues(current.draftClues),
              ending: current.draftEnding.trim(),
              linkageColors: current.draftPalette,
              characterSlots: current.draftSlots,
              rosterCols: current.draftCols,
              mark: current.draftMark,
              toolIcons: current.draftToolIcons,
              coverFile: current.draftCoverFile,
              coverRemoved: current.draftCoverRemoved,
            });
          else onRequestClose();
          return true;
        },
        discard: () => {
          settledRef.current = true;
          setDraftName(name);
          setDraftDescription(description);
          setDraftClues(clues);
          setDraftEnding(ending);
          setDraftPalette(linkageColors);
          setDraftSlots(characterSlots);
          setDraftCols(rosterCols);
          setDraftMark(mark);
          setDraftToolIcons(toolIcons);
          setDraftCoverFile(coverFile);
          setDraftCoverRemoved(coverRemoved);
        },
      }),
      [
        characterSlots,
        clues,
        coverFile,
        coverRemoved,
        name,
        description,
        ending,
        linkageColors,
        rosterCols,
        mark,
        toolIcons,
        onCommit,
        onRequestClose,
        setDraftName,
        setDraftDescription,
        setDraftClues,
        setDraftEnding,
        setDraftPalette,
        setDraftSlots,
        setDraftCols,
        setDraftMark,
        setDraftToolIcons,
        setDraftCoverFile,
        setDraftCoverRemoved,
      ],
    );

    const patchEntry = (index: number, patch: Partial<MapLinkageColor>): void => {
      setDraftPalette(
        draftPalette.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
      );
    };

    /**
     * FEAT-D04 §UI 规则 (kept from the map drawer): renaming a `key` re-points
     * every linkage that referenced the old one, so no participant is left
     * holding a dangling colour key.
     */
    const renameKey = (index: number, nextKey: string): void => {
      const entry = draftPalette[index];
      if (!entry) return;
      const key = nextKey.trim();
      if (!LINKAGE_COLOR_KEY_PATTERN.test(key)) return;
      if (draftPalette.some((other, i) => i !== index && other.key === key)) return;
      if (key === entry.key) return;
      setDraftSlots(retargetLinkageColors(draftSlots, entry.key, key));
      patchEntry(index, { key });
    };

    const removeEntry = (index: number): void => {
      if (draftPalette.length <= LINKAGE_COLOR_MIN_COUNT) return;
      const entry = draftPalette[index];
      if (!entry) return;
      const remaining = draftPalette.filter((_, i) => i !== index);
      const fallback = remaining[0]?.key;
      if (!fallback) return;
      setDraftSlots(retargetLinkageColors(draftSlots, entry.key, fallback));
      setDraftPalette(remaining);
    };

    const addEntry = (): void => {
      if (draftPalette.length >= LINKAGE_COLOR_MAX_COUNT) return;
      setDraftPalette(
        resolveLinkageColors([
          ...draftPalette,
          { key: nextLinkageKey(draftPalette), label: '', color: '#888888' },
        ]),
      );
    };

    const descriptionOverLimit = draftDescription.length > PUZZLE_DESCRIPTION_MAX_LENGTH;

    /**
     * v0.7.14：线索的增删改都只动草稿。**新增**会先插一条空行 —— 作者点一下
     * 就有地方写，不必先想好措辞再找入口。空行在提交时消失（见 `normalizeClues`），
     * 所以「点错了又没写」不会在数据里留下一条空线索。
     */
    const patchClue = (index: number, text: string): void => {
      setDraftClues(draftClues.map((entry, i) => (i === index ? text : entry)));
    };

    const addClue = (): void => {
      if (draftClues.length >= PUZZLE_CLUES_MAX_COUNT) return;
      setDraftClues([...draftClues, '']);
    };

    const removeClue = (index: number): void => {
      setDraftClues(draftClues.filter((_, i) => i !== index));
    };

    /**
     * v0.8.6 §4：选中文件后**立即上传**，成功才把 `{ path }` 写进抽屉草稿。
     * 失败像没选过一样 —— 原值留着，控件旁给一行错误（不静默）。
     */
    const uploadMark = async (file: File): Promise<void> => {
      setMarkUploading(true);
      setMarkUploadError(null);
      try {
        const uploaded = await onUploadMark(file);
        if (!uploaded) {
          setMarkUploadError('图片上传失败，请重试。');
          return;
        }
        setDraftMark({ path: uploaded.path });
      } catch {
        setMarkUploadError('图片上传失败，请重试。');
      } finally {
        setMarkUploading(false);
      }
    };

    /**
     * v0.8.7 §7：一枚工具图标的上传。与标记同一条时序 —— 选中即上传，成功才写进
     * 草稿；失败保留原值、只在那一枚下面报一句。三枚互不影响，所以状态按枚记。
     */
    const uploadToolIcon = async (icon: GameToolIconKind, file: File): Promise<void> => {
      setToolIconUploading(icon);
      setToolIconError(null);
      try {
        const uploaded = await onUploadToolIcon(icon, file);
        if (!uploaded) {
          setToolIconError('图片上传失败，请重试。');
          return;
        }
        setDraftToolIcons({ ...(draftToolIcons ?? {}), [icon]: { path: uploaded.path } });
      } catch {
        setToolIconError('图片上传失败，请重试。');
      } finally {
        setToolIconUploading(null);
      }
    };

    /**
     * v0.6.3 §3.2: the row count is never typed, only shown — it is
     * `ceil(参与者数 / 列数)`, recomputed on every keystroke. With no column
     * count (自动) the preview shows the golden-ratio layout the panel will
     * pick, so the two agree before the user commits to a number.
     */
    const slotTotal = characterSlots.length;
    const autoLayout = useMemo(() => computeParticipantLayout(slotTotal), [slotTotal]);
    const previewCols = draftCols ?? autoLayout.cols;
    const previewRows = draftCols === null ? autoLayout.rows : rosterRows(slotTotal, draftCols);

    /**
     * An empty field means 自动 (the stored value is `null`); anything else is
     * forced into `[1, min(参与者数, ROSTER_COLS_MAX)]` so the preview can
     * never describe a matrix with more columns than it has people, and the
     * panel never has to scroll to show them.
     */
    const changeCols = (raw: string): void => {
      if (raw.trim() === '') {
        setDraftCols(null);
        return;
      }
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) {
        setDraftCols(null);
        return;
      }
      setDraftCols(Math.min(ROSTER_COLS_MAX, resolveRosterCols(parsed, slotTotal) ?? 1));
    };

    return (
      <aside
        aria-hidden={!open}
        data-testid="puzzle-info-drawer"
        className={cn(
          'absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col border-l bg-background/95 shadow-lifted backdrop-blur transition-transform duration-slow',
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
        // FIX-N11 (docs/v0.5.3.md §6.4): shared layer constant.
        style={{ zIndex: UI_Z.infoDrawer }}
      >
        <header className="flex h-11 shrink-0 items-center justify-between border-b px-4">
          <span className="text-sm font-semibold">谜题基本信息</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRequestClose}
            title="关闭（有未保存修改时会先确认）"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/*
            v0.7.3 §2：名称 / 描述 / 封面合成一块「基本」，与地图抽屉同一个排版。
            名称与描述进草稿；封面只交 `{ file, removed }`，页面等保存成功后再上传。
          */}
          <Section
            title="基本"
            hint="Info — 名称、描述与封面。封面图片在点「保存」后上传。"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="puzzle-info-name" className="text-2xs font-normal text-muted-foreground">
                名称
              </Label>
              <Input
                id="puzzle-info-name"
                value={draftName}
                maxLength={PUZZLE_NAME_MAX_LENGTH}
                placeholder="例如：午夜花园"
                className={cn('h-7 text-xs', nameBlank ? 'border-destructive' : undefined)}
                onChange={(event) => setDraftName(event.target.value)}
              />
              {nameBlank ? <p className="text-2xs text-destructive">谜题名称必填。</p> : null}
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor="puzzle-info-description"
                className="text-2xs font-normal text-muted-foreground"
              >
                描述
              </Label>
              <Textarea
                id="puzzle-info-description"
                value={draftDescription}
                rows={5}
                maxLength={PUZZLE_DESCRIPTION_MAX_LENGTH}
                placeholder="例如：六人六格，注意花丛的位置条件。"
                className={descriptionOverLimit ? 'border-destructive' : undefined}
                onChange={(event) => setDraftDescription(event.target.value)}
              />
              <div className="flex justify-end text-2xs text-muted-foreground">
                <span className={descriptionOverLimit ? 'font-medium text-destructive' : ''}>
                  {draftDescription.length} / {PUZZLE_DESCRIPTION_MAX_LENGTH}
                </span>
              </div>
            </div>

            <CoverPicker
              noun="谜题"
              layout="stack"
              storedUrl={coverUrl}
              file={draftCoverFile}
              removed={draftCoverRemoved}
              onPick={(picked) => {
                setDraftCoverFile(picked);
                // 新选的文件永远盖过「准备移除」这个状态。
                if (picked) setDraftCoverRemoved(false);
              }}
              onRemove={() => {
                setDraftCoverFile(null);
                setDraftCoverRemoved(true);
              }}
              onRestore={() => setDraftCoverRemoved(false)}
            />
          </Section>
          {/*
            v0.9.5：**操作提示** —— 标记 + 三枚按钮图标，合成一个模块。

            它们回答的是同一个问题：玩家在盘面上操作时看到的那些提示长什么样。
            用户要的就是「标记 / 清除 / 回退 / 提交的配置放到一个模块」—— 分两节会
            让人以为它们无关，而作者通常是一起调的。

            一律**没配就跟随主题**：预览画的必须是这一题最终会用的那张（自己的，
            否则主题的，再否则内置），不然作者在抽屉里看到 ×、玩家在游戏页看到一张
            图 —— 两边说的不是同一件事。`data-source` 让测试能分清「自己的」和
            「跟随的」。
          */}
          <Section
            title="操作提示"
            hint="玩家在盘面上操作时看到的提示：标记是「这格排除」的那枚符号，另外三枚是游戏页右列按钮上的画。不单独配置就跟随主题（主题概览页的「操作提示」）；上传一张可以只给这一题换一枚。都没配时用内置样式。"
          >
            <ul className="divide-y divide-border">
              {/* 标记：形状与三枚按钮一致，只是它画在格子里。 */}
              <li
                data-testid="mark-row"
                className="flex items-start gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                  {previewMark ? (
                    <img
                      data-testid="mark-preview"
                      data-source={draftMark ? 'puzzle' : 'theme'}
                      src={fileUrlFromPath(previewMark.path)}
                      alt={draftMark ? '标记预览' : '主题的标记预览'}
                      draggable={false}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-base text-muted-foreground" aria-hidden="true">
                      ×
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs">标记</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={markUploading}
                      onClick={() => markInputRef.current?.click()}
                    >
                      <Upload className="mr-1 h-3.5 w-3.5" />
                      {markUploading
                        ? '上传中…'
                        : draftMark
                          ? '更换'
                          : themeMark
                            ? '单独配一张'
                            : '选择图片'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      disabled={markUploading || draftMark === null}
                      onClick={() => {
                        setDraftMark(null);
                        setMarkUploadError(null);
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      移除
                    </Button>
                  </div>
                  <p className="text-2xs leading-relaxed text-muted-foreground">
                    {draftMark
                      ? '这一题用自己上传的这张；「移除」就回到跟随主题。'
                      : themeMark
                        ? '这一题没有单独配置，玩家看到的是主题那张。'
                        : '这一题和主题都没有配置，玩家看到的是默认的 ×。'}
                  </p>
                </div>
              </li>

              {GAME_TOOL_ICON_KINDS.map((icon) => {
                const own = draftToolIcons?.[icon] ?? null;
                const inherited = themeToolIcons?.[icon] ?? null;
                const preview = own ?? inherited;
                const Fallback = TOOL_ICON_FALLBACKS[icon];
                return (
                  <li
                    key={icon}
                    data-testid={`tool-icon-row-${icon}`}
                    className="flex items-start gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                      {preview ? (
                        <img
                          data-testid={`tool-icon-preview-${icon}`}
                          data-source={own ? 'puzzle' : 'theme'}
                          src={fileUrlFromPath(preview.path)}
                          alt={`${GAME_TOOL_ICON_LABELS[icon]}图标预览`}
                          draggable={false}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Fallback className="h-4 w-4 text-muted-foreground" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs">{GAME_TOOL_ICON_LABELS[icon]}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={toolIconUploading !== null}
                          onClick={() => {
                            setPendingToolIcon(icon);
                            toolIconInputRef.current?.click();
                          }}
                        >
                          <Upload className="mr-1 h-3.5 w-3.5" />
                          {toolIconUploading === icon
                            ? '上传中…'
                            : own
                              ? '更换'
                              : inherited
                                ? '单独配一张'
                                : '选择图片'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          disabled={toolIconUploading !== null || own === null}
                          onClick={() => {
                            const rest: GameToolIcons = { ...(draftToolIcons ?? {}) };
                            delete rest[icon];
                            setDraftToolIcons(Object.keys(rest).length > 0 ? rest : null);
                            setToolIconError(null);
                          }}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          移除
                        </Button>
                      </div>
                      <p className="text-2xs leading-relaxed text-muted-foreground">
                        {own
                          ? '这一题用自己上传的这张；「移除」就回到跟随主题。'
                          : inherited
                            ? '这一题没有单独配置，玩家看到的是主题那张。'
                            : '这一题和主题都没有配置，玩家看到的是内置图标。'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {markUploadError ? (
              <p role="alert" className="text-2xs text-destructive">
                {markUploadError}
              </p>
            ) : null}
            {toolIconError ? (
              <p role="alert" className="text-2xs text-destructive">
                {toolIconError}
              </p>
            ) : null}
            <input
              ref={markInputRef}
              id="puzzle-info-mark"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null;
                event.target.value = '';
                if (!picked) return;
                void uploadMark(picked);
              }}
            />
            <input
              ref={toolIconInputRef}
              id="puzzle-info-tool-icons"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null;
                event.target.value = '';
                const icon = pendingToolIcon;
                setPendingToolIcon(null);
                if (!picked || !icon) return;
                void uploadToolIcon(icon, picked);
              }}
            />
          </Section>

          <Section
            title="题面"
            hint="Brief — 玩家侧这张纸片贴在盘面左上角：描述在上，全局线索在下。全局线索讲整盘的规则（「每条斜线不同」），参与者各自的线索讲「这位住在哪」，两处分开写。结束语只在玩家通过时出现。"
          >
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="puzzle-info-clue-0"
                  className="text-2xs font-normal text-muted-foreground"
                >
                  全局线索
                </Label>
                <span className="text-2xs tabular-nums text-muted-foreground">
                  {draftClues.length} / {PUZZLE_CLUES_MAX_COUNT}
                </span>
              </div>
              {draftClues.length === 0 ? (
                <p className="text-2xs leading-relaxed text-muted-foreground">
                  还没有线索。玩家侧会只显示描述。
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {draftClues.map((clue, index) => (
                    <li key={index} className="flex items-center gap-1">
                      {/* 序号只是一枚小小的数字刻度，不是装饰 —— 玩家侧也是同一列。 */}
                      <span className="w-3 shrink-0 text-2xs tabular-nums text-muted-foreground/70">
                        {index + 1}
                      </span>
                      <Input
                        id={index === 0 ? 'puzzle-info-clue-0' : undefined}
                        value={clue}
                        maxLength={PUZZLE_CLUE_MAX_LENGTH}
                        placeholder={index === 0 ? '例如：同一行里没有重复编号' : '再写一条'}
                        onChange={(event) => patchClue(index, event.target.value)}
                        className="h-7 flex-1 text-xs"
                        aria-label={`第 ${index + 1} 条全局线索`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        title="删除该条线索"
                        onClick={() => removeClue(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={draftClues.length >= PUZZLE_CLUES_MAX_COUNT}
                title={
                  draftClues.length >= PUZZLE_CLUES_MAX_COUNT
                    ? `最多 ${PUZZLE_CLUES_MAX_COUNT} 条`
                    : '新增一条全局线索'
                }
                onClick={addClue}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                新增线索
              </Button>
            </div>

            <div className="grid gap-1.5 pt-1">
              <Label
                htmlFor="puzzle-info-ending"
                className="text-2xs font-normal text-muted-foreground"
              >
                结束语
              </Label>
              <Textarea
                id="puzzle-info-ending"
                value={draftEnding}
                rows={3}
                maxLength={PUZZLE_ENDING_MAX_LENGTH}
                placeholder="例如：灯灭了，花园还在。"
                onChange={(event) => setDraftEnding(event.target.value)}
              />
              <div className="flex justify-end text-2xs text-muted-foreground">
                <span className={draftEnding.length > PUZZLE_ENDING_MAX_LENGTH ? 'font-medium text-destructive' : ''}>
                  {draftEnding.length} / {PUZZLE_ENDING_MAX_LENGTH}
                </span>
              </div>
            </div>
          </Section>

          <Section
            title="参与者布局"
            hint="Roster Layout — 只填列数，行数按参与者数量算出。槽框尺寸固定，面板整体宽度随列数变化；留空则回到自动排列。"
          >
            {/*
              v0.6.3: the control is just 「输入框 × 行数」— the field carries
              the column count, so a 列数 label would only repeat it, and the
              row count is derived, never typed. 自动 (empty field) shows the
              layout the panel will pick on its own.
            */}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={ROSTER_COLS_MAX}
                value={draftCols === null ? '' : String(draftCols)}
                placeholder="自动"
                onChange={(event) => changeCols(event.target.value)}
                className="h-7 w-20 text-xs tabular-nums"
                aria-label="参与者列数"
              />
              <span
                data-testid="roster-layout-preview"
                className="text-xs tabular-nums text-muted-foreground"
              >
                {draftCols === null
                  ? `${previewCols} × ${previewRows}（自动）`
                  : `× ${previewRows}`}
              </span>
            </div>
          </Section>

          <Section
            title="联动主题色"
            hint="Linkage Colors — 参与者联动高亮所用的调色板，最少 2 项、最多 12 项。改动 key 会同步所有引用它的联动。"
          >
            <ul className="space-y-2">
              {/*
                FIX-O17 (docs/v0.5.4.md §7.4): the row's `key` must NOT contain
                the entry's own `key` — every edit to it remounted the row and
                stole focus from the input. The row's identity is its index.
              */}
              {draftPalette.map((entry, index) => (
                <li key={index} className="space-y-1 rounded-md border p-2">
                  <div className="flex items-start gap-1">
                    {/* v0.8.3：与地图抽屉、角色页、概览页同一枚取色控件。 */}
                    <ColorField
                      value={isValidStyleColor(entry.color) ? entry.color : '#888888'}
                      commit={(value) => patchEntry(index, { color: value })}
                      label="联动主题色"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive"
                      title={
                        draftPalette.length <= LINKAGE_COLOR_MIN_COUNT
                          ? `至少保留 ${LINKAGE_COLOR_MIN_COUNT} 项`
                          : '删除该颜色'
                      }
                      disabled={draftPalette.length <= LINKAGE_COLOR_MIN_COUNT}
                      onClick={() => removeEntry(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="w-8 shrink-0 text-2xs font-normal text-muted-foreground">
                      名称
                    </Label>
                    <Input
                      value={entry.label}
                      maxLength={LINKAGE_COLOR_LABEL_MAX_LENGTH}
                      placeholder={entry.key}
                      onChange={(event) => patchEntry(index, { label: event.target.value })}
                      className="h-7 flex-1 text-xs"
                      aria-label="颜色名称"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="w-8 shrink-0 text-2xs font-normal text-muted-foreground">
                      key
                    </Label>
                    <Input
                      value={entry.key}
                      onChange={(event) => renameKey(index, event.target.value)}
                      className="h-7 flex-1 font-mono text-2xs"
                      aria-label="颜色标识"
                    />
                    <span className="shrink-0 text-2xs text-muted-foreground">
                      被引用 {countLinkageColorUsage(draftSlots, entry.key)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={draftPalette.length >= LINKAGE_COLOR_MAX_COUNT}
              onClick={addEntry}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              新增颜色
            </Button>
          </Section>
        </div>

        {/* FEAT-E01: 取消 / 保存 并列固定在底部 */}
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t bg-background px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onRequestClose}>
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={
              !dirty || descriptionOverLimit || nameBlank || markUploading || toolIconUploading !== null
            }
            onClick={() =>
              onCommit({
                name: draftName.trim(),
                description: draftDescription,
                clues: normalizeClues(draftClues),
                ending: draftEnding.trim(),
                linkageColors: draftPalette,
                characterSlots: draftSlots,
                rosterCols: draftCols,
                mark: draftMark,
                toolIcons: draftToolIcons,
                coverFile: draftCoverFile,
                coverRemoved: draftCoverRemoved,
              })
            }
          >
            保存
          </Button>
        </footer>
      </aside>
    );
  },
);
