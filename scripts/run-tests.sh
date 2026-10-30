#!/usr/bin/env bash
# 跑一个包的测试。真正的逻辑在 scripts/run-tests.mjs：
#
#   1. 一次收集（~12 秒），而不是每个文件起一次 Node（87 个文件 2 分半）；
#   2. 跑完拿报告对着磁盘列表核对，真被环境漏收的那几个（EPERM 偶发）再补跑；
#   3. 一次收集都起不来时，整包退回逐文件。
#
# 用法：
#   bash scripts/run-tests.sh packages/web
#   bash scripts/run-tests.sh packages/shared --serial   # 强制逐文件
#
# server 在这个脚本里默认就是串行：它所有用例共用一个测试库，并行收集会偶发撞车。
set -u

PKG_DIR="${1:-}"
if [ -z "$PKG_DIR" ]; then
  echo "用法: scripts/run-tests.sh packages/<pkg> [--serial]"
  exit 2
fi

cd "$(dirname "$0")/.." || exit 1
exec node scripts/run-tests.mjs "$PKG_DIR" "${2:-}"
