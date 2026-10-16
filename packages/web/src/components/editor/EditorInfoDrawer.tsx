import type { Character, DraftCell, DraftRegion, Item } from '@loredoku/shared';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { ItemThumbnail } from '@/components/item/ItemThumbnail';
import { Button } from '@/components/ui/button';
import { regionAt } from '@/lib/region';
import type { Selection } from '@/stores/editorStore';

interface EditorInfoDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  selection: Selection | null;
  cells: Map<string, DraftCell>;
  regions: DraftRegion[];
  charactersById: Map<number, Character>;
  itemsById: Map<number, Item>;
  unplacedCharacterId: number | null;
  onClearUnplacedCharacter: () => void;
  onClearCell: (x: number, y: number) => void;
  onClearObject: (x: number, y: number) => void;
  onEditRegion: (region: DraftRegion) => void;
  onDeleteRegion: (region: DraftRegion) => void;
  onLocateRegion: (region: DraftRegion) => void;
}

function RegionInfo({ region }: { region: DraftRegion }): JSX.Element {
  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 rounded-full border"
          style={{ backgroundColor: region.color, borderColor: region.color }}
        />
        <span className="truncate text-sm">{region.name}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{region.id}</span>
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
    </>
  );
}

function RegionActions({
  region,
  onEditRegion,
  onDeleteRegion,
  onLocateRegion,
}: {
  region: DraftRegion;
  onEditRegion: (region: DraftRegion) => void;
  onDeleteRegion: (region: DraftRegion) => void;
  onLocateRegion: (region: DraftRegion) => void;
}): JSX.Element {
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={() => onEditRegion(region)}>
        编辑
      </Button>
      <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={() => onLocateRegion(region)}>
        定位
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 flex-1 text-[11px] text-destructive hover:text-destructive"
        onClick={() => onDeleteRegion(region)}
      >
        删除
      </Button>
    </div>
  );
}

function RegionSection({
  region,
  onEditRegion,
  onDeleteRegion,
  onLocateRegion,
}: {
  region: DraftRegion | undefined;
  onEditRegion: (region: DraftRegion) => void;
  onDeleteRegion: (region: DraftRegion) => void;
  onLocateRegion: (region: DraftRegion) => void;
}): JSX.Element {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">区域信息</h3>
      {region ? (
        <>
          <RegionInfo region={region} />
          <RegionActions
            region={region}
            onEditRegion={onEditRegion}
            onDeleteRegion={onDeleteRegion}
            onLocateRegion={onLocateRegion}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">无</p>
      )}
    </section>
  );
}

function CellBranch({
  selection,
  cell,
  region,
  itemsById,
  onClearCell,
  onClearObject,
  onEditRegion,
  onDeleteRegion,
  onLocateRegion,
}: {
  selection: Extract<Selection, { type: 'cell' }>;
  cell: DraftCell | undefined;
  region: DraftRegion | undefined;
  itemsById: Map<number, Item>;
  onClearCell: (x: number, y: number) => void;
  onClearObject: (x: number, y: number) => void;
  onEditRegion: (region: DraftRegion) => void;
  onDeleteRegion: (region: DraftRegion) => void;
  onLocateRegion: (region: DraftRegion) => void;
}): JSX.Element {
  const backgroundItem =
    cell?.background?.itemId !== undefined ? itemsById.get(cell.background.itemId) : undefined;
  const objectItem = cell?.object?.itemId !== undefined ? itemsById.get(cell.object.itemId) : undefined;

  return (
    <>
      <div className="rounded-md border bg-muted/40 px-3 py-2">
        <span className="text-xs text-muted-foreground">坐标</span>
        <p className="font-mono text-sm">
          C{selection.x + 1} R{selection.y + 1}
        </p>
      </div>

      <section className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">背景层</h3>
        {backgroundItem ? (
          <div className="flex items-center gap-2">
            <ItemThumbnail item={backgroundItem} className="h-8 w-8" />
            <span className="truncate text-sm">{backgroundItem.name}</span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              #{backgroundItem.id}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">空</p>
        )}
      </section>

      <section className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">物件层</h3>
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

      <RegionSection
        region={region}
        onEditRegion={onEditRegion}
        onDeleteRegion={onDeleteRegion}
        onLocateRegion={onLocateRegion}
      />

      <section className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">快捷操作</h3>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1 text-[11px]"
            onClick={() => onClearCell(selection.x, selection.y)}
          >
            清空本格
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1 text-[11px]"
            onClick={() => onClearObject(selection.x, selection.y)}
          >
            清空物件层
          </Button>
        </div>
      </section>
    </>
  );
}

function CharacterProfile({
  character,
  onClose,
}: {
  character: Character;
  onClose?: () => void;
}): JSX.Element {
  // CLAR-603: characters no longer occupy cells, so the empty-state message
  // points the user at the participant panel rather than a drag-to-canvas
  // instruction.
  return (
    <>
      <section className="flex flex-col items-center gap-2 border-b pb-4">
        <CharacterThumbnail character={character} className="h-24 w-24" />
        <p className="text-base font-semibold">{character.name}</p>
        <p className="text-xs text-muted-foreground">ID: {character.code}</p>
        {character.description ? (
          <p className="text-center text-xs text-muted-foreground">{character.description}</p>
        ) : null}
      </section>
      <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
        该角色尚未加入参与者区。打开左侧「角色」标签，点击「加入」即可放入参与者框。
      </p>
      {onClose ? (
        <Button type="button" variant="outline" className="w-full" onClick={onClose}>
          关闭
        </Button>
      ) : null}
    </>
  );
}

export function EditorInfoDrawer({
  open,
  onClose,
  onOpen,
  selection,
  cells,
  regions,
  charactersById,
  itemsById,
  unplacedCharacterId,
  onClearUnplacedCharacter,
  onClearCell,
  onClearObject,
  onEditRegion,
  onDeleteRegion,
  onLocateRegion,
}: EditorInfoDrawerProps): JSX.Element {
  const cell =
    selection?.type === 'cell' ? cells.get(`${selection.x},${selection.y}`) : undefined;
  const region =
    selection?.type === 'region'
      ? regions.find((item) => item.id === selection.regionId)
      : selection?.type === 'cell'
        ? regionAt(regions, selection.x, selection.y)
        : undefined;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={onOpen}
          className="absolute right-0 top-1/2 z-20 flex h-16 w-2 -translate-y-1/2 items-center justify-center rounded-l-full border border-r-0 bg-background shadow hover:bg-accent"
          title="展开信息抽屉"
        />
      ) : null}
      <aside
        className={
          'absolute inset-y-0 right-0 z-20 w-80 max-w-[85vw] border-l bg-background/95 shadow-xl backdrop-blur transition-transform duration-200 ' +
          (open ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-full')
        }
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">信息</h2>
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
            {!selection ? (
              unplacedCharacterId !== null && charactersById.has(unplacedCharacterId) ? (
                <CharacterProfile
                  character={charactersById.get(unplacedCharacterId)!}
                  onClose={onClearUnplacedCharacter}
                />
              ) : (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  在画布上点击格位、区域标签或左侧参与者框查看详情
                </p>
              )
            ) : selection.type === 'cell' ? (
              <CellBranch
                selection={selection}
                cell={cell}
                region={region}
                itemsById={itemsById}
                onClearCell={onClearCell}
                onClearObject={onClearObject}
                onEditRegion={onEditRegion}
                onDeleteRegion={onDeleteRegion}
                onLocateRegion={onLocateRegion}
              />
            ) : (
              <RegionSection
                region={region}
                onEditRegion={onEditRegion}
                onDeleteRegion={onDeleteRegion}
                onLocateRegion={onLocateRegion}
              />
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
