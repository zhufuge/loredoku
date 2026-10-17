import { useMemo, useState } from 'react';
import type { MapVersionSummary, PublishViolation } from '@loredoku/shared';
import type { PublishResult, usePublishProject } from '@/hooks/useVersions';

/**
 * v0.5.6: the map editor's publish flow, lifted out of `EditorPage`.
 *
 * SPEC-K13 §7.4 (docs/v0.5.0.md): publishing adds an entry to the map list
 * (版本管理). With Q3 = B the next version number spans the whole blood
 * lineage, so it is read from the version list rather than from this row's
 * own `current_version_no`.
 *
 * `确认发布`, or `保存并发布` when the canvas is dirty — serial, and a failed
 * save aborts the publish. The dialog stays open while the request flies, and
 * closes on the outcome: success → the success dialog, a validation failure →
 * the 「无法发布」 list.
 */
export interface EditorPublishSpec {
  /** The whole blood lineage (version history), for the next version number. */
  versions: MapVersionSummary[] | undefined;
  currentVersionNo: number | null;
  dirty: boolean;
  /** The save flow's in-flight flag — publishing waits for a running save. */
  saving: boolean;
  /** FIX-F01's single writer — a failed save aborts the publish. */
  persist: () => Promise<boolean>;
  publishMutation: ReturnType<typeof usePublishProject>;
}

export interface EditorPublishFlow {
  publishOpen: boolean;
  setPublishOpen: (open: boolean) => void;
  publishNotes: string;
  setPublishNotes: (notes: string) => void;
  publishedVersion: MapVersionSummary | null;
  setPublishedVersion: (version: MapVersionSummary | null) => void;
  /** The shared 「无法发布」 dialog's payload (`null` = closed). */
  violations: PublishViolation[] | null;
  setViolations: (violations: PublishViolation[] | null) => void;
  nextVersionNo: number;
  openPublishConfirm: () => void;
  confirmPublish: () => void;
}

export function useEditorPublish(spec: EditorPublishSpec): EditorPublishFlow {
  const { versions, currentVersionNo, dirty, saving, persist, publishMutation } = spec;
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishNotes, setPublishNotes] = useState('');
  const [publishedVersion, setPublishedVersion] = useState<MapVersionSummary | null>(null);
  const [violations, setViolations] = useState<PublishViolation[] | null>(null);

  const nextVersionNo = useMemo(() => {
    if (versions && versions.length > 0) {
      return Math.max(...versions.map((version) => version.versionNo)) + 1;
    }
    return (currentVersionNo ?? 0) + 1;
  }, [versions, currentVersionNo]);

  const openPublishConfirm = (): void => {
    if (publishMutation.isPending || saving) return;
    setPublishNotes('');
    setPublishOpen(true);
  };

  const confirmPublish = (): void => {
    if (publishMutation.isPending) return;
    void (async () => {
      if (dirty && !(await persist())) return;
      const notes = publishNotes.trim();
      publishMutation.mutate(
        { notes: notes.length > 0 ? notes : undefined },
        {
          onSuccess: (result: PublishResult) => {
            setPublishOpen(false);
            if (!result.ok) {
              setViolations(result.violations ?? []);
              return;
            }
            setPublishedVersion(result.version ?? null);
          },
          onError: () => setPublishOpen(false),
        },
      );
    })();
  };

  return {
    publishOpen,
    setPublishOpen,
    publishNotes,
    setPublishNotes,
    publishedVersion,
    setPublishedVersion,
    violations,
    setViolations,
    nextVersionNo,
    openPublishConfirm,
    confirmPublish,
  };
}
