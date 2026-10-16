import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Project } from '@loredoku/shared';
import { GRID_SIZE_DEFAULT, GRID_SIZE_MAX, GRID_SIZE_MIN } from '@loredoku/shared';
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
import { useCreateProject, useUpdateProject } from '@/hooks/useProjects';

const createSchema = z.object({
  name: z.string().trim().min(1, '请输入项目名称').max(100, '名称不能超过 100 字'),
  description: z.string().trim().max(500, '描述不能超过 500 字').optional(),
  gridSize: z
    .number({ invalid_type_error: '请输入画布尺寸' })
    .int('画布尺寸必须为整数')
    .min(GRID_SIZE_MIN, `画布尺寸不能小于 ${GRID_SIZE_MIN}`)
    .max(GRID_SIZE_MAX, `画布尺寸不能大于 ${GRID_SIZE_MAX}`),
});

type CreateFormValues = z.infer<typeof createSchema>;

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
}: CreateProjectDialogProps): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', description: '', gridSize: GRID_SIZE_DEFAULT },
  });

  const createMutation = useCreateProject(() => {
    onOpenChange(false);
  });

  useEffect(() => {
    if (!open) {
      reset({ name: '', description: '', gridSize: GRID_SIZE_DEFAULT });
    }
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    createMutation.mutate({
      name: values.name,
      description: values.description?.trim() ? values.description.trim() : undefined,
      gridSize: values.gridSize,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建项目</DialogTitle>
          <DialogDescription>创建后画布尺寸（n × n）不可修改。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="project-name">名称</Label>
            <Input id="project-name" placeholder="例如：新手村地图" {...register('name')} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-description">描述</Label>
            <Textarea
              id="project-description"
              placeholder="选填"
              {...register('description')}
            />
            {errors.description ? (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-grid-size">画布尺寸 n（{GRID_SIZE_MIN}~{GRID_SIZE_MAX}）</Label>
            <Input
              id="project-grid-size"
              type="number"
              min={GRID_SIZE_MIN}
              max={GRID_SIZE_MAX}
              {...register('gridSize', { valueAsNumber: true })}
            />
            {errors.gridSize ? (
              <p className="text-xs text-destructive">{errors.gridSize.message}</p>
            ) : null}
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

const editSchema = z.object({
  name: z.string().trim().min(1, '请输入项目名称').max(100, '名称不能超过 100 字'),
  description: z.string().trim().max(500, '描述不能超过 500 字').optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

interface EditProjectDialogProps {
  project: Project | null;
  onOpenChange: (open: boolean) => void;
}

export function EditProjectDialog({ project, onOpenChange }: EditProjectDialogProps): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: '', description: '' },
  });

  const updateMutation = useUpdateProject(() => {
    onOpenChange(false);
  });

  useEffect(() => {
    if (project) {
      reset({ name: project.name, description: project.description ?? '' });
    }
  }, [project, reset]);

  const onSubmit = handleSubmit((values) => {
    if (!project) return;
    updateMutation.mutate({
      id: project.id,
      payload: {
        name: values.name,
        description: values.description?.trim() ? values.description.trim() : null,
      },
    });
  });

  return (
    <Dialog open={project !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重命名项目</DialogTitle>
          <DialogDescription>画布尺寸不可修改。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="edit-project-name">名称</Label>
            <Input id="edit-project-name" {...register('name')} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-project-description">描述</Label>
            <Textarea id="edit-project-description" {...register('description')} />
            {errors.description ? (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
