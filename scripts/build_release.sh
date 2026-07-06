#!/usr/bin/env bash
#
# 构建并 ad-hoc 签名 Stand UP! 的发布产物（.app / .dmg / 更新包），
# 生成自动更新用的 latest.json；加 --publish 直接发布到 GitHub Releases。
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
# 自动更新（无后端）：
#   bundle.createUpdaterArtifacts 会让 Tauri 额外产出 <App>.app.tar.gz + .sig
#   （minisign 签名，私钥在 ~/.tauri/standup_updater.key，务必备份，丢了老版本
#   就再也收不到更新）。本脚本把它们和 latest.json 一起整理到 bundle/updater/，
#   应用内的 updater 轮询 GitHub Releases 上的 latest.json 即可完成更新，
#   全程不需要任何后端。应用自己下载的更新包没有 quarantine 标记，
#   所以更新安装的新版本不会再被 Gatekeeper 拦。
#
# 用法：  ./scripts/build_release.sh             # 只构建
#         ./scripts/build_release.sh --publish   # 构建并发布 GitHub Release
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/src-tauri"

PUBLISH=0
[[ "${1:-}" == "--publish" ]] && PUBLISH=1

REPO="XSTONEX/stand_up"
UPDATER_KEY="$HOME/.tauri/standup_updater.key"

if [[ ! -f "$UPDATER_KEY" ]]; then
  echo "!! 找不到更新签名私钥 $UPDATER_KEY" >&2
  echo "   用 cargo tauri signer generate -w ~/.tauri/standup_updater.key 生成" >&2
  exit 1
fi
# 注意：bundler 只认 TAURI_SIGNING_PRIVATE_KEY（值可以是路径或密钥内容），
# TAURI_SIGNING_PRIVATE_KEY_PATH 只有 `tauri signer sign` 子命令认
export TAURI_SIGNING_PRIVATE_KEY="$UPDATER_KEY"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' tauri.conf.json | head -1)"
case "$(uname -m)" in
  arm64)  ARCH="aarch64" ;;
  x86_64) ARCH="x86_64" ;;
  *) echo "!! 未知架构 $(uname -m)" >&2; exit 1 ;;
esac

echo "==> cargo tauri build (v$VERSION, $ARCH)"
cargo tauri build

BUNDLE="$ROOT/src-tauri/target/release/bundle"
APP="$(/usr/bin/find "$BUNDLE/macos" -maxdepth 1 -name '*.app' | head -n1)"
DMG="$(/usr/bin/find "$BUNDLE/dmg"   -maxdepth 1 -name '*.dmg' | head -n1)"
TARBALL="$(/usr/bin/find "$BUNDLE/macos" -maxdepth 1 -name '*.app.tar.gz' | head -n1)"

if [[ -z "${APP:-}" ]]; then
  echo "!! 没找到 .app，构建可能失败" >&2
  exit 1
fi
if [[ -z "${TARBALL:-}" || ! -f "$TARBALL.sig" ]]; then
  echo "!! 没找到更新包（.app.tar.gz / .sig），检查 bundle.createUpdaterArtifacts" >&2
  exit 1
fi

echo "==> 兜底：清掉扩展属性并重新 ad-hoc 深度签名"
xattr -cr "$APP"
codesign --force --deep --sign - "$APP"

echo "==> 校验签名"
codesign --verify --deep --strict --verbose=2 "$APP"

echo "==> 生成更新产物 latest.json"
UPDATER_DIR="$BUNDLE/updater"
rm -rf "$UPDATER_DIR"
mkdir -p "$UPDATER_DIR"
# GitHub 会把资源文件名里的空格替换成点，干脆自己用无空格文件名
TAR_NAME="StandUP_${VERSION}_${ARCH}.app.tar.gz"
cp "$TARBALL" "$UPDATER_DIR/$TAR_NAME"
SIG="$(cat "$TARBALL.sig")"
PUB_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$UPDATER_DIR/latest.json" <<EOF
{
  "version": "$VERSION",
  "pub_date": "$PUB_DATE",
  "platforms": {
    "darwin-$ARCH": {
      "signature": "$SIG",
      "url": "https://github.com/$REPO/releases/download/v$VERSION/$TAR_NAME"
    }
  }
}
EOF

echo ""
echo "✅ 构建完成"
echo "   .app    : $APP"
[[ -n "${DMG:-}" ]] && echo "   .dmg    : $DMG"
echo "   更新包  : $UPDATER_DIR/$TAR_NAME"
echo "   清单    : $UPDATER_DIR/latest.json"

if [[ "$PUBLISH" == "1" ]]; then
  echo ""
  echo "==> 发布 GitHub Release v$VERSION"
  ASSETS=("$UPDATER_DIR/$TAR_NAME" "$UPDATER_DIR/latest.json")
  [[ -n "${DMG:-}" ]] && ASSETS+=("$DMG")
  if gh release view "v$VERSION" --repo "$REPO" >/dev/null 2>&1; then
    gh release upload "v$VERSION" "${ASSETS[@]}" --repo "$REPO" --clobber
  else
    gh release create "v$VERSION" "${ASSETS[@]}" --repo "$REPO" \
      --title "Stand UP! v$VERSION" --generate-notes
  fi
  echo "✅ 已发布：https://github.com/$REPO/releases/tag/v$VERSION"
  echo "   老版本应用会在 24 小时内的静默检查里拉到这次更新。"
else
  echo ""
  echo "发布：./scripts/build_release.sh --publish"
  echo ""
  echo "提醒：用户从浏览器下载后，系统仍会打上 quarantine 隔离标记。"
  echo "     首次打开请右键「打开」，或在终端执行："
  echo "       xattr -cr \"/Applications/Stand UP.app\""
fi
