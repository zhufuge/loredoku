import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  CHARACTER_CODE_MAX_LENGTH,
  CHARACTER_CODE_PATTERN,
  CHARACTER_DESCRIPTION_MAX_LENGTH,
  CHARACTER_GENDERS,
  CHARACTER_GENDER_GLYPHS,
  CHARACTER_GENDER_LABELS,
  CHARACTER_NAME_MAX_LENGTH,
  DEFAULT_CHARACTER_GENDER,
  GENDER_SYMBOL_COLORS,
} from '@murdoku/shared';
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
import { Textarea } from '@/components/ui/textarea';
import { useCreateCharacter } from '@/hooks/useCharacters';

const schema = z.object({
  name: z.string().trim().min(1, '请输入角色名称').max(CHARACTER_NAME_MAX_LENGTH, '名称过长'),
  code: z
    .string()
    .trim()
    .min(1, '请输入业务 ID')
    .max(CHARACTER_CODE_MAX_LENGTH, '业务 ID 过长')
    .regex(CHARACTER_CODE_PATTERN, '业务 ID 仅允许字母、数字与下划线'),
  gender: z.enum(CHARACTER_GENDERS),
  description: z.string().trim().max(CHARACTER_DESCRIPTION_MAX_LENGTH, '描述过长').optional(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  name: '',
  code: '',
  gender: DEFAULT_CHARACTER_GENDER,
  description: '',
};

interface CreateCharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
}

export function CreateCharacterDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateCharacterDialogProps): JSX.Element {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  const createMutation = useCreateCharacter((character) => {
    onOpenChange(false);
    onCreated(character.id);
  });

  useEffect(() => {
    if (!open) reset(DEFAULTS);
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    createMutation.mutate({
      name: values.name,
      code: values.code,
      gender: values.gender,
      description: values.description || undefined,
    });
  });

  const gender = watch('gender');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建角色</DialogTitle>
          <DialogDescription>业务 ID 创建后不可修改。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="character-name">名称</Label>
            <Input id="character-name" placeholder="例如：侦探" {...register('name')} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="character-code">业务 ID</Label>
            <Input id="character-code" placeholder="detective" {...register('code')} />
            {errors.code ? <p className="text-xs text-destructive">{errors.code.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label>性别</Label>
            {/* CLAR-601: segmented control — only 男 / 女, default 男. */}
            <div
              role="radiogroup"
              aria-label="性别"
              className="inline-flex overflow-hidden rounded-md border"
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? '创建中…' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
