import {
  ErrorCode,
  THEME_DATA_VERSION,
  collectMapThemeRefs,
  collectPuzzleThemeRefs,
  dedupeThemeRefs,
  findOutOfScopeRefs,
  type CreateThemeDeploymentInput,
  type CreateThemeInput,
  type MapStyle,
  type Theme,
  type ThemeData,
  type ThemeDeploymentSummary,
  type ThemeOption,
  type ThemeRefTarget,
  type UpdateThemeDeploymentInput,
  type UpdateThemeInput,
} from '@loredoku/shared';
import * as repo from '../repository/themeRepository';
import * as gameService from './gameService';
import { AppError } from '../utils/AppError';
import { processForbiddenSymbolImage } from '../utils/image';

/**
 * v0.8.0（docs/v0.8.0.md）—— 主题的三件事，按重要性排：
 *
 * 1. **边界**：`theme_id` 建行后不可改（§8 护栏 2），所以这里没有任何「搬迁」入口，
 *    只有「新建到某个主题」；
 * 2. **缺省**：`themes.data.style` / `linkageColors` 只在新建地图 / 谜题那一刻被拷贝，
 *    主题之后怎么改都不追溯（§5 的 S3）；
 * 3. **交付**：合辑只是目录（§9），「一键整主题部署」是动作，不是新状态。
 */

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

/** Raised when `POST /api/themes/:code/forbidden-symbol` arrives without a file part. */
export function forbiddenSymbolRequired(): AppError {
  return AppError.validation('请选择禁止符号图片');
}

/**
 * 主题 `data` 的读 → 改 → 写（禁止符号的两个端点用）。
 *
 * 数据库默认值是 `{}`（v0.8.0 之前的行），而 `ThemeData.version` 是必填 —— 不补
 * 一个版本戳就写不回去。`repo.toTheme` 也会补，但它顺带数五张表，这里不需要。
 */
async function themeDataOf(code: string): Promise<{ id: number; data: ThemeData }> {
  const row = await repo.findByCode(code);
  if (!row) throw AppError.notFound('主题不存在');
  const raw = row.data as Partial<ThemeData> | null | undefined;
  return {
    id: Number(row.id),
    data: { ...raw, version: raw?.version ?? THEME_DATA_VERSION },
  };
}

/**
 * v0.8.6 §4：给主题配一张「禁止符号缺省」图。
 *
 * 主题不版本化，所以改完即时生效；但只对**之后新建**的谜题生效 —— 已建的谜题在
 * 创建那一刻就抄走了自己的 path（见 `puzzleService.createPuzzle`）。旧图不删：
 * 存量谜题可能还指着它。
 */
export async function uploadForbiddenSymbol(code: string, buffer: Buffer): Promise<Theme> {
  const { id, data } = await themeDataOf(code);
  const image = await processForbiddenSymbolImage({ kind: 'theme', id }, buffer);
  await repo.updateTheme(id, {
    data: { ...data, forbiddenSymbol: { path: image.relativePath } },
  });
  return getTheme(code);
}

/** v0.8.6 §4：清掉主题缺省 —— 键整个删掉（`null` 与缺席等价，但少一种口径）。 */
export async function removeForbiddenSymbol(code: string): Promise<Theme> {
  const { id, data } = await themeDataOf(code);
  const next: ThemeData = { ...data };
  delete next.forbiddenSymbol;
  await repo.updateTheme(id, { data: next });
  return getTheme(code);
}

/**
 * 删主题。只有一条规矩：还有东西就先把数量说清楚，再拦（§8 护栏 3）。
 *
 * §19 之前这里还有「默认主题不能删」—— 那是 `is_default` 的一半存在理由，列删掉
 * 之后它也一起没了。剩下的这条对每个主题都成立，反而更简单。
 *
 * v0.8.3（§15）：这一层守的是**看得见的东西**，删下去是 `DELETE`。两处差别：
 *
 * - 合辑也要拦（`theme_deployments.theme_id` 是 RESTRICT），但它不在卡片计数里 ——
 *   单独问一句，报错里点名合辑的名字，作者才知道去部署页处理；
 * - 计数只数活跃行，外键却看所有行。地图 / 谜题软删的版本行由
 *   `repo.deleteTheme` 顺手抬走（注释写在那儿），这里只管「还有没有活的」。
 */
export async function deleteTheme(code: string): Promise<void> {
  const id = await repo.idOfCode(code);
  if (id === undefined) throw AppError.notFound('主题不存在');

  const deployment = await repo.findDeploymentByTheme(id);
  if (deployment) {
    throw AppError.conflict(`主题下还有合辑「${deployment.name}」，请先删除合辑`);
  }

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

/**
 * 列表筛选（`?themeCode=`）→ `theme_id`。没给 = 不筛（全部主题）。
 *
 * 编码不存在时**报错而不是返回空列表**：空列表会被读成「这个主题里没有东西」，
 * 而真相是「没有这个主题」—— 前者会让作者去新建，后者才会让他去检查地址。
 */
export async function filterThemeId(code?: string): Promise<number | undefined> {
  if (!code) return undefined;
  return requireThemeId(code);
}

/**
 * 新建内容时把「哪个主题」翻译成 `theme_id`（§19）。
 *
 * **必填，没有兜底。** §19 之前这里没给就落默认主题 —— 那等于替作者猜一个世界，
 * 猜错的表现是「刚建的东西不在当前页里」（工作空间按主题过滤）。宁可 400。
 */
export async function requireThemeId(code: string): Promise<number> {
  const id = await repo.idOfCode(code);
  if (id === undefined) throw AppError.validation('主题不存在');
  return id;
}

/**
 * v0.8.0 §5（S3 快照式）—— 主题的缺省风格，只在**新建地图那一步**取一次。
 *
 * `null` 有两种来路，处理方式相同：主题没设过风格（`data.style` 缺键），或者
 * 主题根本不存在（旧数据里的 `theme_id` 指向已删主题）。两种情况都不该让「新建
 * 地图」失败 —— 拿不到就用 `DEFAULT_MAP_STYLE`，作者进编辑器自己调。
 */
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

/**
 * 护栏 1（§8）：收集草稿里的引用，逐个核对 `theme_id`。
 *
 * 判定在 `shared/themeScope`（前端保存前调的是同一份）；这里只负责把 id 翻译成
 * 人话 —— 作者认的是「石板地属于红楼梦」，不是 `#4165`（§16.11）。
 */
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

// ---- 合辑（§9） ----

export async function listDeployments(): Promise<ThemeDeploymentSummary[]> {
  return repo.listDeployments();
}

export async function getDeployment(id: number): Promise<ThemeDeploymentSummary> {
  const found = await repo.getDeployment(id);
  if (!found) throw AppError.notFound('合辑不存在');
  return found;
}

export async function getDeploymentBySlug(slug: string): Promise<ThemeDeploymentSummary> {
  const row = await repo.findDeploymentBySlug(slug);
  if (!row) throw AppError.notFound('合辑不存在');
  return getDeployment(Number(row.id));
}

/**
 * 一键整主题部署。**这是动作，不是新状态**（§9）：对主题里每个谜题血统的最新
 * 已发布版本各跑一次 `deployGame`，再把成员与顺序写进合辑。
 *
 * 已经部署过的关沿用原访问路径 —— 红楼梦 8 个关名都是中文，`buildDefaultSlug`
 * 对它们返回空串，不带 slug 会直接 400。
 */
export async function deployTheme(
  code: string,
  input: CreateThemeDeploymentInput,
): Promise<ThemeDeploymentSummary> {
  const theme = await repo.findByCode(code);
  if (!theme) throw AppError.notFound('主题不存在');
  const themeId = Number(theme.id);

  const candidates = await repo.latestPublishedPerRoot(themeId);
  if (candidates.length === 0) {
    throw AppError.validation('这个主题还没有已发布的谜题版本，先发布一关');
  }
  const selected =
    input.puzzleIds && input.puzzleIds.length > 0
      ? candidates.filter((entry) => input.puzzleIds!.includes(entry.puzzleId))
      : candidates;
  if (selected.length === 0) {
    throw AppError.validation('选中的关卡里没有已发布的版本');
  }

  for (const entry of selected) {
    await gameService.deployGame(entry.puzzleId, {
      name: entry.name,
      slug: entry.slug ?? undefined,
    });
  }

  const id = await repo.upsertDeployment(repo.tx(), {
    themeId,
    slug: input.slug,
    name: input.name ?? theme.name,
    description: input.description ?? null,
    puzzleIds: selected.map((entry) => entry.puzzleId),
  });
  return getDeployment(id);
}

export async function updateDeployment(
  id: number,
  input: UpdateThemeDeploymentInput,
): Promise<ThemeDeploymentSummary> {
  const current = await getDeployment(id);
  const themeId = await repo.idOfCode(current.themeCode);
  if (themeId === undefined) throw AppError.notFound('主题不存在');
  await repo.upsertDeployment(repo.tx(), {
    themeId,
    slug: current.slug,
    name: input.name ?? current.name,
    description: input.description ?? current.description,
    puzzleIds: input.puzzleIds ?? current.entries.map((entry) => entry.puzzleId),
  });
  return getDeployment(id);
}

export async function removeDeployment(id: number): Promise<void> {
  const ok = await repo.deleteDeployment(id);
  if (!ok) throw AppError.notFound('合辑不存在');
}


