import { X } from 'lucide-react';
import type { Character, DraftCell, DraftRegion, Item, PlacedCharacter } from '@murdoku/shared';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { ItemThumbnail } from '@/components/item/ItemThumbnail';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EditorInfoDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  selection: { x: number; y: number } | null;
  cell: DraftCell | undefined;
  region: DraftRegion | undefined;
  placedCharacter: PlacedCharacter | undefined;
  character: Character | undefined;
  itemsById: Map<number, Item>;
  onEditCharacterMeta: () => void;
  onClearCell: () => void;
  onClearObject: () => void;
  onEditRegion: () => void;
  onDeleteRegion: () => void;
  onLocateRegion: () => void;
}

export function EditorInfoDrawer({
  open,
  onClose,
  onOpen,
  selection,
  cell,
  region,
  placedCharacter,
  character,
  itemsById,
  onEditCharacterMeta,
  onClearCell,
  onClearObject,
  onEditRegion,
  onDeleteRegion,
  onLocateRegion,
}: EditorInfoDrawerProps): JSX.Element {
  const backgroundItem =
    cell?.background?.itemId !== undefined ? itemsById.get(cell.background.itemId) : undefined;
  const objectItem = cell?.object?.itemId !== undefined ? itemsById.get(cell.object.itemId) : undefined;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={onOpen}
          className="absolute right-0 top-1/2 z-20 flex h-16 w-2 -translate-y-1/2 items-center justify-center rounded-l-full border border-r-0 bg-background shadow"
          title="展开信息抽屉"
        />      ) : null}
      <aside
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-20 w-80 max-w-[85vw] border-l bg-background/95 shadow-xl backdrop-blur transition-transform duration-200',
          open ? 'pointer-events-auto translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">格位信息</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="关闭"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
          {!selection && !region ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              在画布上点击格位或区域查看详情
            </p>
          ) : (
            <>
              {selection ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2">
                  <span className="text-xs text-muted-foreground">坐标</span>
                  <p className="font-mono text-sm">
                    C{selection.x + 1} R{selection.y + 1}
                  </p>
                </div>
              ) : null}

              <section className="space-y-1">
                <h3 className="text-xs font-medium text-muted-foreground">所属区域</h3>
                {region ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full border"
                        style={{ backgroundColor: region.color, borderColor: region.color }}
                      />
                      <span className="truncate text-sm">{region.name}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {region.id}
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <div className="flex justify-between">
                        <dt>边界线宽</dt>
                        <dd className="text-foreground">{region.borderWidth}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>填充透明度</dt>
                        <dd className="text-foreground">{region.fillOpacity}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>包含格子数</dt>
                        <dd className="text-foreground">{region.cells.length}</dd>
                      </div>
                    </dl>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={onEditRegion}>
                        编辑
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={onLocateRegion}>
                        定位
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 flex-1 text-[11px] text-destructive hover:text-destructive"
                        onClick={onDeleteRegion}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">无</p>
                )}
              </section>

              <section className="space-y-1">
                <h3 className="text-xs font-medium text-muted-foreground">背景层</h3>
                {backgroundItem ? (
                  <div className="flex items-center gap-2">
                    <ItemThumbnail item={backgroundItem} className="h-8 w-8" />
                    <span className="truncate text-sm">{backgroundItem.name}</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">空</p>
                )}
              </section>

              <section className="space-y-1">
                <h3 className="text-xs font-medium text-muted-foreground">物体层</h3>
                {objectItem ? (
                  <div className="flex items-center gap-2">
                    <ItemThumbnail item={objectItem} className="h-8 w-8" />
                    <span className="truncate text-sm">{objectItem.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {cell?.object?.w}×{cell?.object?.h}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">空</p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">角色</h3>
                {placedCharacter ? (
                  <div className="space-y-2 rounded-md border p-2">
                    <div className="flex items-center gap-2">
                      {character ? (
                        <CharacterThumbnail character={character} className="h-8 w-8" />
                      ) : null}
                      <span className="truncate text-sm">
                        {character?.name ?? `#${placedCharacter.characterId}`}
                      </span>
                    </div>
                    <Button size="sm" variant="outline" className="w-full" onClick={onEditCharacterMeta}>
                      编辑地图元数据
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">无</p>
                )}
              </section>

              <section className="space-y-1">
                <h3 className="text-xs font-medium text-muted-foreground">快捷操作</h3>
                {selection ? (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={onClearCell}>
                      清空本格
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={onClearObject}>
                      清空物件层
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">选择一个格位后可用</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
      </aside>
    </>
  );
}
