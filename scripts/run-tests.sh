#!/usr/bin/env bash
# 逐文件跑测试：vitest 在本环境下一次收集多个测试文件时会因为临时目录写入被拒
# （EPERM）而静默漏收，所以按文件分别调用，最后汇总失败清单。
set -u

PKG_DIR="$1"
cd "$PKG_DIR" || exit 1

FILES=$(find . -path ./node_modules -prune -o \( -name '*.test.ts' -o -name '*.test.tsx' \) -print | sort)

pass=0
total=0
fail=0
failed_files=""

for file in $FILES; do
  if ../../node_modules/.bin/vitest.cmd run "$file" --no-cache >/tmp/vt.log 2>&1; then
    count=$(sed -r 's/\x1b\[[0-9;]*m//g' /tmp/vt.log | grep -E "^ *Tests +" | tail -1 | grep -oE "[0-9]+" | head -1)
    echo "PASS  ${count:-?}	$file"
    pass=$((pass + 1))
    total=$((total + ${count:-0}))
  else
    echo "FAIL  $file"
    fail=$((fail + 1))
    failed_files="$failed_files $file"
  fi
done

echo "-----------------------------------------"
echo "files: $((pass + fail))  passed: $pass  failed: $fail  tests: $total"
if [ "$fail" -gt 0 ]; then
  echo "failed:$failed_files"
  exit 1
fi
