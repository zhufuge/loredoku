import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { PublishViolation } from '@loredoku/shared';

/**
 * 发布流程只关心「发布出去的那一行叫什么号」——地图与谜题的行类型不同，所以
 * 这里收窄成结构形状，两边的 mutation 都能喂进来。
 */
export interface PublishOutcome {
  ok: boolean;
  violations?: PublishViolation[];
  version?: { versionNo: number | null };
}

export interface PublishMutationLike {
  isPending: boolean;
  mutate: (
    versionNo: number | undefined,
    options?: {
      onSuccess?: (result: PublishOutcome) => void;
      onError?: () => void;
    },
  ) => void;
}

/**
 * the map / puzzle editor's shared publish flow.
 *
 * SPEC-K13 §7.4 (docs/v0.5.0.md): publishing adds an entry to the list
 * (版本管理). With Q3 = B the next version number spans the whole blood
 * lineage, so it is read from the version list rather than from this row's
 * own `current_version_no`.
 *
 * `确认发布`, or `保存并发布` when the canvas is dirty — serial, and a failed
 * save aborts the publish. The dialog stays open while the request flies, and
 * closes on the outcome: success → a toast naming the new version, a
 * validation failure → the 「无法发布」 list.
 *
 * the success **dialog** is gone (user feedback — 提示即可，不需要按钮
 * 跳转). The new version number rides the toast, which also means the flow no
 * longer needs to carry the version summary state back to the page.
 */
export interface EditorPublishSpec {
  /** The whole blood lineage (version history), for the next version number. */
  versions: Array<{ versionNo: number | null }> | undefined;
  currentVersionNo: number | null;
  dirty: boolean;
  /** The save flow's in-flight flag — publishing waits for a running save. */
  saving: boolean;
  /** FIX-F01's single writer — a failed save aborts the publish. */
  persist: () => Promise<boolean>;
  publishMutation: PublishMutationLike;
  /** 列表名词，只用于成功提示（「已在地图列表新增条目」/「谜题列表」）。 */
  entryNoun?: string;
}

export interface EditorPublishFlow {
  publishOpen: boolean;
  setPublishOpen: (open: boolean) => void;
  /** The shared 「无法发布」 dialog's payload (`null` = closed). */
  violations: PublishViolation[] | null;
  setViolations: (violations: PublishViolation[] | null) => void;
  nextVersionNo: number;
  /** 发布弹窗里那个版本号输入框（默认 `nextVersionNo`，可改）。 */
  versionInput: string;
  setVersionInput: (value: string) => void;
  /** 输入框的行内错误（正整数校验 / 血统内重号）。 */
  versionError: string | null;
  setVersionError: (error: string | null) => void;
  /** 失焦时查重，也供 `confirmPublish` 复用。 */
  validateVersion: (value: string) => string | null;
  openPublishConfirm: () => void;
  confirmPublish: () => void;
}

export function useEditorPublish(spec: EditorPublishSpec): EditorPublishFlow {
  const { versions, currentVersionNo, dirty, saving, persist, publishMutation, entryNoun } = spec;
  const [publishOpen, setPublishOpen] = useState(false);
  const [violations, setViolations] = useState<PublishViolation[] | null>(null);
  const [versionInput, setVersionInput] = useState('');
  const [versionError, setVersionError] = useState<string | null>(null);

  const nextVersionNo = useMemo(() => {
    const numbers = (versions ?? [])
      .map((version) => version.versionNo)
      .filter((no): no is number => typeof no === 'number');
    if (numbers.length > 0) return Math.max(...numbers) + 1;
    return (currentVersionNo ?? 0) + 1;
  }, [versions, currentVersionNo]);

  /**
   * 正整数 + 血统内不重号。前端只查得到**可见**
   * 版本（软删的行不在列表里），所以「软删行仍占号」这种情况由服务端 400 兜底。
   */
  const validateVersion = (value: string): string | null => {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (!/^\d+$/.test(trimmed)) return '版本号需为正整数';
    const parsed = Number(trimmed);
    if (parsed < 1) return '版本号需为正整数';
    if (versions?.some((version) => version.versionNo === parsed)) {
      return `版本号 v${parsed} 已存在于该血统中，请换一个`;
    }
    return null;
  };

  const openPublishConfirm = (): void => {
    if (publishMutation.isPending || saving) return;
    setVersionInput(String(nextVersionNo));
    setVersionError(null);
    setPublishOpen(true);
  };

  const confirmPublish = (): void => {
    if (publishMutation.isPending) return;
    const error = validateVersion(versionInput);
    if (error) {
      setVersionError(error);
      return;
    }
    const trimmed = versionInput.trim();
    // 留空或等于默认号就交给服务端续号，避免拿过期默认值撞号。
    const explicit =
      trimmed === '' || Number(trimmed) === nextVersionNo ? undefined : Number(trimmed);
    void (async () => {
      if (dirty && !(await persist())) return;
      publishMutation.mutate(explicit, {
        onSuccess: (result: PublishOutcome) => {
          setPublishOpen(false);
          if (!result.ok) {
            setViolations(result.violations ?? []);
            return;
          }
          toast.success(`已发布 v${result.version?.versionNo ?? ''}`, {
            description: `已在${entryNoun ?? '地图'}列表新增条目。`,
          });
        },
        onError: () => setPublishOpen(false),
      });
    })();
  };

  return {
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
  };
}