import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  APPEARANCE_MODES,
  ASSET_CODE_MAX_LENGTH,
  ASSET_CODE_PATTERN,
  ASSET_NAME_MAX_LENGTH,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  BG_COLOR_PATTERN,
  DEFAULT_APPEARANCE_MODE,
  DEFAULT_ASSET_TYPE,
  DEFAULT_BG_COLOR,
  blockingFor,
  hasAppearance,
  type AppearanceMode,
} from '@loredoku/shared';
import { AppearanceField } from '@/components/appearance/AppearanceField';
import { PendingImageField } from '@/components/appearance/PendingImageField';
import { Button } from '@/components/ui/button';
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
import { SegmentedRadio } from '@/components/ui/segmented-radio';
import { ThemeScopeField } from '@/components/theme/ThemeScopeField';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { useCreateAsset, useUpdateAsset, useUploadAssetVariantImage } from '@/hooks/useAssets';

/** FEAT-O11: the type as radio buttons (背景 / 物品). */
const ASSET_TYPE_OPTIONS = ASSET_TYPES.map((value) => ({
  value,
  label: ASSET_TYPE_LABELS[value],
}));

const schema = z.object({
  name: z.string().trim().min(1, '请输入资源名称').max(ASSET_NAME_MAX_LENGTH, '名称过长'),
  code: z
    .string()
    .trim()
    .min(1, '请输入编码')
    .max(ASSET_CODE_MAX_LENGTH, '编码过长')
    .regex(ASSET_CODE_PATTERN, '编码仅允许字母、数字与下划线'),
  type: z.enum(ASSET_TYPES),
  blocking: z.boolean(),
  /** v0.5.1 FEAT-L01: image mode (default) or a colour block. */
  appearanceMode: z.enum(APPEARANCE_MODES),
  bgColor: z.string().regex(BG_COLOR_PATTERN, '颜色需为 #RRGGBB 格式'),
});

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  name: '',
  code: '',
  type: DEFAULT_ASSET_TYPE,
  blocking: false,
  appearanceMode: DEFAULT_APPEARANCE_MODE,
  bgColor: DEFAULT_BG_COLOR,
};

/**
 * v0.8.1：编码预填 `主题编码_`。同一个编码在不同主题里各自存在，作者敲的
 * 其实只有后半段 —— 前缀替他写好，顺手就把「这东西属于哪个世界」带进了 ID。
 */
function defaultsFor(themeCode: string | null): FormValues {
  return { ...DEFAULTS, code: themeCode ? `${themeCode}_` : '' };
}

interface CreateAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
  /** 没有工作空间上下文时（单测、整屏入口）的兜底主题**编码**（§19）。 */
  defaultThemeCode?: string | null;
}

export function CreateAssetDialog({
  open,
  onOpenChange,
  onCreated,
  defaultThemeCode = null,
}: CreateAssetDialogProps): JSX.Element {
  const workspace = useWorkspace();
  const boundaryThemeCode = workspace?.themeCode ?? defaultThemeCode;
  /** 没有工作空间时才可改。`null` = 还没选，胶囊会同步成列表第一个。 */
  const [themeCode, setThemeCode] = useState<string | null>(boundaryThemeCode);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultsFor(boundaryThemeCode),
  });
  const appearanceMode = watch('appearanceMode');
  const type = watch('type');
  // v0.5.2 FEAT-M05: the picked file waits for the create call to hand back an
  // id; a colour block needs no image at all.
  const [file, setFile] = useState<File | null>(null);
  /**
   * v0.8.0 §18：在工作空间里主题已经由地址定了（`/hlm/assets`），对话框里不再让人换
   * —— 换了就等于把东西建到隔壁去，而 `theme_id` 建行后不可改（§8 护栏 2）。
   */
  const createMutation = useCreateAsset();
  const uploadMutation = useUploadAssetVariantImage();
  /** FEAT-N06 §5.4: reverts an auto-enable whose image never landed. */
  const updateMutation = useUpdateAsset();

  useEffect(() => {
    if (!open) {
      reset(defaultsFor(boundaryThemeCode));
      setFile(null);
      setThemeCode(boundaryThemeCode);
    }
  }, [open, reset, boundaryThemeCode]);

  const busy = createMutation.isPending || uploadMutation.isPending || updateMutation.isPending;

  const onSubmit = handleSubmit(async (values) => {
    // v0.5.1 FEAT-L01: colour block → colour; image mode → null.
    const bgColor = values.appearanceMode === 'color' ? values.bgColor : null;
    /**
     * v0.5.3 FEAT-N06 (docs/v0.5.3.md §5): an appearance handed over at create
     * time enables the asset right away — 「建完还得再点一次启用」 was pure
     * repetition. `hasAppearance` is the same predicate v0.5.1 uses when an
     * image is deleted, so the two can never disagree.
     */
    const isActive = hasAppearance(file !== null, bgColor);
    let asset: { id: number; variants: Array<{ id: number }> };
    try {
      asset = await createMutation.mutateAsync({
        name: values.name,
        code: values.code,
        // 服务端必填（§19）：空字符串会被 schema 拒绝 —— 一个主题都没有时本来就
        // 不该建内容，让它 400 比悄悄落进某个世界好。
        themeCode: themeCode ?? '',
        type: values.type,
        blocking: blockingFor(values.type, values.blocking),
        bgColor,
        isActive,
      });
    } catch {
      // The hook already toasted the reason (e.g. duplicate 编码).
      return;
    }
    // §5.1: an upload failure must not swallow the created asset — the dialog
    // closes either way and the user retries from the detail pane.
    if (file) {
      const uploaded = await uploadMutation
        .mutateAsync({ assetId: asset.id, variantId: asset.variants[0]!.id, file })
        .then(() => true)
        .catch(() => false);
      /**
       * §5.4: the only reason this asset is enabled is the image that just
       * failed to land — put it back to 停用 so no「启用但无外观」row is left.
       * A colour block needs no image, so it stays enabled.
       */
      if (!uploaded && isActive && !bgColor) {
        await updateMutation.mutateAsync({ id: asset.id, payload: { isActive: false } });
      }
    }
    onOpenChange(false);
    onCreated(asset.id);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建资源</DialogTitle>
          <DialogDescription>编码是它在规则与联动里的名字，创建后不可修改。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="asset-name">名称</Label>
            <Input id="asset-name" placeholder="例如：大树" {...register('name')} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          {/*
            v0.8.0 §16.7：名称 → 主题。先说要建什么，再说它建在哪个世界里。
            v0.8.2 §14：在工作空间里这一格**整行不画** —— 地址是 `/:themeCode/...`，
            顶栏圆点旁就写着主题名，弹窗里再复述一遍是第三遍。
          */}
          {workspace ? null : <ThemeScopeField value={themeCode} onChange={setThemeCode} />}
          <div className="grid gap-2">
            <Label htmlFor="asset-code">编码</Label>
            <Input
              id="asset-code"
              aria-describedby="asset-code-hint"
              placeholder={`例如：${themeCode ?? 'theme'}_big_tree`}
              {...register('code')}
            />
            {errors.code ? (
              <p className="text-xs text-destructive">{errors.code.message}</p>
            ) : (
              /*
               * v0.8.1 预填了 `主题编码_`，但那个值在框里就是普通文字 —— 作者看不出
               * 它是前缀，可以整段删掉，也可以改成别的主题的。这条小字把「已经替你
               * 写好了什么」说清，剩下的仍然是他的自由。
               */
              <p id="asset-code-hint" className="text-2xs text-muted-foreground">
                {themeCode ? `前缀 ${themeCode}_ 已填好，接着写后半段` : '只允许字母、数字与下划线'}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="asset-type">类型</Label>
            {/* FEAT-O11 (docs/v0.5.4.md §5.4): buttons instead of a dropdown. */}
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <SegmentedRadio
                  id="asset-type"
                  ariaLabel="类型"
                  value={field.value}
                  options={ASSET_TYPE_OPTIONS}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
          {/* v0.5.2 FEAT-M04: a background asset is never blocking, so the
              checkbox only exists for 物品. */}
          {type === 'item' ? (
            <label className="flex items-center gap-2 text-sm">
              <Controller
                control={control}
                name="blocking"
                render={({ field }) => (
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                    className="h-4 w-4"
                  />
                )}
              />
              阻挡（不可站立、不可放置）
            </label>
          ) : null}
          <Controller
            control={control}
            name="appearanceMode"
            render={({ field }) => (
              <AppearanceField
                id="asset-appearance"
                mode={field.value as AppearanceMode}
                onModeChange={(mode) => field.onChange(mode)}
                bgColor={watch('bgColor')}
                onBgColorChange={(value) => setValue('bgColor', value)}
              >
                {/* v0.5.2 FEAT-M05: upload right here, no "create first"
                    round trip for the user. */}
                <PendingImageField
                  id="asset-image"
                  label="资源图片"
                  file={file}
                  onFileChange={setFile}
                />
              </AppearanceField>
            )}
          />
          {errors.bgColor ? (
            <p className="text-xs text-destructive">{errors.bgColor.message}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? '创建中…' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
