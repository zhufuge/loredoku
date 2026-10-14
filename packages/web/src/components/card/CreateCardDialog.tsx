import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CARD_CODE_PATTERN } from '@murdoku/shared';
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
import { useCreateCard } from '@/hooks/useCards';

const schema = z.object({
  name: z.string().trim().min(1, '请输入卡片名称').max(100, '名称不能超过 100 字'),
  code: z
    .string()
    .trim()
    .min(1, '请输入业务 ID')
    .max(64, '业务 ID 不能超过 64 字')
    .regex(CARD_CODE_PATTERN, '业务 ID 仅允许字母、数字与下划线'),
});

type FormValues = z.infer<typeof schema>;

interface CreateCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
}

export function CreateCardDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateCardDialogProps): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', code: '' },
  });

  const createMutation = useCreateCard((card) => {
    onOpenChange(false);
    onCreated(card.id);
  });

  useEffect(() => {
    if (!open) {
      reset({ name: '', code: '' });
    }
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    createMutation.mutate({ name: values.name, code: values.code });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建卡片</DialogTitle>
          <DialogDescription>业务 ID 创建后不可修改。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="card-name">名称</Label>
            <Input id="card-name" placeholder="例如：草地" {...register('name')} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="card-code">业务 ID</Label>
            <Input id="card-code" placeholder="grass" {...register('code')} />
            {errors.code ? <p className="text-xs text-destructive">{errors.code.message}</p> : null}
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
