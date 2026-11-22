import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PassThrough, type Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import sharp from 'sharp';
import {
  BUNDLE_COVER_MAX_DIMENSION,
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
  type GameToolIcons,
  type MapDraft,
  type PuzzleDraft,
  type ThemeCheckColors,
  type ThemeData,
  type ThemeRefTarget,
  type ThemeRing,
  type ThemeVerdict,
  type UploadedImage,
} from '@loredoku/shared';
import * as assetRepo from '../repository/assetRepository';
import * as characterRepo from '../repository/characterRepository';
import * as gameRepo from '../repository/gameRepository';
import * as themeRepo from '../repository/themeRepository';
import * as variantRepo from '../repository/assetVariantRepository';
import { AppError } from '../utils/AppError';
import { resolveUploadPath } from '../utils/paths';

/**
 * v0.8.0（docs/v0.8.0.md §11）：资源包产出侧。顺序不可换：取材 → 体检（缺一个就中止，§11.2）→ 重编号（§11.3）→ 组包（zip 流，不落盘，§11.6）。
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

/** 一关的取材单位；`summary` 只带卡片字段，别把 `toDetail` 整个塞进去。 */
interface TakenGame {
  row: gameRepo.GameRowWithPuzzle;
  input: BundleGameInput;
}

/** 打包一个主题（§11）；入口收编码（§19），包名与 manifest 的 `theme.code` 同源。 */
export async function buildThemeBundle(
  themeCode: string,
  options: { gameIds?: readonly number[] } = {},
): Promise<BuiltBundle> {
  const themeRow = await themeRepo.findByCode(themeCode);
  if (!themeRow) throw AppError.notFound('主题不存在');
  const themeId = Number(themeRow.id);

  const games = await takeGames(themeId, options.gameIds);
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
  /** 主题标记是读取时缺省，不进包则线上有图、播放器退 ×（v0.8.7 §4）。 */
  const themeMark: UploadedImage | null = themeData?.mark ?? null;
  /** 工具图标同理：主题那张不进包，线上与播放器长得不一样（v0.8.7 §7）。 */
  const themeToolIcons: GameToolIcons | null = themeData?.toolIcons ?? null;
  /** 主题级难度分级必须进包，否则退回内置五档；原序存、读侧排（v0.9.0 §13）。 */
  const themeDifficultyLevels = themeData?.difficultyLevels;

  for (const [index, game] of games.entries()) {
    const key = game.input.summary.slug;
    const cover = await takeCover(game.row, index + 1, files);
    // v0.8.6 §4：一张上传的标记图 —— 包内路径改写发生在这里（`shared/bundle`
    // 只重编号资源 id，它没有文件系统，不知道文件在不在）。
    const withMark = await takeMark(
      game.input,
      key,
      themeMark,
      files,
      problems,
    );
    const input = await takeToolIcons(withMark, key, themeToolIcons, files, problems);
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

  /** 主题级「那一圈」，全主题只装一份，路径进 `manifest.theme.ring`（v0.9.5 §2）。 */
  const ringSource = themeData?.ring?.image?.path ?? null;
  let manifestRing: ThemeRing | null = null;
  if (ringSource) {
    const taken = await files.take(ringSource, `files/ring/ring${extension(ringSource)}`);
    if (!taken) {
      problems.push({
        game: themeRow.name,
        where: '圆环',
        kind: 'file',
        message: `图片 ${ringSource} 不在了`,
      });
      throw incomplete(problems);
    }
    manifestRing = { image: { path: taken } };
  }

  /** 两档颜色写进 manifest，播放器不必再读 theme.json；只配色不配图也要能过（v0.9.3 §3）。 */
  const manifestCheckStyle: ThemeCheckColors | null = themeData?.checkStyle
    ? {
        passColor: themeData.checkStyle.passColor,
        failColor: themeData.checkStyle.failColor,
      }
    : null;

  /** 结算图标主题级只装一份，路径进 `manifest.theme.verdict.icon`；文字原样进 manifest。 */
  const verdictData = themeData?.verdict ?? null;
  const verdictIconSource = verdictData?.icon?.path ?? null;
  let manifestVerdict: ThemeVerdict | null = null;
  if (verdictData) {
    let iconTaken: string | null = null;
    if (verdictIconSource) {
      iconTaken = await files.take(
        verdictIconSource,
        `files/verdict/verdict${extension(verdictIconSource)}`,
      );
      if (!iconTaken) {
        problems.push({
          game: themeRow.name,
          where: '结算图标',
          kind: 'file',
          message: `图片 ${verdictIconSource} 不在了`,
        });
        throw incomplete(problems);
      }
    }
    manifestVerdict = {
      ...(verdictData.iconText ? { iconText: verdictData.iconText } : {}),
      ...(iconTaken ? { icon: { path: iconTaken } } : {}),
      ...(verdictData.title ? { title: verdictData.title } : {}),
    };
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
      ...(manifestRing ? { ring: manifestRing } : {}),
      ...(manifestCheckStyle ? { checkStyle: manifestCheckStyle } : {}),
      ...(manifestVerdict ? { verdict: manifestVerdict } : {}),
      // 列表页那两行字。纯字符串，不落盘，没配就不写键。
      ...(themeData?.gameList ? { gameList: themeData.gameList } : {}),
      // 列表页标题的字体（v0.11.10），同上。
      ...(themeData?.fontFamily ? { fontFamily: themeData.fontFamily } : {}),
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

/** 先构造后压缩：体检必须在写出任何字节前中止（§11.2）；`PassThrough` 不可省（`ZipArchive` 非 Node 流）。 */
export function zipStream(built: BuiltBundle): Readable {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  for (const entry of built.entries) archive.append(entry.data, { name: entry.path });

  const out = new PassThrough();
  archive.on('error', (error: Error) => out.destroy(error));
  archive.pipe(out);
  void archive.finalize();
  return out;
}

/** 素材取主题里全部已上线关卡，顺序按 `sort_weight` 升序、`slug` 兜底；`gameIds` 给了就只打这几关（v0.8.3 §6.2）。 */
async function takeGames(
  themeId: number,
  gameIds?: readonly number[],
): Promise<TakenGame[]> {
  const rows = await gameRepo.listGameRowsByTheme(themeId);
  if (gameIds === undefined) {
    if (rows.length === 0) {
      // 空包是零字节的谜题（§11.1）：导出按钮在界面上就该是灰的，这里是兜底。
      throw AppError.validation('这个主题还没有上线的关卡，先至少上线一关');
    }
    return rows.map(toTaken);
  }

  // `row.id` 在 knex 里可能是字符串（bigint），统一成数字再比。
  const available = new Set(rows.map((row) => Number(row.id)));
  const wanted = new Set(gameIds);
  const missing = [...wanted].filter((id) => !available.has(id));
  if (missing.length > 0) {
    throw AppError.validation(
      `选中的第 ${missing.join('、')} 关不在线或不属于这个主题`,
    );
  }
  const picked = rows.filter((row) => wanted.has(Number(row.id)));
  if (picked.length === 0) {
    // 前端不允许点了零个就提交，这里是接口被直接调用的兜底。
    throw AppError.validation('没有选中任何关卡，先勾上至少一关');
  }
  return picked.map(toTaken);
}

function toTaken(row: gameRepo.GameRowWithPuzzle): TakenGame {
  const detail = gameRepo.toDetail(row);
  const puzzle: PuzzleDraft | null = detail.puzzle;
  if (!puzzle) {
    throw AppError.validation(`「${row.name}」的谜题数据读不出来，请重新上线这一关`);
  }
  return {
    row,
    input: { summary: gameRepo.toSummary(row), map: detail.map, puzzle },
  };
}

/** 引用闭包 → 资源/角色；形态只留被格子引用的 + 每个被引资源的首形态（v0.11.0 §2）。 */
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

  // 序号补齐：被格子引用的形态 `buildBundleIdMaps` 已经发过号，
  // 这里只给每个被引资源的**首形态**补一个 —— 没写 variantId 的格子画的就是它。
  for (const assetId of ids.assets.keys()) {
    if (!assets.has(assetId)) continue;
    const first = assets.get(assetId)!.variants[0];
    if (first && !ids.variants.has(first.id)) {
      ids.variants.set(first.id, ids.variants.size + 1);
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
      // v0.11.0（docs/v0.11.0.md §2）：没被任何格子引用、也不是首形态的形态不进包。
      // `collectSideTables` 给保留集都发过号，没有号的就是被裁掉的。
      if (!ids.variants.has(variant.id)) continue;
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

/** 只带缩略图（平均 12 KB，原图 450 KB~2 MB），缩略图缺失才退回原图（§11.2）。 */
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

/** 关卡封面统一裁到 768/webp（原图现转，不用上传缩略图），地图封面不要（v0.11.0 §3）。 */
async function takeCover(
  row: gameRepo.GameRowWithPuzzle,
  index: number,
  files: FileSink,
): Promise<string | null> {
  if (!row.cover_path) return null;
  return files.takeProcessed(row.cover_path, `files/covers/${index}.webp`, scaleBundleCover);
}

/** v0.11.0 §3：封面统一 768 / webp。`fit: 'inside'` + `withoutEnlargement` 与上传侧同一条规矩。 */
async function scaleBundleCover(data: Buffer): Promise<Buffer> {
  return sharp(data, { density: 96 })
    .resize(BUNDLE_COVER_MAX_DIMENSION, BUNDLE_COVER_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
}

/** 主题兜底的关都指向 `files/marks/theme.webp`；源缺失不改写只记问题，且必须返回新输入。 */
async function takeMark(
  game: BundleGameInput,
  gameKey: string,
  fallback: UploadedImage | null,
  files: FileSink,
  problems: BundleProblem[],
): Promise<BundleGameInput> {
  /** 自己配的用自己，否则用主题那张；两边都没有就不带，播放器画 `×`（v0.8.7 §4）。 */
  const own = game.puzzle.mark?.path;
  const sourcePath = own ?? fallback?.path;
  if (!sourcePath) return game;

  const target = `files/marks/${own ? gameKey : 'theme'}${extension(sourcePath)}`;
  const taken = await files.take(sourcePath, target);
  if (!taken) {
    problems.push({
      game: game.summary.name,
      where: '标记',
      kind: 'file',
      message: `图片 ${sourcePath} 不在了`,
    });
    return game;
  }
  return { ...game, puzzle: { ...game.puzzle, mark: { path: taken } } };
}

/** 主题兜底的图标指向 `files/icons/theme-<icon>.webp`；某一枚缺失只跳过那枚（v0.8.7 §7）。 */
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
    const own = game.puzzle.toolIcons?.[icon]?.path;
    const sourcePath = own ?? themeIcons?.[icon]?.path;
    if (!sourcePath) continue;
    const target = `files/icons/${own ? gameKey : 'theme'}-${icon}${extension(sourcePath)}`;
    const taken = await files.take(sourcePath, target);
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

  /** 读出来过一道转换再存（封面 768/webp），去重同 `take`，按目标路径（v0.11.0 §3）。 */
  async takeProcessed(
    sourcePath: string,
    targetPath: string,
    transform: (data: Buffer) => Promise<Buffer>,
  ): Promise<string | null> {
    if (this.byPath.has(targetPath)) return targetPath;
    const data = await readQuietly(resolveUploadPath(sourcePath));
    if (!data) return null;
    this.push(targetPath, await transform(data));
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

/** 只记字体族名、不带文件：字体是播放器的构建期资源，进包就是 N 份 925 KB（§11.5）。 */
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
