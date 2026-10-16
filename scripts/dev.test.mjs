import { describe, expect, it } from 'vitest';
import {
  DEV_DEFAULT_SERVER_PORT,
  DEV_DEFAULT_WEB_PORT,
  PORT_MAX,
  buildDevEnv,
  devCommands,
  formatBanner,
  parseDevArgs,
  validateDevPorts,
} from './dev.mjs';

describe('parseDevArgs — 默认值与合法参数（DEV-H12）', () => {
  it('无参数时沿用 3000 / 5173（与 v0.4.1 一致）', () => {
    expect(parseDevArgs([])).toEqual({ serverPort: 3000, webPort: 5173 });
    expect(DEV_DEFAULT_SERVER_PORT).toBe(3000);
    expect(DEV_DEFAULT_WEB_PORT).toBe(5173);
  });

  it('-s 4000 只改后端端口', () => {
    expect(parseDevArgs(['-s', '4000'])).toEqual({ serverPort: 4000, webPort: 5173 });
  });

  it('--server-port 4000 与 -s 4000 等价', () => {
    expect(parseDevArgs(['--server-port', '4000'])).toEqual({ serverPort: 4000, webPort: 5173 });
  });

  it('-w 5180 只改前端端口', () => {
    expect(parseDevArgs(['-w', '5180'])).toEqual({ serverPort: 3000, webPort: 5180 });
  });

  it('--web-port 5180 与 -w 5180 等价', () => {
    expect(parseDevArgs(['--web-port', '5180'])).toEqual({ serverPort: 3000, webPort: 5180 });
  });

  it('-s 4000 -w 5180 两个都改', () => {
    expect(parseDevArgs(['-s', '4000', '-w', '5180'])).toEqual({ serverPort: 4000, webPort: 5180 });
  });

  it('支持 --flag=value 形式', () => {
    expect(parseDevArgs(['--server-port=4000', '--web-port=5180'])).toEqual({
      serverPort: 4000,
      webPort: 5180,
    });
  });

  it('参数顺序无关', () => {
    expect(parseDevArgs(['-w', '5180', '-s', '4000'])).toEqual({ serverPort: 4000, webPort: 5180 });
  });
});

describe('parseDevArgs — 非法输入一律抛中文错误', () => {
  const cases = [
    { name: '非数字 abc', argv: ['--web-port', 'abc'] },
    { name: '越界下界 0', argv: ['-s', '0'] },
    { name: '越界上界 70000', argv: ['--server-port', '70000'] },
    { name: '负数 -1', argv: ['-s', '-1'] },
    { name: '小数 1.5', argv: ['-w', '1.5'] },
    { name: '缺值（结尾）', argv: ['-s'] },
    { name: '缺值（紧跟另一个参数）', argv: ['-s', '-w'] },
    { name: '空字符串值', argv: ['-w', ''] },
    { name: '重复传参 --server-port 两次', argv: ['-s', '4000', '--server-port', '4001'] },
    { name: '重复传参 -w 两次', argv: ['-w', '5180', '-w', '5181'] },
    { name: '两个端口相同', argv: ['-s', '5173', '-w', '5173'] },
    { name: '未知参数', argv: ['--ports', '4000'] },
  ];

  for (const { name, argv } of cases) {
    it(`${name} → throw`, () => {
      expect(() => parseDevArgs(argv)).toThrowError(/[\u4e00-\u9fa5]/);
    });
  }

  it('端口相同时错误信息里带上冲突的端口号', () => {
    expect(() => parseDevArgs(['-s', '5173', '-w', '5173'])).toThrowError(/5173/);
  });

  it('越界时错误信息指明合法区间', () => {
    expect(() => parseDevArgs(['-s', '70000'])).toThrowError(new RegExp(`${PORT_MAX}`));
  });

  it('validateDevPorts 单独调用也能挡住冲突端口', () => {
    expect(() => validateDevPorts({ serverPort: 4000, webPort: 4000 })).toThrowError(/4000/);
    expect(validateDevPorts({ serverPort: 4000, webPort: 5180 })).toEqual({
      serverPort: 4000,
      webPort: 5180,
    });
  });
});

describe('buildDevEnv — 端口注入环境变量', () => {
  it('server 侧 PORT 与 PUBLIC_BASE_URL 同步（否则上传图片 404）', () => {
    expect(buildDevEnv({ serverPort: 4000 }).server).toEqual({
      PORT: '4000',
      PUBLIC_BASE_URL: 'http://localhost:4000',
    });
  });

  it('web 侧 VITE_PROXY_TARGET 指向同一个后端端口', () => {
    expect(buildDevEnv({ serverPort: 4000 }).web).toEqual({
      VITE_PROXY_TARGET: 'http://localhost:4000',
    });
  });

  it('默认端口下的映射保持 v0.4.1 行为', () => {
    expect(buildDevEnv({ serverPort: DEV_DEFAULT_SERVER_PORT })).toEqual({
      server: { PORT: '3000', PUBLIC_BASE_URL: 'http://localhost:3000' },
      web: { VITE_PROXY_TARGET: 'http://localhost:3000' },
    });
  });
});

describe('devCommands / formatBanner', () => {
  it('web 命令把前端端口交给 vite 并用 --strictPort 避免静默换端口', () => {
    const commands = devCommands({ serverPort: 4000, webPort: 5180 });
    expect(commands.map((item) => item.name)).toEqual(['server', 'web']);
    expect(commands[1]?.command).toContain('--port 5180');
    expect(commands[1]?.command).toContain('--strictPort');
  });

  it('两条命令各自带着自己的环境变量', () => {
    const [server, web] = devCommands({ serverPort: 4000, webPort: 5180 });
    expect(server?.env).toEqual({ PORT: '4000', PUBLIC_BASE_URL: 'http://localhost:4000' });
    expect(web?.env).toEqual({ VITE_PROXY_TARGET: 'http://localhost:4000' });
  });

  it('汇总行包含两个可复制地址', () => {
    expect(formatBanner({ serverPort: 4000, webPort: 5180 })).toBe(
      '后端 http://localhost:4000  ·  前端 http://localhost:5180',
    );
  });
});
