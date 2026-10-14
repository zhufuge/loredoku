import { useEffect, useState } from 'react';
import type { Character, CharacterGender } from '@murdoku/shared';
import {
  CHARACTER_AVATAR_MAX_DIMENSION,
  CHARACTER_GENDERS,
  CHARACTER_GENDER_LABELS,
} from '@murdoku/shared';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { GenderBadge } from '@/components/character/GenderBadge';
import { ImageUploader } from '@/components/item/ImageUploader';
import {
  useDeleteCharacterAvatar,
  useSetCharacterActive,
  useUpdateCharacter,
  useUploadCharacterAvatar,
} from '@/hooks/useCharacters';

interface CharacterDetailFormProps {
  character: Character;
  onRequestDelete: (character: Character) => void;
}

export function CharacterDetailForm({
  character,
  onRequestDelete,
}: CharacterDetailFormProps): JSX.Element {
  const [name, setName] = useState(character.name);
  const [gender, setGender] = useState<CharacterGender>(character.gender ?? 'unknown');
  const [description, setDescription] = useState(character.description ?? '');
  const [confirmDeleteAvatar, setConfirmDeleteAvatar] = useState(false);

  const updateMutation = useUpdateCharacter();
  const uploadMutation = useUploadCharacterAvatar();
  const deleteAvatarMutation = useDeleteCharacterAvatar();
  const activeMutation = useSetCharacterActive();

  useEffect(() => {
    setName(character.name);
    setGender(character.gender ?? 'unknown');
    setDescription(character.description ?? '');
  }, [character.id, character.updatedAt]);

  const handleSave = (): void => {
    updateMutation.mutate({
      id: character.id,
      payload: {
        name: name.trim(),
        gender,
        description: description.trim() || null,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            {character.name}
            <GenderBadge gender={character.gender} />
          </h2>
          <p className="text-xs text-muted-foreground">业务 ID：{character.code}（不可修改）</p>
        </div>
        <div className="flex items-center gap-2">
          {character.isActive ? (
            <>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                启用中
              </span>
              <Button
                variant="outline"
                disabled={activeMutation.isPending}
                onClick={() => activeMutation.mutate({ id: character.id, active: false })}
              >
                停用
              </Button>
            </>
          ) : (
            <>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {character.avatarUrl ? '已停用' : '未启用'}
              </span>
              <Button
                variant="outline"
                disabled={activeMutation.isPending || !character.avatarUrl}
                title={character.avatarUrl ? undefined : '请先上传头像后再启用'}
                onClick={() => activeMutation.mutate({ id: character.id, active: true })}
              >
                启用
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => onRequestDelete(character)}
              >
                删除
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label>名称</Label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="max-w-sm"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="character-gender">性别</Label>
          <Select
            id="character-gender"
            className="max-w-sm"
            value={gender}
            onChange={(event) => setGender(event.target.value as CharacterGender)}
          >
            {CHARACTER_GENDERS.map((item) => (
              <option key={item} value={item}>
                {CHARACTER_GENDER_LABELS[item]}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>描述</Label>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
          />
        </div>

        <div className="grid gap-2">
          <Label>头像</Label>
          <ImageUploader
            imageUrl={character.avatarUrl}
            thumbUrl={character.avatarThumbUrl}
            width={character.avatarWidth}
            height={character.avatarHeight}
            size={character.avatarSize}
            maxDimension={CHARACTER_AVATAR_MAX_DIMENSION}
            uploading={uploadMutation.isPending}
            deleting={deleteAvatarMutation.isPending}
            onUpload={(file) => uploadMutation.mutate({ id: character.id, file })}
            onDelete={() => setConfirmDeleteAvatar(true)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? '保存中…' : '保存'}
        </Button>
      </div>

      <AlertDialog
        open={confirmDeleteAvatar}
        onOpenChange={(open) => {
          if (!open && !deleteAvatarMutation.isPending) setConfirmDeleteAvatar(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除头像？</AlertDialogTitle>
            <AlertDialogDescription>删除头像后，该角色将自动停用。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAvatarMutation.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteAvatarMutation.isPending}
              onClick={() =>
                deleteAvatarMutation.mutate(character.id, {
                  onSuccess: () => setConfirmDeleteAvatar(false),
                })
              }
            >
              {deleteAvatarMutation.isPending ? '删除中…' : '删除并停用'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
