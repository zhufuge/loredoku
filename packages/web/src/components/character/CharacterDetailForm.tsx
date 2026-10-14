import { useEffect, useState } from 'react';
import type { Character } from '@murdoku/shared';
import { CHARACTER_AVATAR_MAX_DIMENSION } from '@murdoku/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ImageUploader } from '@/components/item/ImageUploader';
import {
  useDeleteCharacterAvatar,
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
  const [description, setDescription] = useState(character.description ?? '');
  const [isActive, setIsActive] = useState(character.isActive);

  const updateMutation = useUpdateCharacter();
  const uploadMutation = useUploadCharacterAvatar();
  const deleteAvatarMutation = useDeleteCharacterAvatar();

  useEffect(() => {
    setName(character.name);
    setDescription(character.description ?? '');
    setIsActive(character.isActive);
  }, [character.id, character.updatedAt]);

  const handleSave = (): void => {
    updateMutation.mutate({
      id: character.id,
      payload: { name: name.trim(), description: description.trim() || null, isActive },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{character.name}</h2>
          <p className="text-xs text-muted-foreground">业务 ID：{character.code}（不可修改）</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4"
            />
            启用
          </label>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => onRequestDelete(character)}
          >
            停用 / 删除
          </Button>
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
            onDelete={() => deleteAvatarMutation.mutate(character.id)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>
  );
}
