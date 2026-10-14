import { useState } from 'react';
import { BoxSelect, BoxSelect as RegionIcon } from 'lucide-react';
import type {
  Character,
  DraftRegion,
  EditorLayer,
  EditorTool,
  Item,
} from '@murdoku/shared';
import { EDITOR_LAYERS } from '@murdoku/shared';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { ItemPalette } from '@/components/editor/ItemPalette';
import { RegionList } from '@/components/editor/RegionList';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type PanelTab = 'items' | 'characters' | 'regions';

const TABS: Array<{ id: PanelTab; label: string }> = [
  { id: 'items', label: '物品' },
  { id: 'characters', label: '角色' },
  { id: 'regions', label: '区域' },
];

const LAYER_LABELS: Record<EditorLayer, string> = {
  background: '背景层',
  object: '物体层',
};

interface EditorLeftPanelProps {
  items: Item[] | undefined;
  itemsLoading: boolean;
  itemsError: boolean;
  characters: Character[] | undefined;
  charactersLoading: boolean;
  charactersError: boolean;
  activeLayer: EditorLayer;
  selectedItemId: number | null;
  characterSlots: Array<{ characterId: number } | null>;
  selectedCharacterId: number | null;
  regions: DraftRegion[];
  selectedRegionId: string | null;
  onSetLayer: (layer: EditorLayer) => void;
  onSelectItem: (item: Item | null) => void;
  onAssignSlot: (characterId: number) => void;
  onSelectCharacter: (id: number | null) => void;
  onSetTool: (tool: EditorTool) => void;
  onSelectRegion: (id: string | null) => void;
  onEditRegion: (region: DraftRegion) => void;
  onDeleteRegion: (region: DraftRegion) => void;
}

export function EditorLeftPanel({
  items,
  itemsLoading,
  itemsError,
  characters,
  charactersLoading,
  charactersError,
  activeLayer,
  selectedItemId,
  characterSlots,
  selectedCharacterId,
  regions,
  selectedRegionId,
  onSetLayer,
  onSelectItem,
  onAssignSlot,
  onSelectCharacter,
  onSetTool,
  onSelectRegion,
  onEditRegion,
  onDeleteRegion,
}: EditorLeftPanelProps): JSX.Element {
  const [tab, setTab] = useState<PanelTab>('items');

  const rosterIds = new Set(characterSlots.filter(Boolean).map((slot) => slot!.characterId));

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r bg-background">
      <div className="flex shrink-0 border-b">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={
              tab === item.id
                ? 'flex-1 border-b-2 border-primary px-2 py-2 text-sm font-medium text-foreground'
                : 'flex-1 border-b-2 border-transparent px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 p-3">
        {tab === 'items' ? (
          <div className="flex h-full flex-col gap-3">
            <div className="flex shrink-0 gap-1 rounded-md border p-1">
              {(['background', 'object'] as EditorLayer[]).map((layer) => (
                <button
                  key={layer}
                  type="button"
                  onClick={() => {
                    onSetLayer(layer);
                    onSelectItem(null);
                  }}
                  className={
                    activeLayer === layer
                      ? 'flex-1 rounded bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground'
                      : 'flex-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent'
                  }
                >
                  {LAYER_LABELS[layer]}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              <ItemPalette
                items={items}
                isLoading={itemsLoading}
                isError={itemsError}
                activeLayer={activeLayer}
                selectedItemId={selectedItemId}
                onSelect={onSelectItem}
              />
            </div>
          </div>
        ) : tab === 'characters' ? (
          <div className="flex h-full flex-col gap-3 overflow-y-auto">
            <p className="text-xs text-muted-foreground">
              点击角色可选中并放置到画布；点击「加入」加入右侧队伍槽位。
            </p>
            {charactersLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : charactersError ? (
              <p className="py-4 text-center text-xs text-muted-foreground">角色加载失败</p>
            ) : !characters || characters.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">暂无角色</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {characters.map((character) => (
                  <div key={character.id} className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        onSelectCharacter(selectedCharacterId === character.id ? null : character.id)
                      }
                      className={
                        selectedCharacterId === character.id
                          ? 'rounded-full ring-2 ring-primary'
                          : 'rounded-full'
                      }
                      title={character.name}
                    >
                      <CharacterThumbnail character={character} className="h-12 w-12" />
                    </button>
                    <span className="w-full truncate text-center text-[11px] text-muted-foreground">
                      {character.name}
                    </span>
                    <button
                      type="button"
                      disabled={rosterIds.has(character.id)}
                      onClick={() => onAssignSlot(character.id)}
                      className={
                        rosterIds.has(character.id)
                          ? 'h-6 w-full rounded border bg-secondary px-2 text-[11px] text-muted-foreground'
                          : 'h-6 w-full rounded border px-2 text-[11px] hover:border-primary'
                      }
                    >
                      {rosterIds.has(character.id) ? '已加入' : '加入'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col gap-2">
            <button
              type="button"
              onClick={() => onSetTool('region')}
              className="flex shrink-0 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-sm hover:border-primary"
            >
              <BoxSelect className="h-3.5 w-3.5" />
              区域工具 (R)
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <RegionList
                regions={regions}
                selectedRegionId={selectedRegionId}
                onSelect={onSelectRegion}
                onEdit={onEditRegion}
                onDelete={onDeleteRegion}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
