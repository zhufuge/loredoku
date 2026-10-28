import { useEffect, useState } from 'react';
import type { AppearanceMode, Character, CharacterGender } from '@loredoku/shared';
import {
  CHARACTER_AVATAR_MAX_DIMENSION,
  CHARACTER_DISPLAY_NAME_MAX,
  CHARACTER_GENDERS,
  CHARACTER_GENDER_GLYPHS,
  CHARACTER_GENDER_LABELS,
  DEFAULT_BG_COLOR,
  DEFAULT_THEME_COLOR,
  GENDER_SYMBOL_COLORS,
  hasAppearance,
} from '@loredoku/shared';
import { AppearanceField } from '@/components/appearance/AppearanceField';
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
import { ColorField } from '@/components/ui/color-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { GenderBadge } from '@/components/character/GenderBadge';
import { ImageUploader } from '@/components/asset/ImageUploader';
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
  // CLAR-601: default is `male`; missing values normalise upstream.
  const [gender, setGender] = useState<CharacterGender>(character.gender ?? 'male');
  const [description, setDescription] = useState(character.description ?? '');
  // v0.5.1 FEAT-L02: image mode by default; a stored colour means colour block.
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(
    character.bgColor ? 'color' : 'image',
  );
  const [bgColor, setBgColor] = useState(character.bgColor ?? DEFAULT_BG_COLOR);
  /**
   * v0.7.13：参与者默认值。这两项和 `bgColor` 没关系 —— 那个是角色自己的长相。
   *
   * 主题色**不是一个开关**：取色器常驻，白色就是「没指定」（§11.4），所以初值
   * 是 `character.color ?? DEFAULT_THEME_COLOR`，而白色会在 schema 那一层塌成
   * `null`、不落库。这里只管显示，不重复那条规则。
   */
  const [color, setColor] = useState(character.color ?? DEFAULT_THEME_COLOR);
  const [displayName, setDisplayName] = useState(character.displayName ?? '');
  const [confirmDeleteAvatar, setConfirmDeleteAvatar] = useState(false);

  const updateMutation = useUpdateCharacter();
  const uploadMutation = useUploadCharacterAvatar();
  const deleteAvatarMutation = useDeleteCharacterAvatar();
  const activeMutation = useSetCharacterActive();

  /**
   * 只在**换了一个角色**时用服务器值重置表单。
   *
   * v0.7.13 fix：这里原本还依赖 `character.updatedAt`，本意是「保存后以服务器
   * 为准」，副作用却是**任何一次重取都会把用户没保存的输入冲掉**：上传头像、
   * 启用、停用都会 `invalidate`，`updatedAt` 一变，纯色角色的 `appearanceMode`
   * 就被按回 `character.bgColor ? 'color' : 'image'` —— 于是「传完图片提示成功、
   * 外观却跳回纯色块」。改名后点「停用」，名字同样会悄悄回滚。
   *
   * 表单是**用户正在编辑的草稿**，不该被后台刷新覆盖；以记录 id 为界更符合它的
   * 语义（换记录 = 换内容，同一条记录的刷新 = 别的按钮干的活）。
   */
  useEffect(() => {
    setName(character.name);
    setGender(character.gender ?? 'male');
    setDescription(character.description ?? '');
    setAppearanceMode(character.bgColor ? 'color' : 'image');
    setBgColor(character.bgColor ?? DEFAULT_BG_COLOR);
    setColor(character.color ?? DEFAULT_THEME_COLOR);
    setDisplayName(character.displayName ?? '');
  }, [character.id]);

  // v0.5.1 FEAT-L02: an uploaded avatar **or** a colour block can be activated.
  const activatable = hasAppearance(Boolean(character.avatarUrl), character.bgColor);

  const handleSave = (): void => {
    updateMutation.mutate({
      id: character.id,
      payload: {
        name: name.trim(),
        gender,
        description: description.trim() || null,
        // v0.5.1 FEAT-L02: colour block → colour; image mode → null.
        bgColor: appearanceMode === 'color' ? bgColor : null,
        // v0.7.13: 参与者默认值。白色 = 没有默认（schema 那一层塌成 null），
        // 编号留空同理 —— 清掉就是真的清掉，不是「留空表示不改」。
        color,
        displayName: displayName.trim() || null,
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
              <span className="rounded bg-success/10 px-1.5 py-0.5 text-2xs text-success">
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
              <span className="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
                {activatable ? '已停用' : '未启用'}
              </span>
              <Button
                variant="outline"
                disabled={activeMutation.isPending || !activatable}
                title={activatable ? undefined : '请先上传头像或选择纯色块颜色后再启用'}
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
          {/* CLAR-601 + MOD-704: segmented control, fixed width ~130px */}
          <div
            id="character-gender"
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
                  onClick={() => setGender(item)}
                  className={
                    'flex items-center gap-1 px-4 py-1.5 text-sm transition-colors ' +
                    (selected
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-accent')
                  }
                  style={{ minWidth: 60 }}
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
          <Label>描述</Label>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
          />
        </div>

        {/*
         * v0.7.13：参与者默认值。
         *
         * 这两项不描述角色长什么样，而是「这个角色被 加入 到谜题参与者区时，
         * 槽位的主题色 / 编号该是什么」。
         *
         * 主题色**没有开关**：取色器常驻，白色表示「没指定」—— 槽位本来就是
         * 白的，把白色当成未指定，界面上少一个「勾不勾」的判断，库里也少存
         * 一行默认值（§11.4）。
         */}
        <div className="grid gap-2">
          <Label>默认主题色</Label>
          <ColorField value={color} commit={setColor} label="默认主题色" />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="character-display-name">默认编号</Label>
          <Input
            id="character-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={CHARACTER_DISPLAY_NAME_MAX}
            className="max-w-sm"
            data-testid="default-display-name-input"
          />
        </div>

        {/* v0.5.1 FEAT-L02 / SPEC-L03: 「头像」区升级为「外观」区。 */}
        <AppearanceField
          mode={appearanceMode}
          onModeChange={setAppearanceMode}
          bgColor={bgColor}
          onBgColorChange={setBgColor}
        >
          <ImageUploader
            imageUrl={character.avatarUrl}
            thumbUrl={character.avatarThumbUrl}
            maxDimension={CHARACTER_AVATAR_MAX_DIMENSION}
            uploading={uploadMutation.isPending}
            deleting={deleteAvatarMutation.isPending}
            onUpload={(file) =>
              uploadMutation.mutate(
                { id: character.id, file },
                // v0.7.13 fix: 传完就站在图片这一侧。角色可能原本是纯色块，
                // 用户切到「图片」+ 上传就是想把外观换成图 —— 上传成功后再让
                // 他把模式手动点一遍是多余的一步。真正的落库仍等他按「保存」。
                { onSuccess: () => setAppearanceMode('image') },
              )
            }
            onDelete={() => setConfirmDeleteAvatar(true)}
          />
        </AppearanceField>
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
            <AlertDialogDescription>
              {/* v0.5.1 FEAT-L02: a colour block does not depend on the avatar. */}
              {character.bgColor
                ? '该角色是纯色块，删除头像后仍可继续启用。'
                : '删除头像后，该角色将自动停用。'}
            </AlertDialogDescription>
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
