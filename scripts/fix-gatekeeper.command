#!/usr/bin/env bash
#
# 一键解除 Stand UP! 的 macOS 隔离标记（Gatekeeper quarantine）。
# 双击本文件即可运行——适合不想开终端的用户。
#
# 原理：本 App 未经 Apple 公证，浏览器下载后会被打上 com.apple.quarantine，
# 在 Apple 芯片上会被误报为「已损坏」。清掉这个标记即可正常打开。
#
set -euo pipefail

APP="/Applications/Stand UP.app"

if [[ ! -d "$APP" ]]; then
  echo "没找到 $APP"
  echo "请先把「Stand UP.app」拖进「应用程序」文件夹，再双击本文件。"
  read -r -p "按回车键关闭…" _
  exit 1
fi

echo "正在解除隔离标记：$APP"
xattr -cr "$APP"
codesign --force --deep --sign - "$APP" 2>/dev/null || true

echo ""
echo "✅ 完成！现在可以正常打开 Stand UP! 了。"
read -r -p "按回车键关闭…" _
