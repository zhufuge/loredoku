import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Character, DraftCell, DraftRegion, Item, PlacedCharacter } from '@murdoku/shared';
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
  placedCharacters: PlacedCharacter[];
  charactersById: Map<number, Character>;
  itemsById: Map<number, Item>;
  unplacedCharacterId: number | null;
  onSelectCharacter: (characterId: number, x: number, y: number) => void;
  onSaveMeta: (x: number, y: number, meta: Record<string, unknown>) => void;
  onRemoveCharacter: (x: number, y: number) => void;
  onClearCell: (x: number, y: number) => void;
  onClearObject: (x: number, y: number) => void;
  onEditRegion: (region: DraftRegion) => void;
  onDeleteRegion: (region: DraftRegion) => void;
  onLocateRegion: (region: DraftRegion) => void;
}

function CharacterMetaEditor({
  value,
  onSave,
}: {
  value: Record<string, unknown>;
  onSave: (meta: Record<string, unknown>) => void;
}): JSX.Element {
  const [rows, setRows] = useState<Array<{ key: string; value: string }>>([]);

  useEffect(() => {
    setRows(
      Object.entries(value).map(([key, item]) => ({
        key,
        value: typeof item === 'string' ? item : JSON.stringify(item),
      })),
    );
  }, [value]);

  const update = (index: number, patch: Partial<{ key: string; value: string }>): void => {
    setRows((previous) => previous.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const remove = (index: number): void => {
    setRows((previous) => previous.filter((_, i) => i !== index));
  };

  const save = (): void => {
    const meta: Record<string, unknown> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (key) meta[key] = row.value;
    }
    onSave(meta);
  };

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无关联信息</p>
      ) : (
        rows.map((row, index) => (
          <div key={index} className="flex items-center gap-1">
            <input
              value={row.key}
              onChange={(event) => update(index, { key: event.target.value })}
              placeholder="键"
              className="h-7 w-24 shrink-0 rounded border bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <input
              value={row.value}
              onChange={(event) => update(index, { value: event.target.value })}
              placeholder="值"
              className="h-7 min-w-0 flex-1 rounded border bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="删除"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-7 w-full text-[11px]"
        onClick={() => setRows((previous) => [...previous, { key: '', value: '' }])}
      >
        <Plus className="mr-1 h-3 w-3" /> 添加字段
      </Button>
      <Button size="sm" className="h-7 w-full text-[11px]" onClick={save}>
        保存关联信息
      </Button>
    </div>
  );
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
  placed,
  charactersById,
  itemsById,
  onSelectCharacter,
  onClearCell,
  onClearObject,
  onEditRegion,
  onDeleteRegion,
  onLocateRegion,
}: {
  selection: Extract<Selection, { type: 'cell' }>;
  cell: DraftCell | undefined;
  region: DraftRegion | undefined;
  placed: PlacedCharacter | undefined;
  charactersById: Map<number, Character>;
  itemsById: Map<number, Item>;
  onSelectCharacter: (characterId: number, x: number, y: number) => void;
  onClearCell: (x: number, y: number) => void;
  onClearObject: (x: number, y: number) => void;
  onEditRegion: (region: DraftRegion) => void;
  onDeleteRegion: (region: DraftRegion) => void;
  onLocateRegion: (region: DraftRegion) => void;
}): JSX.Element {
  const backgroundItem =
    cell?.background?.itemId !== undefined ? itemsById.get(cell.background.itemId) : undefined;
  const objectItem = cell?.object?.itemId !== undefined ? itemsById.get(cell.object.itemId) : undefined;
  const character = placed ? charactersById.get(placed.characterId) : undefined;

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

      <section className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">角色</h3>
        {placed ? (
          <div className="flex items-center gap-2">
            {character ? <CharacterThumbnail character={character} className="h-8 w-8" /> : null}
            <span className="truncate text-sm">{character?.name ?? `#${placed.characterId}`}</span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 text-[11px]"
              onClick={() => onSelectCharacter(placed.characterId, placed.x, placed.y)}
            >
              查看
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">无</p>
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

function CharacterProfile({ character }: { character: Character }): JSX.Element {
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
        该角色尚未放置到地图，从右侧队伍槽位拖拽到画布即可放置。
      </p>
    </>
  );
}

function CharacterBranch({
  placed,
  cell,
  charactersById,
  itemsById,
  onSaveMeta,
  onRemoveCharacter,
}: {
  selection: Extract<Selection, { type: 'character' }>;
  placed: PlacedCharacter;
  cell: DraftCell | undefined;
  charactersById: Map<number, Character>;
  itemsById: Map<number, Item>;
  onSaveMeta: (x: number, y: number, meta: Record<string, unknown>) => void;
  onRemoveCharacter: (x: number, y: number) => void;
}): JSX.Element {
  const character = charactersById.get(placed.characterId);
  const objectItem = cell?.object?.itemId !== undefined ? itemsById.get(cell.object.itemId) : undefined;
  const blocked = objectItem ? !objectItem.canStand : false;
  // Debounce guard so a rapid double click only removes the character once (FIX-307 防连点).
  const [removing, setRemoving] = useState(false);

  const handleRemove = (): void => {
    if (removing) return;
    setRemoving(true);
    onRemoveCharacter(placed.x, placed.y);
    setTimeout(() => setRemoving(false), 200);
  };

  return (
    <>
      <section className="flex flex-col items-center gap-2 border-b pb-4">
        {character ? (
          <CharacterThumbnail character={character} className="h-24 w-24" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted text-2xl">
            ?
          </div>
        )}
        <p className="text-base font-semibold">{character?.name ?? `#${placed.characterId}`}</p>
        <p className="text-xs text-muted-foreground">ID: {character?.code ?? placed.characterId}</p>
        <p className="text-xs text-muted-foreground">
          坐标：C{placed.x + 1}, R{placed.y + 1}
        </p>
        <p className="text-xs text-muted-foreground">
          是否可站立：
          <span className={blocked ? 'font-medium text-destructive' : 'font-medium text-foreground'}>
            {blocked ? '否' : '是'}
          </span>
        </p>
      </section>

      {blocked ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          该格不可站角色，请调整位置或物品。
        </p>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">地图关联信息</h3>
        <CharacterMetaEditor
          value={placed.mapMeta}
          onSave={(meta) => onSaveMeta(placed.x, placed.y, meta)}
        />
      </section>

      <Button
        variant="destructive"
        className="w-full"
        disabled={removing}
        title="将该角色撤回到队伍槽位"
        onClick={handleRemove}
      >
        从地图移除
      </Button>
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
  placedCharacters,
  charactersById,
  itemsById,
  unplacedCharacterId,
  onSelectCharacter,
  onSaveMeta,
  onRemoveCharacter,
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
  const placed =
    selection?.type === 'character' || selection?.type === 'cell'
      ? placedCharacters.find((p) => p.x === selection.x && p.y === selection.y)
      : undefined;
  const characterSelection =
    selection?.type === 'character'
      ? selection
      : placed && selection?.type === 'cell'
        ? { type: 'character' as const, characterId: placed.characterId, x: selection.x, y: selection.y }
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
                <CharacterProfile character={charactersById.get(unplacedCharacterId)!} />
              ) : (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  在画布上点击格位、区域标签、角色或左侧槽位查看详情
                </p>
              )
            ) : selection.type === 'cell' ? (
              <CellBranch
                selection={selection}
                cell={cell}
                region={region}
                placed={placed}
                charactersById={charactersById}
                itemsById={itemsById}
                onSelectCharacter={onSelectCharacter}
                onClearCell={onClearCell}
                onClearObject={onClearObject}
                onEditRegion={onEditRegion}
                onDeleteRegion={onDeleteRegion}
                onLocateRegion={onLocateRegion}
              />
            ) : selection.type === 'region' ? (
              <RegionSection
                region={region}
                onEditRegion={onEditRegion}
                onDeleteRegion={onDeleteRegion}
                onLocateRegion={onLocateRegion}
              />
            ) : (
              <CharacterBranch
                selection={selection}
                placed={placed ?? { characterId: selection.characterId, x: selection.x, y: selection.y, mapMeta: {} }}
                cell={cell}
                charactersById={charactersById}
                itemsById={itemsById}
                onSaveMeta={onSaveMeta}
                onRemoveCharacter={onRemoveCharacter}
              />
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
