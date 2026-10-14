import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { BoxSelect, Eraser, Hand, MousePointer2 } from 'lucide-react';
import type { Card, EditorTool, RegionData } from '@murdoku/shared';
import { CardPalette } from '@/components/editor/CardPalette';
import { RegionList } from '@/components/editor/RegionList';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PanelTab = 'cards' | 'regions' | 'tools';

const TABS: Array<{ id: PanelTab; label: string }> = [
  { id: 'cards', label: '卡片' },
  { id: 'regions', label: '区域' },
  { id: 'tools', label: '工具' },
];

const TOOLS: Array<{ id: EditorTool; label: string; hint: string; icon: typeof MousePointer2 }> = [
  { id: 'select', label: '选择 / 放置', hint: 'V', icon: MousePointer2 },
  { id: 'region', label: '框选区域', hint: 'R', icon: BoxSelect },
  { id: 'eraser', label: '橡皮擦', hint: 'E', icon: Eraser },
  { id: 'pan', label: '平移画布', hint: 'Space', icon: Hand },
];

interface EditorLeftPanelProps {
  cards: Card[] | undefined;
  cardsLoading: boolean;
  cardsError: boolean;
  regions: RegionData[];
  selectedRegionId: number | null;
  activeTool: EditorTool;
  onSetTool: (tool: EditorTool) => void;
  onStartDrag: (event: ReactPointerEvent, card: Card) => void;
  onHoverCard: (card: Card | null) => void;
  onSelectRegion: (id: number | null) => void;
  onEditRegion: (region: RegionData) => void;
  onDeleteRegion: (region: RegionData) => void;
}

export function EditorLeftPanel({
  cards,
  cardsLoading,
  cardsError,
  regions,
  selectedRegionId,
  activeTool,
  onSetTool,
  onStartDrag,
  onHoverCard,
  onSelectRegion,
  onEditRegion,
  onDeleteRegion,
}: EditorLeftPanelProps): JSX.Element {
  const [tab, setTab] = useState<PanelTab>('cards');

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r bg-background">
      <div className="flex shrink-0 border-b">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'flex-1 border-b-2 px-2 py-2 text-sm font-medium transition-colors',
              tab === item.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 p-3">
        {tab === 'cards' ? (
          <CardPalette
            cards={cards}
            isLoading={cardsLoading}
            isError={cardsError}
            onStartDrag={onStartDrag}
            onHoverCard={onHoverCard}
          />
        ) : tab === 'regions' ? (
          <div className="flex h-full flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => onSetTool('region')}
            >
              <BoxSelect className="mr-1 h-3.5 w-3.5" />
              框选区域 (R)
            </Button>
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
        ) : (
          <div className="flex flex-col gap-1">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onSetTool(tool.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    activeTool === tool.id
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1 text-left">{tool.label}</span>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {tool.hint}
                  </kbd>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
