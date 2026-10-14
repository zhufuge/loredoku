import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  DEFAULT_THEME_COLOR,
  EFFECT_COLORS,
  EFFECT_COLOR_HEX,
  EFFECT_COLOR_LABELS,
  PARTICIPANT_TARGET_TYPES,
  PARTICIPANT_TRIGGERS,
  THEME_COLOR_PALETTE,
  type Character,
  type CharacterSlotEntry,
  type DraftRegion,
  type EffectColor,
  type ParticipantTarget,
  type ParticipantTrigger,
  type ParticipantTriggerKey,
} from '@murdoku/shared';
import { isReservedBlueColor, normalizeHexColor } from '@murdoku/shared';
import { GenderBadge } from '@/components/character/GenderBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

type TargetType = ParticipantTarget['type'];

const TRIGGER_LABELS: Record<ParticipantTriggerKey, string> = {
  click: '点击时',
  touch: '触碰时',
};

const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  character: '角色',
  item: '物品',
  cell: '方格',
  region: '区域',
};

export interface PlacedItemOption {
  itemId: number;
  name: string;
  x: number;
  y: number;
}

interface ParticipantDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Index of the selected slot in the roster; null when nothing is selected. */
  slotIndex: number | null;
  /** Roster snapshot used to enumerate character targets. */
  slots: Array<CharacterSlotEntry | null>;
  character: Character | undefined;
  charactersById: Map<number, Character>;
  placedItems: PlacedItemOption[];
  regions: DraftRegion[];
  gridSize: number;
  /** Cell picked from the canvas while the drawer was temporarily closed. */
  pickedCell: { x: number; y: number } | null;
  onPickCell: () => void;
  onSave: (
    slotIndex: number,
    patch: { themeColor: string; triggers: ParticipantTrigger[] },
  ) => void;
  onRemove: (slotIndex: number) => void;
  onPreviewTrigger?: (slotIndex: number, trigger: ParticipantTriggerKey) => void;
}

interface AddDraft {
  type: TargetType | null;
  characterId: number | null;
  itemId: number | null;
  x: number;
  y: number;
  regionId: string | null;
  color: EffectColor;
}

const EMPTY_ADD: AddDraft = {
  type: null,
  characterId: null,
  itemId: null,
  x: 0,
  y: 0,
  regionId: null,
  color: 'red',
};

function normalize(triggers: ParticipantTrigger[] | undefined): ParticipantTrigger[] {
  const byKind = new Map<ParticipantTriggerKey, ParticipantTarget[]>();
  for (const group of triggers ?? []) {
    byKind.set(group.trigger, group.targets);
  }
  return PARTICIPANT_TRIGGERS.map((trigger) => ({
    trigger,
    targets: byKind.get(trigger) ?? [],
  }));
}

function sameTarget(a: ParticipantTarget, b: ParticipantTarget): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'character' && b.type === 'character') return a.id === b.id;
  if (a.type === 'item' && b.type === 'item') return a.id === b.id;
  if (a.type === 'region' && b.type === 'region') return a.id === b.id;
  if (a.type === 'cell' && b.type === 'cell') return a.x === b.x && a.y === b.y;
  return false;
}

/**
 * CLAR-603 (docs/v0.3.1.md §3.4): a right-side info drawer replaces the old
 * `ParticipantDialog`. Participants never enter the map, so the drawer has
 * no coordinates / can-stand fields. The remove button reads "从参与者区
 * 移除" instead of "从地图移除".
 */
export function ParticipantDrawer({
  open,
  onClose,
  slotIndex,
  slots,
  character,
  charactersById,
  placedItems,
  regions,
  gridSize,
  pickedCell,
  onPickCell,
  onSave,
  onRemove,
  onPreviewTrigger,
}: ParticipantDrawerProps): JSX.Element | null {
  const [tab, setTab] = useState<ParticipantTriggerKey>('click');
  const [themeColor, setThemeColor] = useState<string>(DEFAULT_THEME_COLOR);
  const [hexDraft, setHexDraft] = useState<string>(DEFAULT_THEME_COLOR);
  const [triggers, setTriggers] = useState<ParticipantTrigger[]>([]);
  const [add, setAdd] = useState<AddDraft>(EMPTY_ADD);

  const slot = slotIndex === null ? null : slots[slotIndex] ?? null;

  useEffect(() => {
    if (!open || !slot) return;
    setThemeColor(slot.themeColor ?? DEFAULT_THEME_COLOR);
    setHexDraft(slot.themeColor ?? DEFAULT_THEME_COLOR);
    setTriggers(normalize(slot.triggers));
    setAdd(EMPTY_ADD);
    setTab('click');
  }, [open, slot]);

  // A cell picked from the canvas re-opens the drawer on the cell step.
  useEffect(() => {
    if (!open || !pickedCell) return;
    setAdd((previous) => ({
      ...previous,
      type: 'cell',
      x: pickedCell.x,
      y: pickedCell.y,
    }));
  }, [open, pickedCell]);

  const activeTargets = useMemo(
    () => triggers.find((group) => group.trigger === tab)?.targets ?? [],
    [triggers, tab],
  );

  const updateTargets = (targets: ParticipantTarget[]): void => {
    setTriggers((previous) =>
      previous.map((group) => (group.trigger === tab ? { ...group, targets } : group)),
    );
  };

  const removeTarget = (index: number): void => {
    updateTargets(activeTargets.filter((_, i) => i !== index));
  };

  const addTarget = (): void => {
    const draft = add;
    if (!draft.type) return;
    let target: ParticipantTarget;
    if (draft.type === 'character') {
      if (draft.characterId === null) return;
      target = { type: 'character', id: draft.characterId, effect: 'highlight', color: draft.color };
    } else if (draft.type === 'item') {
      if (draft.itemId === null) return;
      target = { type: 'item', id: draft.itemId, effect: 'highlight', color: draft.color };
    } else if (draft.type === 'cell') {
      if (draft.x < 0 || draft.y < 0 || draft.x >= gridSize || draft.y >= gridSize) return;
      target = {
        type: 'cell',
        x: draft.x,
        y: draft.y,
        effect: 'highlight',
        color: draft.color,
      };
    } else {
      if (!draft.regionId) return;
      target = { type: 'region', id: draft.regionId, effect: 'highlight', color: draft.color };
    }
    // Same object + same colour is de-duplicated (docs/v0.3.0.md §2.2.3).
    const duplicate = activeTargets.some(
      (item) => sameTarget(item, target) && item.color === target.color,
    );
    if (duplicate) {
      setAdd(EMPTY_ADD);
      return;
    }
    updateTargets([...activeTargets, target]);
    setAdd({ ...EMPTY_ADD, type: draft.type, color: draft.color });
  };

  const applyHex = (): void => {
    const normalized = normalizeHexColor(hexDraft);
    if (!normalized) {
      setHexDraft(themeColor);
      return;
    }
    if (isReservedBlueColor(normalized)) {
      setHexDraft(themeColor);
      return;
    }
    setThemeColor(normalized);
    setHexDraft(normalized);
  };

  const avatar = character?.avatarThumbUrl ?? character?.avatarUrl;
  const name = character?.name ?? (slot ? `#${slot.characterId}` : '');

  return (
    <aside
      className={
        'absolute inset-y-0 right-0 z-30 w-80 max-w-[85vw] border-l bg-background/95 shadow-xl backdrop-blur transition-transform duration-200 ' +
        (open ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-full')
      }
      aria-hidden={!open}
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">参与者：{name}</h2>
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
          {!slot ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              选择左侧参与者框以编辑联动配置
            </p>
          ) : (
            <>
              <div className="flex items-start gap-4">
                <div
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2"
                  style={{ backgroundColor: themeColor }}
                >
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={name}
                      draggable={false}
                      className="h-[82%] w-[82%] rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-semibold text-muted-foreground">
                      {name.slice(0, 1)}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="truncate">{name}</span>
                    <GenderBadge gender={character?.gender} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    角色 ID：<span className="font-mono">{character?.code ?? '—'}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>主题色</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {THEME_COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={color}
                      aria-label={`主题色 ${color}`}
                      onClick={() => {
                        setThemeColor(color);
                        setHexDraft(color);
                      }}
                      className={
                        'h-7 w-7 rounded-full border-2 transition-transform ' +
                        (themeColor.toUpperCase() === color.toUpperCase()
                          ? 'scale-110 border-primary'
                          : 'border-border hover:border-primary')
                      }
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">当前</span>
                    <span
                      className="h-6 w-6 rounded border"
                      style={{ backgroundColor: themeColor }}
                    />
                    <span className="font-mono text-xs">{themeColor}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={hexDraft}
                    onChange={(event) => setHexDraft(event.target.value)}
                    onBlur={applyHex}
                    placeholder="#RRGGBB"
                    className="h-8 w-32 font-mono text-xs"
                    aria-label="自定义主题色"
                  />
                  <Button variant="outline" size="sm" className="h-8" onClick={applyHex}>
                    应用
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    蓝色为高亮专用色，不可作为主题色
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">触发效果</h3>
                  <div className="ml-auto flex gap-1">
                    {PARTICIPANT_TRIGGERS.map((trigger) => (
                      <Button
                        key={trigger}
                        type="button"
                        size="sm"
                        variant={tab === trigger ? 'secondary' : 'ghost'}
                        className="h-7 text-xs"
                        onClick={() => setTab(trigger)}
                      >
                        {TRIGGER_LABELS[trigger]}
                      </Button>
                    ))}
                  </div>
                </div>

                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {activeTargets.length === 0 ? (
                    <li className="py-2 text-center text-xs text-muted-foreground">
                      暂无对象，点击下方「添加对象」
                    </li>
                  ) : (
                    activeTargets.map((target, index) => (
                      <li
                        key={`${target.type}-${index}`}
                        className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
                      >
                        <span className="truncate">
                          {describeTarget(target, charactersById, placedItems, regions)}
                        </span>
                        <span
                          className="ml-auto h-4 w-4 shrink-0 rounded-full border"
                          style={{ backgroundColor: EFFECT_COLOR_HEX[target.color] }}
                          title={EFFECT_COLOR_LABELS[target.color]}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          title="删除"
                          onClick={() => removeTarget(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))
                  )}
                </ul>

                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 text-xs"
                    disabled={activeTargets.length === 0}
                    onClick={() => onPreviewTrigger?.(slotIndex ?? -1, tab)}
                  >
                    预览{TRIGGER_LABELS[tab]}效果
                  </Button>
                </div>

                <div className="space-y-2 rounded-md border bg-muted/30 p-2">
                  <div className="flex flex-wrap gap-1">
                    {PARTICIPANT_TARGET_TYPES.map((type) => (
                      <Button
                        key={type}
                        type="button"
                        size="sm"
                        variant={add.type === type ? 'secondary' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => setAdd({ ...EMPTY_ADD, type, color: add.color })}
                      >
                        {TARGET_TYPE_LABELS[type]}
                      </Button>
                    ))}
                  </div>

                  {add.type === 'character' ? (
                    <Select
                      value={add.characterId ?? ''}
                      onChange={(event) =>
                        setAdd({
                          ...add,
                          characterId: Number(event.target.value) || null,
                        })
                      }
                    >
                      <option value="">选择角色</option>
                      {slots.map((entry, index) =>
                        entry && index !== slotIndex ? (
                          <option key={`${index}-${entry.characterId}`} value={entry.characterId}>
                            #{entry.characterId} {charactersById.get(entry.characterId)?.name ?? ''}
                          </option>
                        ) : null,
                      )}
                    </Select>
                  ) : null}

                  {add.type === 'item' ? (
                    <Select
                      value={add.itemId ?? ''}
                      onChange={(event) =>
                        setAdd({ ...add, itemId: Number(event.target.value) || null })
                      }
                    >
                      <option value="">选择物品</option>
                      {placedItems.map((item) => (
                        <option key={`${item.itemId}-${item.x}-${item.y}`} value={item.itemId}>
                          #{item.itemId} {item.name}（C{item.x + 1}, R{item.y + 1}）
                        </option>
                      ))}
                    </Select>
                  ) : null}

                  {add.type === 'region' ? (
                    <Select
                      value={add.regionId ?? ''}
                      onChange={(event) =>
                        setAdd({ ...add, regionId: event.target.value || null })
                      }
                    >
                      <option value="">选择区域</option>
                      {regions.map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.name}
                        </option>
                      ))}
                    </Select>
                  ) : null}

                  {add.type === 'cell' ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={Math.max(0, gridSize - 1)}
                        value={add.x}
                        onChange={(event) =>
                          setAdd({
                            ...add,
                            x: clampCoord(Number(event.target.value), gridSize),
                          })
                        }
                        className="h-8 w-20"
                        aria-label="方格 X"
                      />
                      <Input
                        type="number"
                        min={0}
                        max={Math.max(0, gridSize - 1)}
                        value={add.y}
                        onChange={(event) =>
                          setAdd({
                            ...add,
                            y: clampCoord(Number(event.target.value), gridSize),
                          })
                        }
                        className="h-8 w-20"
                        aria-label="方格 Y"
                      />
                      <Button variant="outline" size="sm" className="h-8" onClick={onPickCell}>
                        从画布选择
                      </Button>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">颜色</span>
                    {EFFECT_COLORS.map((color) => (
                      <Button
                        key={color}
                        type="button"
                        size="sm"
                        variant={add.color === color ? 'secondary' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => setAdd({ ...add, color })}
                      >
                        {EFFECT_COLOR_LABELS[color]}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      className="ml-auto h-7"
                      disabled={add.type === null}
                      onClick={addTarget}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      添加对象
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <Button
                  type="button"
                  className="w-full"
                  disabled={!slot}
                  onClick={() => {
                    if (slotIndex === null) return;
                    onSave(slotIndex, { themeColor, triggers });
                  }}
                >
                  保存
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={() => {
                    if (slotIndex === null) return;
                    onRemove(slotIndex);
                  }}
                >
                  从参与者区移除
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function clampCoord(value: number, gridSize: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(gridSize - 1, Math.max(0, Math.round(value)));
}

/** Human readable label for one configured target. */
function describeTarget(
  target: ParticipantTarget,
  charactersById: Map<number, Character>,
  placedItems: PlacedItemOption[],
  regions: DraftRegion[],
): string {
  switch (target.type) {
    case 'character':
      return `角色 #${target.id} ${charactersById.get(target.id)?.name ?? ''}`.trim();
    case 'item':
      return `物品 #${target.id} ${
        placedItems.find((item) => item.itemId === target.id)?.name ?? ''
      }`.trim();
    case 'cell':
      return `方格 (${target.x}, ${target.y})`;
    case 'region':
      return `区域 ${regions.find((item) => item.id === target.id)?.name ?? target.id}`;
  }
}
