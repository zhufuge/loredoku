import { GameSourceScope } from '@/lib/gameSource';
import { useApiGameSource } from '@/lib/apiGameSource';
import { GameView } from '@/pages/GamePage';

/**
 * v0.9.0（docs/v0.9.0.md §2）：**接口模式**的游戏页 —— 工坊与线上走的都是这一份。
 *
 * 为什么单独一个文件、而且是 `React.lazy` 加载：`useApiGameSource` 一路引到
 * `@/api/*` → `axios`。播放器（`/loredoku/:code/play`）**永远**会给 `GamePage`
 * 套一层 bundle source，所以这条分支在那边是不可达的 —— 但「不可达」和「不在产物里」
 * 是两件事。静态 import 会把 axios 打进播放器的主 chunk，动态 import 之后它退化成
 * 一个**永远不会被请求**的独立 chunk。
 *
 * 实测（v0.9.0 §10）：改之前 dev 里进关卡页会额外拉 7 个 `src/api/*.ts` 模块，
 * 改之后一个都没有。
 */
export default function ApiGamePage(): JSX.Element {
  const source = useApiGameSource();
  return (
    <GameSourceScope source={source}>
      <GameView source={source} />
    </GameSourceScope>
  );
}
