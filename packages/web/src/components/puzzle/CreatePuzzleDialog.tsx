import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Map as MapIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  PUZZLE_CODE_MAX_LENGTH,
  PUZZLE_DESCRIPTION_MAX_LENGTH,
  PUZZLE_NAME_MAX_LENGTH,
  puzzleCodeError,
  type PublishedMapVersion,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { CoverPicker } from '@/components/common/CoverPicker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreatePuzzle } from '@/hooks/usePuzzles';
import { usePublishedVersions } from '@/hooks/useMaps';
import { formatDateTimeMinute } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LoadingBlock } from '@/components/common/LoredokuLoader';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { fullscreenPath } from '@/lib/workspace';
import { workshopPath } from '@/lib/workspace';

/**
 * FEAT-K03 (docs/v0.5.0.md §2.4): the 「新建谜题」 dialog. Three fields —
 * 名称 (required) / 描述 (optional) / 地图版本 (required).
 *
 * The 地图版本 picker lists **published** map versions and nothing else: a
 * puzzle draws on a frozen snapshot, so an unpublished work entry has no canvas
 * to reference yet. Selecting one pins the canvas size (`n × n`), which is why
 * the dialog says so out loud before the puzzle exists.
 *
 * `?new={mapId}:{versionNo}` (from the map list's version entries, §7.1) is
 * read here so 「以此版本新建谜题」 arrives with the version already picked.
 *
 * v0.8.5 §7：多一格**编码**。它不跟着名称长 —— 名称是中文（`午夜花园`），编码要
 * 是地址（`midnight-garden`），从前者推不出后者，硬推只会推出一串空。所以这一格
 * 由作者自己写，写什么就变成部署时预填的那条路径。
 */
export function CreatePuzzleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const [searchParams] = useSearchParams();
  const versionsQuery = usePublishedVersions();
  const create = useCreatePuzzle((id) => {
    onOpenChange(false);
    // v0.8.1：编辑器在同一个工作空间里（`/:themeCode/puzzles/:id/edit`）。
    navigate(fullscreenPath(workspace?.themeCode, 'puzzles', id, 'edit'));
  });

  const [name, setName] = useState('');
  /** v0.8.5 §7：编码。与名称**不联动** —— 这一格是地址，得一格格敲。 */
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** 封面在建行之后才传（上传端点认 id），由 `useCreatePuzzle` 一并完成。 */
  const [cover, setCover] = useState<File | null>(null);

  const versions = useMemo(() => versionsQuery.data ?? [], [versionsQuery.data]);

  /** `{mapId}:{versionNo}` — the identity of one published version. */
  const keyOf = (version: PublishedMapVersion): string =>
    `${version.mapId}:${version.versionNo}`;

  const selected = useMemo(
    () => versions.find((version) => keyOf(version) === selectedKey) ?? null,
    [versions, selectedKey],
  );

  // Every open starts clean; `?new=` pre-picks the version when it exists.
  useEffect(() => {
    if (!open) return;
    setName('');
    setCode('');
    setDescription('');
    setSelectedKey(null);
    setCover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const preset = searchParams.get('new');
    if (!preset) return;
    if (versions.some((version) => keyOf(version) === preset)) setSelectedKey(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, searchParams, versions]);

  /**
   * 编码只在作者已经开始写的时候才报错 —— 一个刚打开的弹窗没必要先红一片。
   * 「必填」这件事由 `canSubmit` 表达：没填就是按不下去。
   */
  const codeProblem = code.trim().length > 0 ? puzzleCodeError(code) : null;

  const canSubmit =
    name.trim().length > 0 &&
    code.trim().length > 0 &&
    codeProblem === null &&
    selected !== null &&
    !create.isPending;

  const submit = (): void => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      toast.error('请填写谜题名称');
      return;
    }
    const trimmedCode = code.trim();
    const codeIssue = puzzleCodeError(trimmedCode);
    if (codeIssue) {
      toast.error(codeIssue);
      return;
    }
    if (!selected) {
      toast.error('请选择一个已发布的地图版本');
      return;
    }
    const trimmedDescription = description.trim();
    create.mutate({
      name: trimmed,
      code: trimmedCode,
      description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
      mapId: selected.mapId,
      mapVersionNo: selected.versionNo,
      cover,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>新建谜题</DialogTitle>
          <DialogDescription>
            谜题引用一个已发布的地图版本作为画布，参与者与联动主题色由谜题自己持有。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="create-puzzle-name">名称</Label>
            <Input
              id="create-puzzle-name"
              value={name}
              maxLength={PUZZLE_NAME_MAX_LENGTH}
              placeholder="例如：午夜花园"
              disabled={create.isPending}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          {/* v0.8.5 §7：编码紧跟在名称后面 —— 它是这一关的第二个「名字」，一个是给人读的，
              一个是给地址用的。 */}
          <div className="space-y-1.5">
            <Label htmlFor="create-puzzle-code">编码</Label>
            <Input
              id="create-puzzle-code"
              value={code}
              maxLength={PUZZLE_CODE_MAX_LENGTH}
              placeholder="小写字母、数字与连字符，创建后不可改"
              autoComplete="off"
              spellCheck={false}
              disabled={create.isPending}
              aria-invalid={codeProblem !== null}
              onChange={(event) => setCode(event.target.value)}
            />
            {codeProblem ? (
              <p className="text-2xs text-destructive">{codeProblem}</p>
            ) : (
              <p className="text-2xs text-muted-foreground">部署时用它预填访问路径。</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-puzzle-description">描述（选填）</Label>
            <Textarea
              id="create-puzzle-description"
              value={description}
              rows={3}
              maxLength={PUZZLE_DESCRIPTION_MAX_LENGTH}
              placeholder="一句话说明这个谜题的玩法或背景"
              disabled={create.isPending}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <CoverPicker
            noun="谜题"
            storedUrl={null}
            file={cover}
            removed={false}
            disabled={create.isPending}
            onPick={setCover}
            onRemove={() => setCover(null)}
          />

          <div className="space-y-1.5">
            <span className="text-sm font-medium">地图版本</span>
            {versionsQuery.isLoading ? (
              <LoadingBlock caption="正在加载已发布的地图版本…" className="py-6" />
            ) : versions.length === 0 ? (
              <div className="space-y-2 rounded-md border border-dashed bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  还没有已发布的地图版本，请先到「地图」里发布一个版本。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(workshopPath('maps'))}
                >
                  <MapIcon className="mr-1 h-3.5 w-3.5" />
                  前往地图
                </Button>
              </div>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
                {versions.map((version) => {
                  const key = keyOf(version);
                  const checked = key === selectedKey;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        aria-pressed={checked}
                        disabled={create.isPending}
                        onClick={() => setSelectedKey(key)}
                        className={cn(
                          'w-full rounded px-2 py-1.5 text-left text-xs transition-colors',
                          checked ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent',
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{version.mapName}</span>
                          <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-2xs tabular-nums">
                            v{version.versionNo}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                          {version.gridSize}×{version.gridSize} · 发布于{' '}
                          {formatDateTimeMinute(version.publishedAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {selected ? (
              <p className="text-2xs text-muted-foreground">
                画布尺寸 {selected.gridSize}×{selected.gridSize} 由所选地图版本决定，创建后不可修改。
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={create.isPending}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {create.isPending ? '创建中…' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
