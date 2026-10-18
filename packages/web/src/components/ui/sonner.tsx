import { Toaster as SonnerToaster } from 'sonner';
import { TOAST_OFFSET } from '@loredoku/shared';
import { useTheme } from '@/hooks/useTheme';

export function Toaster(): JSX.Element {
  const { resolved } = useTheme();

  return (
    <SonnerToaster
      position="top-right"
      offset={TOAST_OFFSET}
      theme={resolved}
      richColors
      closeButton
    />
  );
}
