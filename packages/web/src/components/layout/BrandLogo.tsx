import logoUrl from '@/assets/LOREDOKU-logo.svg';

interface BrandLogoProps {
  height?: number;
  withWordmark?: boolean;
  suffix?: string;
  className?: string;
}

export function BrandLogo({
  height = 20,
  withWordmark = false,
  suffix,
  className,
}: BrandLogoProps): JSX.Element {
  return (
    <span className={className ?? 'flex shrink-0 items-center gap-2'}>
      <img
        src={logoUrl}
        alt="LOREDOKU"
        draggable={false}
        style={{ height }}
        className="w-auto select-none dark:invert dark:hue-rotate-180"
        data-testid="brand-logo"
      />
      {withWordmark ? (
        <span
          style={{ fontSize: Math.round(height * 0.82), lineHeight: 1 }}
          data-testid="brand-wordmark"
        >
          · 格物{suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
