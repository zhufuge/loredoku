import {
  THEME_CHECK_FAIL_COLOR,
  THEME_CHECK_PASS_COLOR,
  THEME_DATA_VERSION,
  collectMapThemeRefs,
  collectPuzzleThemeRefs,
  dedupeThemeRefs,
  findOutOfScopeRefs,
  type CreateThemeInput,
  type MapStyle,
  type Theme,
  type ThemeCheckColors,
  type ThemeData,
  type ThemeOption,
  type ThemeRefTarget,
  type UpdateThemeInput,
  type GameToolIconKind,
  type GameToolIcons,
  type ThemeVerdict,
} from '@loredoku/shared';
import * as repo from '../repository/themeRepository';
import { AppError } from '../utils/AppError';
import {
  processMarkImage,
  processRingImage,
  processToolIconImage,
  processVerdictIconImage,
} from '../utils/image';

/** 三件事：`theme_id` 建行后不可改（§8 护栏 2）、缺省只在新建时拷贝不追溯（§5 S3）、交付只剩单局部署（v0.9.2 §2）。 */

export interface ThemeScopeIssueView {
  kind: ThemeRefTarget['kind'];
  id: number;
  name: string;
  /** 它实际属于哪个主题 —— 只给编码：作者要能顺着它跳到那个工作空间。 */
  themeCode: string;
  themeName: string;
  where: string;
}

const KIND_LABEL: Record<ThemeRefTarget['kind'], string> = {
  asset: '资源',
  variant: '形态',
  character: '角色',
};

export async function listThemes(light?: boolean): Promise<Theme[] | ThemeOption[]> {
  const rows = await repo.listThemeRows();
  if (light) {
    return rows.map((row) => ({ code: row.code, name: row.name }));
  }
  const counts = await repo.countsByTheme();
  return rows.map((row) => repo.toTheme(row, counts.get(Number(row.id)) ?? repo.emptyCounts()));
}

/** 主题的唯一读取口（§19）：**编码进，主题出**。数字主键不出这一层。 */
export async function getTheme(code: string): Promise<Theme> {
  const row = await repo.findByCode(code);
  if (!row) throw AppError.notFound('主题不存在');
  const counts = await repo.countsByTheme();
  return repo.toTheme(row, counts.get(Number(row.id)) ?? repo.emptyCounts());
}

export async function createTheme(input: CreateThemeInput): Promise<Theme> {
  const existing = await repo.findByCode(input.code);
  if (existing) {
    throw AppError.conflict('主题编码已存在');
  }
  await repo.createTheme({
    code: input.code,
    name: input.name,
    description: input.description ?? null,
    data: input.data,
  });
  return getTheme(input.code);
}

export async function updateTheme(code: string, input: UpdateThemeInput): Promise<Theme> {
  const id = await repo.idOfCode(code);
  if (id === undefined) throw AppError.notFound('主题不存在');
  await repo.updateTheme(id, input);
  return getTheme(code);
}

/** Raised when `POST /api/themes/:code/mark` arrives without a file part. */
export function markRequired(): AppError {
  return AppError.validation('请选择标记图片');
}

/** 主题 `data` 的读 → 改 → 写；老行默认 `{}` 没有版本戳，得补一个才写得回去。 */
async function themeDataOf(code: string): Promise<{ id: number; data: ThemeData }> {
  const row = await repo.findByCode(code);
  if (!row) throw AppError.notFound('主题不存在');
  const raw = row.data as Partial<ThemeData> | null | undefined;
  return {
    id: Number(row.id),
    data: { ...raw, version: raw?.version ?? THEME_DATA_VERSION },
  };
}

/** 主题不版本化，改完即时生效；旧图不删 —— 存量谜题与版本行可能还指着它（v0.8.6 §4）。 */
export async function uploadMark(code: string, buffer: Buffer): Promise<Theme> {
  const { id, data } = await themeDataOf(code);
  const image = await processMarkImage({ kind: 'theme', id }, buffer);
  await repo.updateTheme(id, {
    data: { ...data, mark: { path: image.relativePath } },
  });
  return getTheme(code);
}

/** v0.8.6 §4：清掉主题缺省 —— 键整个删掉（`null` 与缺席等价，但少一种口径）。 */
export async function removeMark(code: string): Promise<Theme> {
  const { id, data } = await themeDataOf(code);
  const next: ThemeData = { ...data };
  delete next.mark;
  await repo.updateTheme(id, { data: next });
  return getTheme(code);
}

/** v0.8.7 §7：`POST /api/themes/:code/tool-icons/:icon` 少了文件部分。 */
export function toolIconRequired(): AppError {
  return AppError.validation('请选择图标图片');
}

/** 一次只改一枚，另外两枚原样留着；三枚都清空就整个删键，与「从没配过」同口径（v0.8.7 §7）。 */
export async function uploadToolIcon(
  code: string,
  icon: GameToolIconKind,
  buffer: Buffer,
): Promise<Theme> {
  const { id, data } = await themeDataOf(code);
  const image = await processToolIconImage({ kind: 'theme', id }, icon, buffer);
  const toolIcons: GameToolIcons = {
    ...data.toolIcons,
    [icon]: { path: image.relativePath },
  };
  await repo.updateTheme(id, { data: { ...data, toolIcons } });
  return getTheme(code);
}

export async function removeToolIcon(code: string, icon: GameToolIconKind): Promise<Theme> {
  const { id, data } = await themeDataOf(code);
  const next: ThemeData = { ...data };
  const rest: GameToolIcons = { ...next.toolIcons };
  delete rest[icon];
  if (Object.keys(rest).length === 0) delete next.toolIcons;
  else next.toolIcons = rest;
  await repo.updateTheme(id, { data: next });
  return getTheme(code);
}

/**
 * v0.9.5：长按计时环与提交校验圈合并成一张（`ThemeData.ring`），换一张对所有关卡立即生效。
 */
export function ringRequired(): AppError {
  return AppError.validation('请选择圆环图片');
}

export async function uploadRing(code: string, buffer: Buffer): Promise<Theme> {
  const { id, data } = await themeDataOf(code);
  const image = await processRingImage({ kind: 'theme', id }, buffer);
  await repo.updateTheme(id, {
    data: { ...data, ring: { image: { path: image.relativePath } } },
  });
  return getTheme(code);
}

/** 移除 = 删掉 `data.ring`，所有关卡回到各自的内置细弧（长按白弧 / 校验本色环）。 */
export async function removeRing(code: string): Promise<Theme> {
  const { id, data } = await themeDataOf(code);
  const next: ThemeData = { ...data };
  delete next.ring;
  await repo.updateTheme(id, { data: next });
  return getTheme(code);
}

/** 结算卡图标图：只碰 `verdict.icon`，同一格的 `iconText` / `title` 原样留着（删图回到作者写的 emoji）。 */
export function verdictIconRequired(): AppError {
  return AppError.validation('请选择结算图标图片');
}

export async function uploadVerdictIcon(code: string, buffer: Buffer): Promise<Theme> {
  const { id, data } = await themeDataOf(code);
  const image = await processVerdictIconImage({ kind: 'theme', id }, buffer);
  await repo.updateTheme(id, {
    data: { ...data, verdict: { ...data.verdict, icon: { path: image.relativePath } } },
  });
  return getTheme(code);
}

/** 移除那枚图（保留文字与标题）；三项都空了就把整个 `verdict` 删掉。 */
export async function removeVerdictIcon(code: string): Promise<Theme> {
  const { id, data } = await themeDataOf(code);
  const next: ThemeData = { ...data };
  const rest: ThemeVerdict = { ...next.verdict };
  delete rest.icon;
  const hasText = (rest.iconText ?? '').trim().length > 0;
  const hasTitle = (rest.title ?? '').trim().length > 0;
  if (!hasText && !hasTitle) delete next.verdict;
  else next.verdict = rest;
  await repo.updateTheme(id, { data: next });
  return getTheme(code);
}

/** 只改给的项（改标题不该抹掉图标文字）；给空串 = 恢复内置，三项都空就删整个键。 */
export async function updateVerdictText(
  code: string,
  patch: { iconText?: string; title?: string },
): Promise<Theme> {
  const { id, data } = await themeDataOf(code);
  const current: ThemeVerdict = { ...data.verdict };
  if (patch.iconText !== undefined) current.iconText = patch.iconText.trim();
  if (patch.title !== undefined) current.title = patch.title.trim();
  const next: ThemeData = { ...data };
  const hasText = (current.iconText ?? '').length > 0;
  const hasTitle = (current.title ?? '').length > 0;
  if (!hasText && !hasTitle && !current.icon?.path) delete next.verdict;
  else next.verdict = current;
  await repo.updateTheme(id, { data: next });
  return getTheme(code);
}

/** 配色与换图各改各的：改颜色不该顺手动那一圈图（v0.9.3 §3）。 */
export async function updateCheckStyle(
  code: string,
  patch: { passColor?: string; failColor?: string },
): Promise<Theme> {
  const { id, data } = await themeDataOf(code);
  const current: Partial<ThemeCheckColors> = data.checkStyle ?? {};
  await repo.updateTheme(id, {
    data: {
      ...data,
      checkStyle: {
        passColor: patch.passColor ?? current.passColor ?? THEME_CHECK_PASS_COLOR,
        failColor: patch.failColor ?? current.failColor ?? THEME_CHECK_FAIL_COLOR,
      },
    },
  });
  return getTheme(code);
}

/** 还有东西就拦（§8 护栏 3）：只数活跃行，软删版本行由 `repo.deleteTheme` 顺手抬走。 */
export async function deleteTheme(code: string): Promise<void> {
  const id = await repo.idOfCode(code);
  if (id === undefined) throw AppError.notFound('主题不存在');

  const counts = (await repo.countsByTheme()).get(id) ?? repo.emptyCounts();
  const parts: string[] = [];
  if (counts.assets > 0) parts.push(`${counts.assets} 个资源`);
  if (counts.maps > 0) parts.push(`${counts.maps} 张地图`);
  if (counts.characters > 0) parts.push(`${counts.characters} 个角色`);
  if (counts.puzzles > 0) parts.push(`${counts.puzzles} 个谜题`);
  if (parts.length > 0) {
    throw AppError.conflict(`主题下还有 ${parts.join('、')}，请先移空`);
  }

  try {
    await repo.deleteTheme(id);
  } catch (cause) {
    // 外键兜底（23503）：计数与 `DELETE` 之间没有任何东西该长出来，真撞上就是
    // 有一类行没被算进护栏 —— 说人话，别把 500 丢给作者。
    if ((cause as { code?: string }).code === '23503') {
      throw AppError.conflict('主题下还有内容，请先移空');
    }
    throw cause;
  }
}

/** 编码不存在时报错而不是返回空列表：空列表会被读成「这个主题里没有东西」。 */
export async function filterThemeId(code?: string): Promise<number | undefined> {
  if (!code) return undefined;
  return requireThemeId(code);
}

/** 新建内容时必填、没有兜底：猜一个主题会让刚建的东西不在当前工作空间，宁可 400（§19）。 */
export async function requireThemeId(code: string): Promise<number> {
  const id = await repo.idOfCode(code);
  if (id === undefined) throw AppError.validation('主题不存在');
  return id;
}

/** 主题缺省风格只在新建地图那一刻取一次；拿不到（没设过 / 主题已删）就退 `DEFAULT_MAP_STYLE`（§5 S3）。 */
export async function defaultStyleOf(themeId: number): Promise<MapStyle | null> {
  if (!Number.isFinite(themeId)) return null;
  const row = await repo.findById(themeId);
  if (!row) return null;
  const style = (row.data as ThemeData | null)?.style;
  return style ?? null;
}

async function namesOf(kind: ThemeRefTarget['kind'], ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const table = kind === 'character' ? 'characters' : 'assets';
  const rows = (await repo.namesByIds(table, ids)) as Array<{ id: string | number; name: string }>;
  return new Map(rows.map((row) => [Number(row.id), row.name]));
}

/** 护栏 1（§8）：判定在 `shared/themeScope`（前端保存前调同一份），这里只把 id 翻成人话。 */
export async function collectScopeIssues(
  themeId: number,
  refs: ReadonlyArray<ThemeRefTarget>,
): Promise<ThemeScopeIssueView[]> {
  const unique = dedupeThemeRefs(refs);
  const byKind = new Map<ThemeRefTarget['kind'], number[]>();
  for (const ref of unique) {
    const list = byKind.get(ref.kind) ?? [];
    list.push(ref.id);
    byKind.set(ref.kind, list);
  }
  const ownerMaps = new Map<ThemeRefTarget['kind'], Map<number, number>>();
  for (const [kind, ids] of byKind) {
    ownerMaps.set(kind, await repo.themeIdsOf(kind, ids));
  }
  const bad = findOutOfScopeRefs(unique, themeId, (ref) => ownerMaps.get(ref.kind)?.get(ref.id));
  if (bad.length === 0) return [];

  const ownerIds = [...new Set([...ownerMaps.values()].flatMap((map) => [...map.values()]))];
  const ownerThemes = await repo.themesByIds(ownerIds);
  const issues: ThemeScopeIssueView[] = [];
  for (const kind of ['asset', 'variant', 'character'] as const) {
    const ids = bad.filter((ref) => ref.kind === kind).map((ref) => ref.id);
    if (ids.length === 0) continue;
    const names = await namesOf(kind, ids);
    for (const ref of bad.filter((item) => item.kind === kind)) {
      const owner = ownerThemes.get(ownerMaps.get(kind)?.get(ref.id) ?? 0);
      issues.push({
        kind,
        id: ref.id,
        name: names.get(ref.id) ?? `#${ref.id}`,
        themeCode: owner?.code ?? '',
        themeName: owner?.name ?? '另一个主题',
        where: ref.where,
      });
    }
  }
  return issues;
}

export async function assertThemeScope(
  themeId: number,
  refs: ReadonlyArray<ThemeRefTarget>,
): Promise<void> {
  const issues = await collectScopeIssues(themeId, refs);
  if (issues.length === 0) return;

  const summary = (['asset', 'variant', 'character'] as const)
    .map((kind) => [kind, issues.filter((issue) => issue.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} 个${KIND_LABEL[kind]}`)
    .join('、');
  throw AppError.validation(`有 ${summary}不在本主题里`, {
    kind: 'theme-scope',
    issues: issues.slice(0, 50),
  });
}

export function mapDraftRefs(draft: Parameters<typeof collectMapThemeRefs>[0]): ThemeRefTarget[] {
  return collectMapThemeRefs(draft);
}

export function puzzleDraftRefs(draft: Parameters<typeof collectPuzzleThemeRefs>[0]): ThemeRefTarget[] {
  return collectPuzzleThemeRefs(draft);
}


