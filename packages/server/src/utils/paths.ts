import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env';

export const serverRoot = fileURLToPath(new URL('../..', import.meta.url));
export const uploadRoot = resolve(serverRoot, env.UPLOAD_ROOT);
export const publicBaseUrl = env.PUBLIC_BASE_URL.replace(/\/+$/, '');

export function buildFileUrl(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${publicBaseUrl}/api/files/${normalized}`;
}
