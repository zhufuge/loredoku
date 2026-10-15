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
import { normalizeHexColor, isHighLuminanceColor } from '@murdoku/shared';
import { parseClue } from '@/lib/clue';
import { GenderBadge } from '@/components/character/GenderBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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

/** MOD-702: max clue length. */
const CLUE_MAX = 200;

export interface PlacedItemOption {
  itemId: number;
  name: string;
  x: number;
  y: number;
}

interface ParticipantDrawerProps {
  open: boolean;
  onClose: () => void;
  slotIndex: number | null;
  slots: Array<CharacterSlotEntry | null>;
  character: Character | undefined;
  charactersById: Map<number, Character>;
  placedItems: PlacedItemOption[];
  regions: DraftRegion[];
  gridSize: number;
  onSave: (
    slotIndex: number,
    patch: { themeColor: string; clue: string; triggers: ParticipantTrigger[] },
  ) => void;
  onPreviewTrigger?: (slotIndex: number, trigger: ParticipantTriggerKey) => void;
}

interface AddDraft {
  type: TargetType | null;
  characterId: number | null;
  itemId: number | null;
  regionId: string | null;
  color: EffectColor;
}

const EMPTY_ADD: AddDraft = {
  type: null,
  characterId: null,
  itemId: null,
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
  if (a.type === 'cell' && b.type === 'cell') {
    const ak = a.cells.map((c) => c.join(',')).sort().join('|');
    const bk = b.cells.map((c) => c.join(',')).sort().join('|');
    return ak === bk;
  }
  return false;
}

/**
 * CLAR-603 + MOD-702 (docs/v0.3.2.md): right-side info drawer.
 * MOD-702: removes "从参与者区移除" button — removal is via × on the panel.
 * Adds clue editor with live bold preview.
 * MOD-710: removes blue restriction text.
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
  onSave,
  onPreviewTrigger,
}: ParticipantDrawerProps): JSX.Element | null {
  const [tab, setTab] = useState<ParticipantTriggerKey>('click');
  const [themeColor, setThemeColor] = useState<string>(DEFAULT_THEME_COLOR);
  const [hexDraft, setHexDraft] = useState<string>(DEFAULT_THEME_COLOR);
  const [clue, setClue] = useState<string>('');
  const [triggers, setTriggers] = useState<ParticipantTrigger[]>([]);
  const [add, setAdd] = useState<AddDraft>(EMPTY_ADD);

  const slot = slotIndex === null ? null : slots[slotIndex] ?? null;

  useEffect(() => {
    if (!open || !slot) return;
    setThemeColor(slot.themeColor ?? DEFAULT_THEME_COLOR);
    setHexDraft(slot.themeColor ?? DEFAULT_THEME_COLOR);
    setClue(slot.clue ?? '');
    setTriggers(normalize(slot.triggers));
    setAdd(EMPTY_ADD);
    setTab('click');
  }, [open, slot]);

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
      target = { type: 'item', id: draft.itemId, scope: 'all', effect: 'highlight', color: draft.color };
    } else if (draft.type === 'region') {
      if (!draft.regionId) return;
      target = { type: 'region', id: draft.regionId, effect: 'highlight', color: draft.color };
    } else {
      // cell — MOD-708: use cells array, default to [[0,0]]
      target = { type: 'cell', cells: [[0, 0]], effect: 'highlight', color: draft.color };
    }
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
    // MOD-710: no blue rejection — any valid hex is accepted
    setThemeColor(normalized);
    setHexDraft(normalized);
  };

  // MOD-710: non-blocking high-luminance warning
  const hexWarning = useMemo(() => {
    const normalized = normalizeHexColor(hexDraft);
    if (!normalized) return null;
    if (isHighLuminanceColor(normalized)) {
      return '该颜色较亮，可能影响可读性';
    }
    return null;
  }, [hexDraft]);

  // MOD-702: clue char count
  const clueOverLimit = clue.length > CLUE_MAX;

  const avatar = character?.avatarThumbUrl ?? character?.avatarUrl;
  const name = character?.name ?? (slot ? `#${slot.characterId}` : '');
  const isWhiteTheme = themeColor.toUpperCase() === '#FFFFFF';

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
              {/* Avatar + name — MOD-703: theme color background layer */}
              <div className="flex items-start gap-4">
                <div
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: themeColor,
                    border: isWhiteTheme ? '1px solid #D1D5DB' : 'none',
                  }}
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

              {/* Theme color picker — MOD-710: no blue restriction */}
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
                  {hexWarning ? (
                    <span className="text-xs text-amber-600">{hexWarning}</span>
                  ) : null}
                </div>
              </div>

              {/* MOD-702: clue editor */}
              <div className="space-y-2">
                <Label>线索</Label>
                <Textarea
                  value={clue}
                  onChange={(event) => setClue(event.target.value)}
                  rows={3}
                  placeholder="用 **文字** 表示加粗"
                  className={clueOverLimit ? 'border-destructive' : ''}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>用 **文字** 表示加粗</span>
                  <span className={clueOverLimit ? 'text-destructive font-medium' : ''}>
                    {clue.length} / {CLUE_MAX}
                  </span>
                </div>
                {/* Live bold preview */}
                {clue.trim() ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                    {parseClue(clue).map((seg, i) =>
                      seg.bold ? (
                        <strong key={i}>{seg.text}</strong>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      ),
                    )}
                  </div>
                ) : null}
              </div>

              {/* Trigger effects */}
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
                    <p className="text-xs text-muted-foreground">
                      添加后请在联动列表中编辑方格坐标（矩阵选择器将在后续版本提供）。
                    </p>
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

              {/* MOD-702: save only — no "从参与者区移除" button */}
              <div className="space-y-2 border-t pt-3">
                <Button
                  type="button"
                  className="w-full"
                  disabled={!slot || clueOverLimit}
                  onClick={() => {
                    if (slotIndex === null) return;
                    onSave(slotIndex, { themeColor, clue, triggers });
                  }}
                >
                  保存
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
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
      } (${target.scope === 'all' ? '全部' : `${target.instances?.length ?? 0} 实例`})`.trim();
    case 'cell':
      return `方格 ${target.cells.map((c) => `(${c[0]},${c[1]})`).join(', ')}`;
    case 'region':
      return `区域 ${regions.find((item) => item.id === target.id)?.name ?? target.id}`;
  }
}