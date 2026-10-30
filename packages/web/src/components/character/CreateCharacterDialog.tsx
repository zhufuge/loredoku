import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  APPEARANCE_MODES,
  BG_COLOR_PATTERN,
  CHARACTER_CODE_MAX_LENGTH,
  CHARACTER_CODE_PATTERN,
  CHARACTER_DESCRIPTION_MAX_LENGTH,
  CHARACTER_GENDERS,
  CHARACTER_GENDER_GLYPHS,
  CHARACTER_GENDER_LABELS,
  CHARACTER_NAME_MAX_LENGTH,
  DEFAULT_APPEARANCE_MODE,
  DEFAULT_BG_COLOR,
  DEFAULT_CHARACTER_GENDER,
  GENDER_SYMBOL_COLORS,
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
import { ThemeScopeField } from '@/components/theme/ThemeScopeField';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateCharacter,
  useUpdateCharacter,
  useUploadCharacterAvatar,
} from '@/hooks/useCharacters';

const schema = z.object({
  name: z.string().trim().min(1, '请输入角色名称').max(CHARACTER_NAME_MAX_LENGTH, '名称过长'),
  code: z
    .string()
    .trim()
    .min(1, '请输入编码')
    .max(CHARACTER_CODE_MAX_LENGTH, '编码过长')
    .regex(CHARACTER_CODE_PATTERN, '编码仅允许字母、数字与下划线'),
  gender: z.enum(CHARACTER_GENDERS),
  description: z.string().trim().max(CHARACTER_DESCRIPTION_MAX_LENGTH, '描述过长').optional(),
  /** v0.5.1 FEAT-L02: image mode (default) or a colour block. */
  appearanceMode: z.enum(APPEARANCE_MODES),
  bgColor: z.string().regex(BG_COLOR_PATTERN, '颜色需为 #RRGGBB 格式'),
});

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  name: '',
  code: '',
  gender: DEFAULT_CHARACTER_GENDER,
  description: '',
  appearanceMode: DEFAULT_APPEARANCE_MODE,
  bgColor: DEFAULT_BG_COLOR,
};

/**
 * v0.8.1：编码预填 `主题编码_` —— 作者只敲后半段，前缀替他写好。
 */
function defaultsFor(themeCode: string | null): FormValues {
  return { ...DEFAULTS, code: themeCode ? `${themeCode}_` : '' };
}

interface CreateCharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
  /** 没有工作空间上下文时（单测、整屏入口）的兜底主题**编码**（§19）。 */
  defaultThemeCode?: string | null;
}

export function CreateCharacterDialog({
  open,
  onOpenChange,
  onCreated,
  defaultThemeCode = null,
}: CreateCharacterDialogProps): JSX.Element {
  const workspace = useWorkspace();
  const boundaryThemeCode = workspace?.themeCode ?? defaultThemeCode;
  const [themeCode, setThemeCode] = useState<string | null>(boundaryThemeCode);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultsFor(boundaryThemeCode),
  });

  const createMutation = useCreateCharacter();
  const uploadMutation = useUploadCharacterAvatar();
  /** FEAT-N06 §5.4: reverts an auto-enable whose avatar never landed. */
  const updateMutation = useUpdateCharacter();
  // v0.5.2 FEAT-M05: the avatar can be picked before the character exists.
  const [file, setFile] = useState<File | null>(null);
  /**
   * v0.8.0 §18：在工作空间里主题已由地址定了（`/hlm/characters`），对话框不再让人换
   * —— 换了就等于建到隔壁去，而 `theme_id` 建行后不可改（§8 护栏 2）。
   */
  useEffect(() => {
    if (!open) {
      reset(defaultsFor(boundaryThemeCode));
      setFile(null);
      setThemeCode(boundaryThemeCode);
    }
  }, [open, reset, boundaryThemeCode]);

  const busy =
    createMutation.isPending || uploadMutation.isPending || updateMutation.isPending;

  const onSubmit = handleSubmit(async (values) => {
    // v0.5.1 FEAT-L02: colour block → colour; image mode → null.
    const bgColor = values.appearanceMode === 'color' ? values.bgColor : null;
    /**
     * v0.5.3 FEAT-N06 (docs/v0.5.3.md §5): an avatar or a colour block handed
     * over at create time enables the character right away.
     */
    const isActive = hasAppearance(file !== null, bgColor);
    let character: { id: number };
    try {
      character = await createMutation.mutateAsync({
        name: values.name,
        code: values.code,
        themeCode: themeCode ?? '',
        gender: values.gender,
        description: values.description || undefined,
        bgColor,
        isActive,
      });
    } catch {
      return;
    }
    // §5.1: a failed upload leaves the character in place.
    if (file) {
      const uploaded = await uploadMutation
        .mutateAsync({ id: character.id, file })
        .then(() => true)
        .catch(() => false);
      // §5.4: 启用 but no avatar and no colour block → back to 停用.
      if (!uploaded && isActive && !bgColor) {
        await updateMutation.mutateAsync({
          id: character.id,
          payload: { isActive: false },
        });
      }
    }
    onOpenChange(false);
    onCreated(character.id);
  });

  const gender = watch('gender');
  const appearanceMode = watch('appearanceMode');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建角色</DialogTitle>
          <DialogDescription>编码是它在规则与联动里的名字，创建后不可修改。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="character-name">名称</Label>
            <Input id="character-name" placeholder="例如：侦探" {...register('name')} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          {/* v0.8.0 §16.7：名称 → 主题。v0.8.2 §14：工作空间里整行不画（地址说过了）。 */}
          {workspace ? null : <ThemeScopeField value={themeCode} onChange={setThemeCode} />}
          <div className="grid gap-2">
            <Label htmlFor="character-code">编码</Label>
            <Input
              id="character-code"
              aria-describedby="character-code-hint"
              placeholder={`例如：${themeCode ?? 'theme'}_detective`}
              {...register('code')}
            />
            {errors.code ? (
              <p className="text-xs text-destructive">{errors.code.message}</p>
            ) : (
              /* v0.8.2：把「前缀已经替你写好」说出来，见 CreateAssetDialog 同一处。 */
              <p id="character-code-hint" className="text-2xs text-muted-foreground">
                {themeCode ? `前缀 ${themeCode}_ 已填好，接着写后半段` : '只允许字母、数字与下划线'}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label>性别</Label>
            {/* CLAR-601 + MOD-704: segmented control, fixed width */}
            <div
              role="radiogroup"
              aria-label="性别"
              className="inline-flex overflow-hidden rounded-md border"
              style={{ width: 'max-content' }}
            >
              {CHARACTER_GENDERS.map((item) => {
                const selected = gender === item;
                return (
                  <button
                    key={item}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setValue('gender', item, { shouldDirty: true })}
                    className={
                      'flex items-center gap-1 px-4 py-1.5 text-sm transition-colors ' +
                      (selected
                        ? 'bg-secondary text-secondary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-accent')
                    }
                  >
                    <span style={{ color: GENDER_SYMBOL_COLORS[item] }}>
                      {CHARACTER_GENDER_GLYPHS[item]}
                    </span>
                    <span className="ml-1">{CHARACTER_GENDER_LABELS[item]}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="character-desc">描述</Label>
            <Textarea id="character-desc" placeholder="选填" rows={2} {...register('description')} />
          </div>
          <AppearanceField
            mode={appearanceMode as AppearanceMode}
            onModeChange={(mode) => setValue('appearanceMode', mode, { shouldDirty: true })}
            bgColor={watch('bgColor')}
            onBgColorChange={(value) => setValue('bgColor', value.toUpperCase(), { shouldDirty: true })}
          >
            {/* v0.5.2 FEAT-M05: upload the avatar right here. */}
            <PendingImageField
              id="character-avatar"
              label="角色头像"
              file={file}
              onFileChange={setFile}
            />
          </AppearanceField>
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
