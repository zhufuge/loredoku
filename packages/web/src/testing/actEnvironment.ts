// React 18 起，`act()` 只有在显式开启 act 环境后才生效；
// 本仓库的组件测试都是手写 createRoot + act（未用 testing-library），
// 不设这个标志就会在每次更新时刷 "not configured to support act" 警告。
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export {}
