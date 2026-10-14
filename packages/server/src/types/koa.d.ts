import type { Context } from 'koa';

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}

declare module 'koa' {
  interface Request {
    body?: unknown;
  }

  interface Context {
    file?: MulterFile;
    files?: MulterFile[] | Record<string, MulterFile[]>;
  }
}
