#!/usr/bin/env bash
#
# 构建并 ad-hoc 签名 Stand UP! 的发布产物（.app / .dmg）。
#
# 背景：本项目没有 Apple 付费开发者账号，无法做正式签名 + 公证（notarization）。
# 但只要在打包阶段做一次「正确的 ad-hoc 签名」（codesign --deep），
# 就能把「已损坏，无法打开（damaged）」这种无法绕过的报错，
# 降级成可以绕过的「无法验证开发者 / 来自身份不明的开发者」——
# 用户右键「打开」或在「系统设置 › 隐私与安全性」里点「仍要打开」即可。
#
# 关键：Tauri 只有在 tauri.conf.json 里设置了 bundle.macOS.signingIdentity 时
# 才会调用 codesign；本仓库已设为 "-"（ad-hoc）。本脚本额外做一遍校验兜底。
#
# 用法：  ./scripts/build_release.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/src-tauri"

echo "==> cargo tauri build"
cargo tauri build

BUNDLE="$ROOT/src-tauri/target/release/bundle"
APP="$(/usr/bin/find "$BUNDLE/macos" -maxdepth 1 -name '*.app' | head -n1)"
DMG="$(/usr/bin/find "$BUNDLE/dmg"   -maxdepth 1 -name '*.dmg' | head -n1)"

if [[ -z "${APP:-}" ]]; then
  echo "!! 没找到 .app，构建可能失败" >&2
  exit 1
fi

echo "==> 兜底：清掉扩展属性并重新 ad-hoc 深度签名"
xattr -cr "$APP"
codesign --force --deep --sign - "$APP"

echo "==> 校验签名"
codesign --verify --deep --strict --verbose=2 "$APP"

echo ""
echo "✅ 构建完成"
echo "   .app : $APP"
[[ -n "${DMG:-}" ]] && echo "   .dmg : $DMG"
echo ""
echo "提醒：用户从浏览器下载后，系统仍会打上 quarantine 隔离标记。"
echo "     首次打开请右键「打开」，或在终端执行："
echo "       xattr -cr \"/Applications/Stand UP.app\""
