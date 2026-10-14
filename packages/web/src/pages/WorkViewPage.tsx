import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Minus, Plus, RotateCcw } from 'lucide-react';
import {
  CELL_SIZE,
  type Character,
  type CharacterSlotEntry,
  type Item,
  type MapDraft,
  type ParticipantTriggerKey,
} from '@murdoku/shared';
import { Button } from '@/components/ui/button';
import { GenderBadge } from '@/components/character/GenderBadge';
import {
  MapBackgroundLayer,
  MapGridLayer,
  MapHighlightLayer,
  MapObjectLayer,
  MapRegionEdgeLayer,
  MapRegionFillLayer,
  MapRegionLabelLayer,
} from '@/components/map/MapLayers';
import { useCharacters } from '@/hooks/useCharacters';
import { useItems } from '@/hooks/useItems';
import { useHighlight } from '@/hooks/useHighlight';
import { useWorkDetail } from '@/hooks/useVersions';
import { centerPan, clampZoom, zoomAtPoint, ZOOM_STEP } from '@/lib/grid';
import { resolveHighlight } from '@/lib/highlight';
import { cn } from '@/lib/utils';

const TRIGGER_TABS: Array<{ key: ParticipantTriggerKey; label: string }> = [
  { key: 'click', label: '点击时' },
  { key: 'touch', label: '触碰时' },
];

export function WorkViewPage(): JSX.Element {
  const { workId } = useParams<{ workId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const projectId = Number(searchParams.get('project') ?? '');
  const versionNo = Number(searchParams.get('v') ?? '');
  const valid = Number.isFinite(projectId) && Number.isFinite(versionNo);

  const detailQuery = useWorkDetail(valid ? projectId : null, valid ? versionNo : null);
  // A published snapshot may reference items/characters that are now inactive.
  const itemsQuery = useItems({});
  const charactersQuery = useCharacters({});

  const { highlight, show: showHighlight, clear: clearHighlight } = useHighlight();
  const [tab, setTab] = useState<ParticipantTriggerKey>('click');
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);

  const draft = detailQuery.data?.data as MapDraft | undefined;

  useEffect(() => {
    document.title = `作品 #${workId ?? '—'} 预览 · Murdoku Maker`;
  }, [workId]);

  const itemsById = useMemo(() => {
    const map = new Map<number, Item>();
    for (const item of itemsQuery.data ?? []) map.set(item.id, item);
    return map;
  }, [itemsQuery.data]);

  const charactersById = useMemo(() => {
    const map = new Map<number, Character>();
    for (const character of charactersQuery.data ?? []) map.set(character.id, character);
    return map;
  }, [charactersQuery.data]);

  const cells = useMemo(() => {
    const map = new Map<string, MapDraft['cells'][string]>();
    for (const key of Object.keys(draft?.cells ?? {})) {
      const cell = draft?.cells[key];
      if (cell) map.set(key, cell);
    }
    return map;
  }, [draft]);

  const slots = useMemo<Array<CharacterSlotEntry | null>>(
    () => draft?.characterSlots ?? [],
    [draft],
  );
  const regions = useMemo(() => draft?.regions ?? [], [draft]);
  const gridSize = draft?.gridSize ?? 0;
  const total = gridSize * CELL_SIZE;

  const fit = (): void => {
    const node = containerRef.current;
    if (!node || gridSize === 0) return;
    const rect = node.getBoundingClientRect();
    setZoom(1);
    setPan(centerPan(rect, gridSize, 1));
  };

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridSize]);

  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      setSpaceHeld(true);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const zoomBy = (direction: 1 | -1): void => {
    const rect = containerRef.current?.getBoundingClientRect() ?? null;
    const next = clampZoom(zoom + direction * ZOOM_STEP);
    if (next === zoom) return;
    if (rect) {
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      setPan(zoomAtPoint(center, rect, pan, next, zoom));
    }
    setZoom(next);
  };

  const fireTrigger = (slotIndex: number, trigger: ParticipantTriggerKey): void => {
    const slot = slots[slotIndex];
    if (!slot) return;
    showHighlight(
      resolveHighlight(slot.triggers, trigger, {
        gridSize,
        cells,
        characterSlots: slots,
        regions,
      }),
    );
  };

  if (detailQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载作品…
      </div>
    );
  }

  if (!draft || detailQuery.isError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">作品不存在或加载失败。</p>
        <Button variant="outline" onClick={() => navigate('/works')}>
          返回作品列表
        </Button>
      </div>
    );
  }

  const participants = slots
    .map((slot, index) => ({ slot, index }))
    .filter((entry): entry is { slot: CharacterSlotEntry; index: number } => entry.slot !== null);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/works')} title="返回作品列表">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold">
              {detailQuery.data?.notes ?? '作品'} v{versionNo}
            </span>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
              {gridSize} × {gridSize}
            </span>
            <span className="text-xs text-muted-foreground">只读预览</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" title="缩小" onClick={() => zoomBy(-1)}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" title="放大" onClick={() => zoomBy(1)}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="重置视图" onClick={fit}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r bg-background">
          <div className="flex shrink-0 gap-1 border-b p-2">
            {TRIGGER_TABS.map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={tab === item.key ? 'secondary' : 'ghost'}
                className="h-7 flex-1 text-xs"
                onClick={() => {
                  setTab(item.key);
                  clearHighlight();
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {participants.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">该作品暂无参与者</p>
            ) : (
              participants.map(({ slot, index }) => {
                const character = charactersById.get(slot.characterId);
                const themeColor = slot.themeColor ?? '#FFFFFF';
                const avatar = character?.avatarThumbUrl ?? character?.avatarUrl;
                return (
                  <button
                    key={`${slot.characterId}-${index}`}
                    type="button"
                    onMouseEnter={() => setHoveredSlot(index)}
                    onMouseLeave={() => setHoveredSlot(null)}
                    onClick={() => fireTrigger(index, tab)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md border p-2 text-left transition-colors',
                      hoveredSlot === index ? 'border-primary bg-accent' : 'hover:border-primary',
                    )}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2"
                      style={{ backgroundColor: themeColor }}
                    >
                      {avatar ? (
                        <img
                          src={avatar}
                          alt={character?.name ?? ''}
                          draggable={false}
                          className="h-[82%] w-[82%] rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground">
                          {character?.name?.slice(0, 1) ?? '?'}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate text-sm">
                          {character?.name ?? `#${slot.characterId}`}
                        </span>
                        <GenderBadge gender={character?.gender} />
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        参与者框 #{index + 1}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main
          ref={containerRef}
          className="relative min-h-0 flex-1 overflow-hidden bg-muted/30"
          style={{
            cursor: spaceHeld ? 'grab' : 'default',
            touchAction: 'none',
          }}
          onPointerDown={(event) => {
            if (event.button === 1 || spaceHeld) {
              event.currentTarget.setPointerCapture(event.pointerId);
              panRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
            }
          }}
          onPointerMove={(event) => {
            if (!panRef.current) return;
            setPan({
              x: event.clientX - panRef.current.x,
              y: event.clientY - panRef.current.y,
            });
          }}
          onPointerUp={() => {
            panRef.current = null;
          }}
          onPointerCancel={() => {
            panRef.current = null;
          }}
          onWheel={(event) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            const node = containerRef.current;
            if (!node) return;
            event.preventDefault();
            const next = clampZoom(zoom + (event.deltaY > 0 ? -1 : 1) * ZOOM_STEP);
            if (next === zoom) return;
            const rect = node.getBoundingClientRect();
            setPan(
              zoomAtPoint({ x: event.clientX, y: event.clientY }, rect, pan, next, zoom),
            );
            setZoom(next);
          }}
        >
          <div
            className="absolute left-0 top-0"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              width: total,
              height: total,
            }}
          >
            <div className="absolute left-0 top-0 bg-background" style={{ width: total, height: total }} />

            <MapBackgroundLayer cells={cells} itemsById={itemsById} />
            <MapRegionFillLayer regions={regions} gridSize={gridSize} />
            <MapRegionEdgeLayer regions={regions} gridSize={gridSize} />
            <MapObjectLayer cells={cells} itemsById={itemsById} />
            <MapGridLayer gridSize={gridSize} />
            <MapHighlightLayer highlight={highlight} />

            <MapRegionLabelLayer regions={regions} />
          </div>
        </main>
      </div>
    </div>
  );
}
