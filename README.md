# Stand UP!

一个轻量的 macOS 久坐/喝水提醒工具：常驻 Dock 与菜单栏，用两个进度环倒计时——到点提醒你站一站、喝口水。

UI 按 `design_handoff_standup/` 中的高保真设计稿 1:1 实现。

## 安装

> ⚠️ 本 App 未经 Apple 公证（项目没有付费开发者账号）。从浏览器下载后，macOS 会给它打上「隔离」标记，
> 在 Apple 芯片的 Mac 上首次打开可能提示 **“已损坏，无法打开”** 或 **“无法验证开发者”**——
> **不是文件坏了**，解除隔离即可。

1. 把 **Stand UP.app** 拖进「应用程序」文件夹；
2. 解除隔离标记，任选其一：
   - 终端执行（推荐，一步到位）：
     ```bash
     xattr -cr "/Applications/Stand UP.app"
     ```
   - 或双击随包附带的 **`fix-gatekeeper.command`**（本仓库 `scripts/` 下），自动完成上一步；
   - 或**右键点图标 → 打开**，在弹窗里再点一次「打开」（若弹窗只有「移到废纸篓」，说明系统版本较新，请用上面终端或 `.command` 方式）。

之后正常双击即可。想彻底免除这一步，需要 Apple 付费开发者账号做正式签名 + 公证（notarization）。

## 技术栈

- **前端**：原生 HTML / CSS / JavaScript（ES Modules），零框架、零打包器、零 npm 依赖
- **外壳**：[Tauri 2](https://tauri.app)（Rust），复用系统 WebView，安装包只有几 MB
- 字体 Lora（可变字重，已离线打包）；图形全部为内联 SVG / Canvas 矢量绘制

## 功能

| 表面 | 说明 |
|---|---|
| 主窗口 | 双进度环（坐/站 + 喝水）+ Reminders 设置（坐 45 min / 站 5 min / 水 30 min 步进器支持点击数值直接输入、开机自启开关），毛玻璃材质，跟随系统深浅色；环上有可拖动滑块，直接调整当前剩余时间（与计时引擎实时同步） |
| Dock 图标 | **实时重绘**：外环 = 坐姿倒计时，内环 = 喝水倒计时；到点时对应环变红、图标弹跳、出现红色 “!” 徽标 |
| 菜单栏 | 18pt 模板图标（自动适配深浅菜单栏）；到点换成实心字形 + 红点；点击弹出 popover |
| Popover | 与主窗口相同的双环 + 环内 Start/Skip、Done/Skip 操作按钮；**提醒到点自动弹出**，失焦自动收起 |
| 系统通知 | 到点同时发送通知中心横幅 |
| 快捷键 | `⌘W` 关闭（隐藏）窗口、`⌘M` 最小化、`⌘Q` 退出、`⌘H` 隐藏、`Esc` 收起 popover；应用菜单里还有 Edit（`⌘C/V/X/A/Z`，用于时长输入框）与 **Check for Updates…** |
| 自动更新 | 启动 20 秒后 + 每 24 小时静默检查 GitHub Releases，有新版自动下载安装（minisign 验签），下次启动生效并发通知；菜单 **Check for Updates…** 可手动检查并立即重启更新 |

提醒生命周期：`坐（倒计时）→ 到点（红环 + Start/Skip）→ 站（暖色环倒计时）→ 完成（Next）→ 回到坐`；喝水为独立循环 `倒计时 → 到点（Done/Skip）→ 重新计时`。

## 开发

```bash
# 依赖：Rust（rustup）+ cargo tauri（cargo install tauri-cli）
cd src-tauri
cargo tauri dev        # 开发运行
cargo tauri build      # 产出 .app / .dmg（target/release/bundle/）
```

发布构建用脚本一键完成（`cargo tauri build` + ad-hoc 深度签名 + 校验 + 更新包与 `latest.json` 生成），
产物会做正确的 `codesign` 封装，避免下载后在 Apple 芯片上被误报「已损坏」：

```bash
./scripts/build_release.sh            # 只构建
./scripts/build_release.sh --publish  # 构建并发布 GitHub Release（需 gh 已登录）
```

### 自动更新（无后端）

更新走 [tauri-plugin-updater](https://tauri.app/plugin/updater/) + **GitHub Releases 静态文件**，没有任何服务端：

1. 改版本号（`src-tauri/tauri.conf.json` 与 `src-tauri/Cargo.toml` 保持一致）；
2. `./scripts/build_release.sh --publish` —— 自动产出 `StandUP_<版本>_<架构>.app.tar.gz`（minisign 签名）
   和 `latest.json`，并上传到 `v<版本>` Release；
3. 已安装的老版本会在启动 20 秒后（以及此后每 24 小时）请求
   `https://github.com/XSTONEX/stand_up/releases/latest/download/latest.json`，
   发现新版本即在后台下载、验签、替换 `.app`，下次启动生效。

> 🔑 更新包用 `~/.tauri/standup_updater.key` 签名（公钥内置在 `tauri.conf.json`），**务必备份这个私钥**：
> 丢失后新版本无法通过老版本的验签，用户只能手动重装。
> 另外：应用自己下载的更新包不带 quarantine 标记，所以自动更新装上的新版本**不会**再被 Gatekeeper 拦截，
> 「已损坏」的绕过步骤只在首次手动安装时需要。

> 签名说明：`tauri.conf.json` 里 `bundle.macOS.signingIdentity` 设为 `"-"`（ad-hoc）。
> 没有这一项时 Tauri 根本不会调用 `codesign`，产出的包只带链接器的最小签名（`linker-signed`，未封装 Info.plist），
> 隔离后即被判定为「已损坏」。ad-hoc 签名把它降级成用户可绕过的「无法验证开发者」。

前端无构建步骤：`src/` 里的文件即最终产物，也可直接用任意静态服务器在浏览器里预览
（浏览器模式自动带设计稿的桌面背景框，支持 `?sit=alert&water=alert&sitPct=52` 等参数查看各状态）。

调试：给主窗口 URL 加 `?fast=1`（临时改 `src-tauri/tauri.conf.json` 中 main 窗口的 `url` 为 `index.html?fast=1`），
所有“分钟”按秒计，几十秒即可跑完整个提醒周期。

## 目录结构

```
src/                  纯前端（即 Tauri 的 frontendDist）
  index.html          主窗口
  popover.html        菜单栏 popover
  js/engine.js        计时状态机（仅运行于主窗口，事件同步到 popover）
  js/rings.js         双环组件（两窗口共用）
  js/water.js         水杯液面几何（从设计稿 renderVals() 原样移植）
  js/dockicon.js      Dock 图标 canvas 实时渲染
src-tauri/            Rust 外壳：托盘、popover 定位、Dock 图标/徽标/弹跳、通知、自启
scripts/gen_icons.swift  图标生成脚本（备用；本次由浏览器 canvas + QuickLook 生成）
design_handoff_standup/  设计稿（勿改）
```

## 关于“Dock 弹出提醒”

macOS 不允许任何 App 从 Dock 图标弹出自定义 UI（系统没有这个 API）。本项目用组合拳逼近这个效果：
Dock 图标本身变红 + 弹跳 + 红色徽标，同时菜单栏 popover 自动弹出、通知中心横幅提醒。
