#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
choice="${1:-}"
if [ -z "$choice" ]; then
  echo '华伴本地演示：1 启动  2 关闭  3 恢复初始数据'
  read -r -p '请选择（回车启动）：' choice
  case "$choice" in
    2) choice=stop ;;
    3) choice=reset ;;
    *) choice=start ;;
  esac
fi
runtime=""
for candidate in "$PWD/.local/node24/bin/node" "$HOME/.nvm/versions/node/v24.22.1/bin/node" "$(command -v node)"; do
  if [ -x "$candidate" ] && [ "$("$candidate" --version)" = 'v24.22.1' ]; then
    runtime="$candidate"
    break
  fi
done
if [ -z "$runtime" ]; then
  echo '请先安装 Node 24.22.1：nvm install 24.22.1。详情见 docs/local-testing-guide.md。'
  read -r -p '按回车关闭。'
  exit 1
fi
export PATH="$(dirname -- "$runtime"):$PATH"
"$runtime" scripts/demo.mjs "$choice" "${@:2}"
result=$?
if [ -z "${1:-}" ]; then read -r -p '按回车关闭窗口，演示网站会继续运行。'; fi
exit "$result"
