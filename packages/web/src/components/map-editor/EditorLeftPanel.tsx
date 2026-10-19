import { useState } from 'react';
import { BoxSelect } from 'lucide-react';
import type { Asset, AssetForm, DraftRegion, EditorLayer, EditorTool } from '@loredoku/shared';
import { PARTICIPANT_HEADER_HEIGHT } from '@loredoku/shared';
import { AssetPalette } from '@/components/map-editor/AssetPalette';
import { RegionList } from '@/components/map-editor/RegionList';

/**
 * v0.5.0 SPEC-K12 (docs/v0.5.0.md §4.1 / §9.1): the map editor is 只编辑地图 —
 * the 「角色」tab moved to the puzzle. Only 资源 / 区域 remain.
 */
type PanelTab = 'assets' | 'regions';

const TABS: Array<{ id: PanelTab; label: string }> = [
  { id: 'assets', label: '资源' },
  { id: 'regions', label: '区域' },
];

const LAYER_LABELS: Record<EditorLayer, string> = {
  background: '背景层',
  item: '物品层',
};

interface EditorLeftPanelProps {
  assets: Asset[] | undefined;
  assetsLoading: boolean;
  assetsError: boolean;
  activeLayer: EditorLayer;
  selectedAssetId: number | null;
  selectedFormId: number | null;
  regions: DraftRegion[];
  selectedRegionId: string | null;
  onSetLayer: (layer: EditorLayer) => void;
  onSelectAsset: (asset: Asset | null, form: AssetForm | null) => void;
  onSetTool: (tool: EditorTool) => void;
  onSelectRegion: (id: string | null) => void;
  onEditRegion: (region: DraftRegion) => void;
  onDeleteRegion: (region: DraftRegion) => void;
}

export function EditorLeftPanel({
  assets,
  assetsLoading,
  assetsError,
  activeLayer,
  selectedAssetId,
  selectedFormId,
  regions,
  selectedRegionId,
  onSetLayer,
  onSelectAsset,
  onSetTool,
  onSelectRegion,
  onEditRegion,
  onDeleteRegion,
}: EditorLeftPanelProps): JSX.Element {
  const [tab, setTab] = useState<PanelTab>('assets');

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r bg-background">
      {/* OPT-B06 §6.1: header aligns with the participant panel title bar */}
      <div className="flex shrink-0 border-b" style={{ height: PARTICIPANT_HEADER_HEIGHT }}>
        {TABS.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id)}
            className={
              tab === tabItem.id
                ? 'flex-1 border-b-2 border-primary px-2 text-sm font-medium text-foreground'
                : 'flex-1 border-b-2 border-transparent px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'
            }
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 p-3">
        {tab === 'assets' ? (
          <div className="flex h-full flex-col gap-3">
            <div className="flex shrink-0 gap-1 rounded-md border p-1">
              {(['background', 'item'] as EditorLayer[]).map((layer) => (
                <button
                  key={layer}
                  type="button"
                  onClick={() => {
                    onSetLayer(layer);
                    onSelectAsset(null, null);
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
              <AssetPalette
                assets={assets}
                isLoading={assetsLoading}
                isError={assetsError}
                activeLayer={activeLayer}
                selectedAssetId={selectedAssetId}
                selectedFormId={selectedFormId}
                onSelect={onSelectAsset}
              />
            </div>
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
