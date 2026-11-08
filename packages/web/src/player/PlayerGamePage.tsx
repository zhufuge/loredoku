import { Link, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingScreen } from '@/components/common/LoredokuLoader';
import { GamePage } from '@/pages/GamePage';
import { GameSourceScope } from '@/lib/gameSource';
import { themeHrefOf } from './bundleLoad';
import { useBundleGameSource, useBundleManifest } from './PlayerBundleProvider';

/**
 * v0.9.0（docs/v0.9.0.md §7）—— 一关 `/loredoku/:code/play/:key`。
 *
 * 这个组件只做**三道门**，然后就把画布交给 `GamePage`：
 *
 * 1. 包在不在（`manifest` 取得到吗）；
 * 2. 目录名与包的身份对不对得上（`/loredoku/hlm/` 里装的必须真是 hlm）；
 * 3. 包里有没有这一关（`manifest.games` 是唯一的清单，没有就是没有）。
 *
 * 三道门之后是**同一个** `GamePage`（工坊里那个），只换了一层 `GameSource`。
 * 这就是 v0.8.0 §11.6 那句「不要复制一份 GamePage」的落地：1500 行渲染逻辑
 * 一行没抄。
 */
export function PlayerGamePage(): JSX.Element {
  const { code = '', key = '' } = useParams<{ code: string; key: string }>();
  const source = useBundleGameSource(code);
  const { data: manifest, isLoading, isError, error } = useBundleManifest(code);

  if (isLoading) return <LoadingScreen caption="正在加载关卡…" />;

  if (isError || !manifest) {
    return (
      <PlayerNotice
        title={`这个播放器里没有「${code}」这个主题的资源包`}
        detail={error instanceof Error ? error.message : '资源包读不出来'}
        code={code}
      />
    );
  }

  if (manifest.theme.code !== code) {
    return (
      <PlayerNotice
        title={`这个目录里装的不是「${code}」的包`}
        detail={`包里的身份是「${manifest.theme.code}」—— 部署时目录名要与主题编码一致。`}
        code={manifest.theme.code}
      />
    );
  }

  if (!manifest.games.some((game) => game.key === key)) {
    return (
      <PlayerNotice
        title={`这个主题里没有「${key}」这一关`}
        detail={`包里一共 ${manifest.games.length} 关。`}
        code={code}
      />
    );
  }

  return (
    <GameSourceScope source={source}>
      <GamePage />
    </GameSourceScope>
  );
}

/**
 * 播放器的三个错误页。它们长得一样，因为对玩家来说都是「打不开」——
 * 差别只在第二行那句给作者看的说明。
 */
function PlayerNotice({
  title,
  detail,
  code,
}: {
  title: string;
  detail: string;
  code: string;
}): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="flex max-w-lg flex-col items-center gap-3 p-12 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
        <Button variant="outline" asChild>
          {/* 用 `Link` 而不是 `<a href>`：地址是 basename 内的（`/hlm/play`），
              交给 router 补前缀，写死 href 会掉到站点根上去。 */}
          <Link to={themeHrefOf(code)}>回到关卡列表</Link>
        </Button>
      </Card>
    </div>
  );
}
