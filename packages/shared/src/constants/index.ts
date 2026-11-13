// 常量总出口：`@loredoku/shared` 里所有 `*_*` 名字都从这里出去。
// 拆成十个文件之后，谁读谁仍然只有一个入口 —— 调用方一行都不用改。
export * from './grid';
export * from './highlight';
export * from './item';
export * from './region';
export * from './asset';
export * from './editor';
export * from './character';
export * from './map';
export * from './participant';
export * from './game';
export * from './ui';
