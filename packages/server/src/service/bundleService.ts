import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PassThrough, type Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import {
  BUNDLE_FORMAT_VERSION,
  GAME_TOOL_ICON_KINDS,
  GAME_TOOL_ICON_LABELS,
  buildBundleIdMaps,
  buildBundleManifest,
  buildBundlePuzzleFile,
  bundleRefsOf,
  type Asset,
  type AssetVariant,
  type BundleAssetsFile,
  type BundleCharactersFile,
  type BundleGameInput,
  type BundleIdMaps,
  type BundleManifest,
  type BundleManifestFile,
  type BundleManifestGame,
  type BundleThemeFile,
  type Character,
  type ForbiddenSymbolImage,
  type GameToolIcons,
  type MapDraft,
  type PuzzleDraft,
  type ThemeData,
  type ThemeRefTarget,
} from '@loredoku/shared';
import * as assetRepo from '../repository/assetRepository';
import * as characterRepo from '../repository/characterRepository';
import * as gameRepo from '../repository/gameRepository';
import * as themeRepo from '../repository/themeRepository';
import * as variantRepo from '../repository/assetVariantRepository';
import { AppError } from '../utils/AppError';
import { resolveUploadPath } from '../utils/paths';

/**
 * v0.8.0（docs/v0.8.0.md §11）—— 资源包的产出侧。
 *
 * 取材是**已上线的游戏**（§11.1）：包里那一关就是把 `getGameDetail` 的结果搬走，
 * 所以「包里和线上是否一致」不需要人工核对 —— 它们本来就是同一份数据。
 *
 * 这一层做四件事，顺序不能换：
 *
 * 1. **取材**：主题下活跃的 `games` 行 → `MapGameDetail`；有合辑就按作者的顺序。
 * 2. **体检**：引用闭包里的每一行、每一个文件都得在，缺一个就**中止**（§11.2）。
 *    宁可一个包都不产出，也不要交付一个少一张图的包。
 * 3. **重编号**：`shared/bundle` 的纯函数，按首次出现顺序发 1..N（§11.3）。
 * 4. **组包**：文件按路径去重、算 sha256、写 manifest。
 *
 * 产物是**数据包**，不是站点：没有 `player/`、没有 `index.html`、没有 `bundles` 表、
 * 不落盘也不托管（§11.6）。所以这里是「构造一个 zip 流」而不是「生成一个文件」。
 */

export interface BundleEntry {
  path: string;
  data: Buffer;
}

export interface BuiltBundle {
  /** 下载文件名，例如 `hlm-bundle-20261029-1120.zip`。 */
  filename: string;
  manifest: BundleManifest;
  entries: BundleEntry[];
}

/** 体检失败时列的东西 —— 前端要把它们逐条念给作者听，别只给一句话。 */
export interface BundleProblem {
  game: string;
  where: string;
  kind: ThemeRefTarget['kind'] | 'file';
  message: string;
}

const KIND_LABEL: Record<ThemeRefTarget['kind'], string> = {
  asset: '资源',
  variant: '形态',
  character: '角色',
};

/**
 * 一关的取材单位。`summary` 只带卡片字段 —— 千万别把 `toDetail` 的整个对象当
 * summary 塞进 `puzzles/*.json`，那会把 `map` / `puzzle` 再复制一遍。
 */
interface TakenGame {
  row: gameRepo.GameRowWithPuzzle;
  input: BundleGameInput;
}

/**
 * 打包一个主题（§11）。入口收的是**编码**（§19）—— 包名、manifest 里的 `theme.code`
 * 都用它，让「地址里的主题」与「包里的主题」是同一个字符串。
 */
export async function buildThemeBundle(themeCode: string): Promise<BuiltBundle> {
  const themeRow = await themeRepo.findByCode(themeCode);
  if (!themeRow) throw AppError.notFound('主题不存在');
  const themeId = Number(themeRow.id);

  const games = await takeGames(themeId);
  const ids = buildBundleIdMaps(games.map((game) => game.input));

  const problems: BundleProblem[] = [];
  const files = new FileSink();

  const { assets, characters } = await collectSideTables(games, ids, problems);
  const bundleAssets = await rewriteAssets(assets, ids, files, problems);
  const bundleCharacters = await rewriteCharacters(characters, ids, files, problems);
  const manifestGames: BundleManifestGame[] = [];
  const originGames: Record<string, number> = {};
  const puzzleEntries: BundleEntry[] = [];
  /** 主题的 `data` 是 JSON 列，取一次给下面三处用。 */
  const themeData = (themeRow.data as ThemeData | null) ?? null;
  /**
   * v0.8.7 §4：主题的禁止符号是**读取时**的缺省。包里必须把它一起装上 ——
   * 否则「线上跟着主题画一张图、包里退回 ×」，同一关在两种运行环境里长得不一样。
   * 谜题自己配了就不看这份（那一关的 JSON 里已经有路径）。
   */
  const themeForbiddenSymbol: ForbiddenSymbolImage | null = themeData?.forbiddenSymbol ?? null;
  /**
   * v0.8.7 §7：工具按钮图标同样要进包，理由与禁止符号一字不差 —— 线上画的是主题
   * 那张，包里若没有，同一关的按钮在两种运行环境里长得不一样。
   */
  const themeToolIcons: GameToolIcons | null = themeData?.toolIcons ?? null;
  /**
   * 2026-11-09 补（docs/v0.9.0.md §13）：主题的难度分级。包里每关只带 `difficulty`
   * **数字**，名字与颜色是主题级的；不带上它，播放器的列表页只能退回内置五档，
   * 作者配的「初 / 通」在下载包里变成「极简 / 简单」。
   *
   * 存原始配置、不在导出时排序：`resolveDifficultyTiers` 在读包那一侧统一排，
   * 与线上 `useDifficultyTiersByCode` 是同一条规矩。
   */
  const themeDifficultyLevels = themeData?.difficultyLevels;

  for (const [index, game] of games.entries()) {
    const key = game.input.summary.slug;
    const cover = await takeCover(game.row, index + 1, files);
    // v0.8.6 §4：一张上传的禁止符号图 —— 包内路径改写发生在这里（`shared/bundle`
    // 只重编号资源 id，它没有文件系统，不知道文件在不在）。
    const withSymbol = await takeForbiddenSymbol(
      game.input,
      key,
      themeForbiddenSymbol,
      files,
      problems,
    );
    const input = await takeToolIcons(withSymbol, key, themeToolIcons, files, problems);
    manifestGames.push({
      key,
      file: `puzzles/${key}.json`,
      name: game.input.summary.name,
      puzzleName: game.input.summary.puzzleName,
      gridSize: game.input.summary.gridSize,
      difficulty: game.input.summary.difficulty,
      cover,
    });
    originGames[key] = Number(game.row.id);

    const file = buildBundlePuzzleFile(input, ids);
    puzzleEntries.push({ path: `puzzles/${key}.json`, data: json(file) });
  }

  if (problems.length > 0) throw incomplete(problems);

  /**
   * v0.9.2 §2：长按计时环那张图 —— 主题级、所有关卡共用一张，所以只装一份，
   * 路径进 `manifest.theme.pressRing`。不逐关复制：同一张图进 8 份没有意义，
   * 而播放器进列表页时已经读了 manifest。
   */
  const pressRingSource = themeData?.pressRing?.path ?? null;
  let manifestPressRing: ForbiddenSymbolImage | null = null;
  if (pressRingSource) {
    const taken = await files.take(pressRingSource, `files/ring/press-ring${extension(pressRingSource)}`);
    if (!taken) {
      problems.push({
        game: themeRow.name,
        where: '计时环',
        kind: 'file',
        message: `图片 ${pressRingSource} 不在了`,
      });
      throw incomplete(problems);
    }
    manifestPressRing = { path: taken };
  }

  const exportedAt = new Date().toISOString();
  const themeFile: BundleThemeFile = {
    code: themeRow.code,
    name: themeRow.name,
    description: themeRow.description,
    exportedAt,
  };
  const assetsFile: BundleAssetsFile = { version: BUNDLE_FORMAT_VERSION, assets: bundleAssets };
  const charactersFile: BundleCharactersFile = {
    version: BUNDLE_FORMAT_VERSION,
    characters: bundleCharacters,
  };

  const manifest = buildBundleManifest({
    theme: {
      code: themeRow.code,
      name: themeRow.name,
      description: themeRow.description,
      ...(themeDifficultyLevels ? { difficultyLevels: themeDifficultyLevels } : {}),
      ...(manifestPressRing ? { pressRing: manifestPressRing } : {}),
    },
    exportedAt,
    games: manifestGames,
    // 校验和要覆盖包里**除 manifest 自己以外**的一切 —— 三份侧表 + 每关 + 每个文件。
    files: [
      ...fileEntry('theme.json', themeFile),
      ...fileEntry('assets.json', assetsFile),
      ...fileEntry('characters.json', charactersFile),
      ...puzzleEntries.map((entry) => digest(entry)),
      ...files.manifest,
    ],
    fonts: collectFonts(games.map((game) => game.input.map)),
    ids,
    originGames,
  });

  return {
    filename: `${themeRow.code}-bundle-${stamp(new Date(exportedAt))}.zip`,
    manifest,
    entries: [
      // manifest 放第一个：解压的人第一眼看到的是「这是什么」，不是一堆 webp。
      { path: 'manifest.json', data: json(manifest) },
      { path: 'theme.json', data: json(themeFile) },
      { path: 'assets.json', data: json(assetsFile) },
      { path: 'characters.json', data: json(charactersFile) },
      ...puzzleEntries,
      ...files.buffers,
    ],
  };
}

/**
 * 把构造好的条目压成 zip 流。**先构造、后压缩** —— 体检必须能在任何字节被写出去
 * 之前中止，否则作者会拿到一个「能解压但少东西」的包（§11.2）。
 *
 * 为什么中间还要过一个 `PassThrough`：`archiver` 8 的 `ZipArchive` 继承的是
 * `readable-stream` 的 `Transform`，**不是** Node 的 `stream.Stream`。koa 的
 * `respond()` 用 `body instanceof Stream` 判断是不是流，判不出来就当 JSON 去
 * `JSON.stringify` —— 于是「Converting circular structure to JSON」＋ 500。
 * 转接一层真 Node 流之后 koa 才会 chunked 输出；错误也顺手转发过去。
 */
export function zipStream(built: BuiltBundle): Readable {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  for (const entry of built.entries) archive.append(entry.data, { name: entry.path });

  const out = new PassThrough();
  archive.on('error', (error: Error) => out.destroy(error));
  archive.pipe(out);
  void archive.finalize();
  return out;
}

// ---- 取材 ----

/**
 * 取材：主题里所有已上线的关卡。
 *
 * v0.9.2：`orderByCollection` 没了 —— 合辑（`theme_deployments`）已被删除，包的
 * 关卡顺序就是 `listGameRowsByTheme` 自己的那个顺序（`sort_weight` 升序、`slug`
 * 兜底，v0.8.3 §6.2）。作者要调整阅读顺序，改的就是部署页那一列权重。
 */
async function takeGames(themeId: number): Promise<TakenGame[]> {
  const rows = await gameRepo.listGameRowsByTheme(themeId);
  if (rows.length === 0) {
    // 空包是零字节的谜题（§11.1）：导出按钮在界面上就该是灰的，这里是兜底。
    throw AppError.validation('这个主题还没有上线的关卡，先至少上线一关');
  }

  return rows.map((row) => {
    const detail = gameRepo.toDetail(row);
    const puzzle: PuzzleDraft | null = detail.puzzle;
    if (!puzzle) {
      throw AppError.validation(`「${row.name}」的谜题数据读不出来，请重新上线这一关`);
    }
    return {
      row,
      input: { summary: gameRepo.toSummary(row), map: detail.map, puzzle },
    };
  });
}

// ---- 侧表（assets.json / characters.json） ----

/**
 * 引用闭包 → 资源 / 角色两行。
 *
 * 为了让 `assets.json` 自带**整张形态表**（而不是只带被引用的那一个形态），
 * 未被引用的形态也在这里补发序号：播放器要画资源面板时，缺形态就等于缺选项；
 * 而且「只带被引用形态」还会撞上 `Asset.variants` 永不为空的约定。
 */
async function collectSideTables(
  games: TakenGame[],
  ids: BundleIdMaps,
  problems: BundleProblem[],
): Promise<{ assets: Map<number, Asset>; characters: Map<number, Character> }> {
  const assetIds = new Set<number>();
  const variantIds = new Set<number>();
  const characterIds = new Set<number>();
  for (const game of games) {
    for (const ref of bundleRefsOf(game.input)) {
      if (ref.kind === 'asset') assetIds.add(ref.id);
      else if (ref.kind === 'variant') variantIds.add(ref.id);
      else characterIds.add(ref.id);
    }
  }

  const variants = await variantRepo.listByIds([...variantIds]);
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  // 只被 `variantId` 引用、没被 `assetId` 引用的资源（正常草稿不会有，兜住）。
  for (const variant of variants) assetIds.add(variant.assetId);

  const assets = await assetRepo.assetsByIds([...assetIds]);
  const characters = await characterRepo.charactersByIds([...characterIds]);

  for (const game of games) {
    const name = game.input.summary.name;
    for (const ref of bundleRefsOf(game.input)) {
      if (ref.kind === 'asset' && !assets.has(ref.id)) {
        problems.push({
          game: name,
          where: ref.where,
          kind: 'asset',
          message: `${KIND_LABEL.asset} #${ref.id} 不存在`,
        });
      } else if (ref.kind === 'variant' && !variantById.has(ref.id)) {
        problems.push({
          game: name,
          where: ref.where,
          kind: 'variant',
          message: `${KIND_LABEL.variant} #${ref.id} 不存在`,
        });
      } else if (ref.kind === 'character' && !characters.has(ref.id)) {
        problems.push({
          game: name,
          where: ref.where,
          kind: 'character',
          message: `${KIND_LABEL.character} #${ref.id} 不存在`,
        });
      }
    }
  }

  // 序号补齐：先给被引用的形态（`buildBundleIdMaps` 已经发过），再按资源序号给其余的。
  for (const assetId of [...ids.assets.keys()]) {
    if (!assets.has(assetId)) continue;
    for (const variant of assets.get(assetId)!.variants) {
      if (!ids.variants.has(variant.id)) ids.variants.set(variant.id, ids.variants.size + 1);
    }
  }
  return { assets, characters };
}

async function rewriteAssets(
  assets: Map<number, Asset>,
  ids: BundleIdMaps,
  files: FileSink,
  problems: BundleProblem[],
): Promise<Asset[]> {
  const out: Asset[] = [];
  // 按包内序号输出 —— 解压后 `assets.json` 的顺序和画布上第一次出现的顺序一致。
  for (const [assetId, local] of [...ids.assets.entries()].sort((left, right) => left[1] - right[1])) {
    const asset = assets.get(assetId);
    if (!asset) continue;
    const base = `${local}-${safeName(asset.code, `asset-${local}`)}`;
    // 同一个资源的不同形态可能是不同的图；只有一张图时文件名不带形态段，
    // 这样最常见的资源读起来就是 `1-hlm_stone_paving.webp`。
    const distinct = new Set(
      asset.variants.map((variant) => variant.imagePath).filter((path): path is string => !!path),
    );
    const multiImage = distinct.size > 1;

    const variants: AssetVariant[] = [];
    for (const [index, variant] of asset.variants.entries()) {
      const name = multiImage ? `${base}-${index + 1}` : base;
      const image = await rewriteImage(variant, name, files);
      if (variant.imagePath && !image.imageUrl) {
        problems.push({
          game: '',
          where: `资源「${asset.name}」`,
          kind: 'file',
          message: `图片 ${variant.imagePath} 不在了`,
        });
      }
      variants.push({
        ...variant,
        id: ids.variants.get(variant.id) ?? variant.id,
        assetId: local,
        ...image,
      });
    }
    out.push({ ...asset, id: local, variants });
  }
  return out;
}

/**
 * 一张图。**只带缩略图**，缩略图缺失才退回原图（2026-10-29 实测后的修正，见 §11.2）：
 *
 * | | 原图 | 缩略图（`_thumb.webp`） |
 * |---|---|---|
 * | 单张 | 平均 450 KB，最大 2 MB | 平均 12 KB |
 * | 红楼梦 8 关 | 108 MB（包 111 MB） | 约 2 MB |
 *
 * 画布层本来就优先用 `imageThumbUrl`（`MapAssetLayers.tsx`），512px 对几十像素的
 * 格子绰绰有余；把原图塞进包，等于作者下载一个 111 MB 的 zip 去玩四十格棋盘。
 */
async function rewriteImage(
  variant: AssetVariant,
  base: string,
  files: FileSink,
): Promise<Pick<AssetVariant, 'imagePath' | 'imageUrl' | 'imageThumbUrl'>> {
  if (!variant.imagePath) return { imagePath: null, imageUrl: null, imageThumbUrl: null };

  const small = await files.take(thumbOf(variant.imagePath), `files/assets/${base}.webp`);
  const full = small
    ? null
    : await files.take(variant.imagePath, `files/assets/${base}${extension(variant.imagePath)}`);
  const one = small ?? full;
  return {
    // 包里 `imagePath` / `imageUrl` / `imageThumbUrl` 是同一个值：包内相对路径。
    // 播放器用 `resolveFile` 拼到包根，所以这里不能留绝对 URL（§11.2）；
    // 三个字段都填，是为了让「优先缩略图」的既有渲染代码一行不改。
    imagePath: one,
    imageUrl: one,
    imageThumbUrl: one,
  };
}

async function rewriteCharacters(
  characters: Map<number, Character>,
  ids: BundleIdMaps,
  files: FileSink,
  problems: BundleProblem[],
): Promise<Character[]> {
  const out: Character[] = [];
  for (const [characterId, local] of [...ids.characters.entries()].sort((left, right) => left[1] - right[1])) {
    const character = characters.get(characterId);
    if (!character) continue;
    const base = `${local}-${safeName(character.code, `character-${local}`)}`;
    let avatarUrl: string | null = null;
    let avatarThumbUrl: string | null = null;
    if (character.avatarPath) {
      // 与资源同一条规则：只带缩略图，缺了退回原图。
      avatarUrl = await files.take(
        thumbOf(character.avatarPath),
        `files/avatars/${base}.webp`,
      );
      if (!avatarUrl) {
        avatarUrl = await files.take(
          character.avatarPath,
          `files/avatars/${base}${extension(character.avatarPath)}`,
        );
      }
      avatarThumbUrl = avatarUrl;
      if (!avatarUrl) {
        problems.push({
          game: '',
          where: `角色「${character.name}」`,
          kind: 'file',
          message: `头像 ${character.avatarPath} 不在了`,
        });
      }
    }
    out.push({
      ...character,
      id: local,
      avatarPath: avatarUrl,
      avatarUrl,
      avatarThumbUrl,
    });
  }
  return out;
}

/** 关卡封面：卡片要（§11.2），地图封面不要 —— 游戏页不显示它。 */
async function takeCover(
  row: gameRepo.GameRowWithPuzzle,
  index: number,
  files: FileSink,
): Promise<string | null> {
  if (!row.cover_path) return null;
  return files.take(row.cover_path, `files/covers/${index}${extension(row.cover_path)}`);
}

/**
 * v0.8.6 §4：一关的禁止符号图进包，并把该关 JSON 里的 `path` 改写成包内相对路径
 * （与资源图同一条「包内相对地址」约定，由播放器的 `resolveFile` 拼到包根）。
 *
 * 目标文件名只用 `gameKey`：一关最多一张符号图，slug 已经唯一且只含 `[a-z0-9-]`。
 * 源文件缺失时**不改写**，只记一条 `file` 问题 —— 反正 `problems` 非空时打包会在
 * 构造下一律中止（§11.2），产出的 `path` 不会被交给任何人。
 *
 * 返回的是新的 `BundleGameInput`：`buildBundlePuzzleFile` 会 clone 谜题，但输入
 * 本身还被别处用来算引用闭包，不能原地改。
 */
async function takeForbiddenSymbol(
  game: BundleGameInput,
  gameKey: string,
  fallback: ForbiddenSymbolImage | null,
  files: FileSink,
  problems: BundleProblem[],
): Promise<BundleGameInput> {
  /**
   * v0.8.7 §4：自己配了用自己的，没配就用主题那张（与玩家侧同一个顺序）。
   * 只有一条出路 —— 两边都没有，这一关进包时就不带符号图，播放器画 `×`。
   */
  const sourcePath = game.puzzle.forbiddenSymbol?.path ?? fallback?.path;
  if (!sourcePath) return game;

  const taken = await files.take(sourcePath, `files/symbols/${gameKey}${extension(sourcePath)}`);
  if (!taken) {
    problems.push({
      game: game.summary.name,
      where: '禁止符号',
      kind: 'file',
      message: `图片 ${sourcePath} 不在了`,
    });
    return game;
  }
  return { ...game, puzzle: { ...game.puzzle, forbiddenSymbol: { path: taken } } };
}

/**
 * v0.8.7 §7：一关的三枚工具按钮图标进包，并把该关 JSON 里各自的 `path` 改写成包内
 * 相对路径。解析顺序与玩家侧一致：谜题自己的 → 主题的 → （都没有就不带，播放器用
 * 内置图标）。
 *
 * 目标文件名带 `-<icon>`：一关最多三张，`<slug>-clear.webp` 这样的名字既唯一又能在
 * 解压后一眼看出是哪一枚。某一枚的源文件缺失**只跳过那一枚** —— 另外两枚照样进包，
 * 打包仍会因为 `problems` 非空而中止（§11.2）。
 */
async function takeToolIcons(
  game: BundleGameInput,
  gameKey: string,
  themeIcons: GameToolIcons | null,
  files: FileSink,
  problems: BundleProblem[],
): Promise<BundleGameInput> {
  const resolved: GameToolIcons = {};
  let touched = false;
  for (const icon of GAME_TOOL_ICON_KINDS) {
    const sourcePath = game.puzzle.toolIcons?.[icon]?.path ?? themeIcons?.[icon]?.path;
    if (!sourcePath) continue;
    const taken = await files.take(
      sourcePath,
      `files/icons/${gameKey}-${icon}${extension(sourcePath)}`,
    );
    if (!taken) {
      problems.push({
        game: game.summary.name,
        where: `工具图标（${GAME_TOOL_ICON_LABELS[icon]}）`,
        kind: 'file',
        message: `图片 ${sourcePath} 不在了`,
      });
      continue;
    }
    resolved[icon] = { path: taken };
    touched = true;
  }
  if (!touched) return game;
  return { ...game, puzzle: { ...game.puzzle, toolIcons: resolved } };
}

// ---- 小工具 ----

class FileSink {
  readonly buffers: BundleEntry[] = [];
  readonly manifest: BundleManifestFile[] = [];

  /** 同一个 `image_path` 被多关引用时只存一份（红楼梦 8 关共用 13 个资源）。 */
  private readonly byPath = new Set<string>();

  async take(sourcePath: string, targetPath: string): Promise<string | null> {
    if (this.byPath.has(targetPath)) return targetPath;
    const data = await readQuietly(resolveUploadPath(sourcePath));
    if (!data) return null;
    this.push(targetPath, data);
    return targetPath;
  }

  private push(path: string, data: Buffer): void {
    this.byPath.add(path);
    this.buffers.push({ path, data });
    this.manifest.push(digest({ path, data }));
  }
}

async function readQuietly(absolutePath: string): Promise<Buffer | null> {
  try {
    return await readFile(absolutePath);
  } catch {
    return null;
  }
}

/** `assets/4165/variants/9/xxx.webp` → `assets/4165/variants/9/xxx_thumb.webp`。 */
function thumbOf(relativePath: string): string {
  const dot = relativePath.lastIndexOf('.');
  const base = dot === -1 ? relativePath : relativePath.slice(0, dot);
  return `${base}_thumb.webp`;
}

function extension(relativePath: string): string {
  const dot = relativePath.lastIndexOf('.');
  if (dot === -1) return '';
  return relativePath.slice(dot).toLowerCase();
}

/** 文件名只留 `[A-Za-z0-9_-]`：`code` 本来就是 ASCII，这里只是不让路径分隔符混进去。 */
function safeName(code: string, fallback: string): string {
  const cleaned = code.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : fallback;
}

function digest(entry: BundleEntry): BundleManifestFile {
  return {
    path: entry.path,
    bytes: entry.data.length,
    sha256: createHash('sha256').update(entry.data).digest('hex'),
  };
}

/** 每份 JSON 的校验和：先序列化一次，避免「写进去的」和「算过 hash 的」不是同一串字节。 */
function fileEntry(path: string, value: unknown): BundleManifestFile[] {
  return [digest({ path, data: json(value) })];
}

function json(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** `2026-10-29T11:20:00.000Z` → `20261029-1120`（文件名里不用冒号）。 */
function stamp(at: Date): string {
  const iso = at.toISOString();
  return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
}

/**
 * 这 N 关用到哪些字体族。**本版只记名字、不带文件**（§11.5）：字体是播放器的
 * 构建期资源，塞进包里就是 N 份同样的 925 KB。
 */
function collectFonts(maps: MapDraft[]): string[] {
  const out: string[] = [];
  const push = (name: string | null | undefined): void => {
    if (name && !out.includes(name)) out.push(name);
  };
  for (const map of maps) {
    push(map.style?.regionLabel.fontFamily);
    for (const region of map.regions ?? []) push(region.style?.label?.fontFamily);
  }
  return out;
}

function incomplete(problems: BundleProblem[]): AppError {
  const lines = problems
    .slice(0, 10)
    .map((problem) => `${problem.game ? `「${problem.game}」` : ''}${problem.where}：${problem.message}`);
  const more = problems.length > 10 ? `……另有 ${problems.length - 10} 处` : '';
  return AppError.validation(`打包中止：有 ${problems.length} 处引用或文件缺失`, {
    kind: 'bundle-incomplete',
    problems: problems.slice(0, 50),
    lines: [...lines, more].filter(Boolean),
  });
}
