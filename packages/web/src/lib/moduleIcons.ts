import { Layers, Map, Package, Puzzle, Rocket, Users } from 'lucide-react';
import type { ModuleKey } from './workspace';

/**
 * 模块图标只有一份。
 *
 * 顶栏导航与概览页的四个计数卡说的是同一件事 —— 「去哪个模块」，图标自然该是
 * 同一枚。所以把图标收进这张表，顶栏与概览都从这里取 —— 以后再加模块，缺一枚
 * 图标会在类型检查时就报出来，而不是等到看见两处长得不像。
 */
export const MODULE_ICONS: Record<ModuleKey, typeof Package> = {
  overview: Layers,
  assets: Package,
  maps: Map,
  characters: Users,
  puzzles: Puzzle,
  deployments: Rocket,
};
