#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if [ "$#" -eq 0 ]; then
  bash 华伴演示.command start
  result=$?
  read -r -p '按回车关闭窗口；网站继续运行。'
  exit "$result"
fi
exec bash 华伴演示.command "$@"
