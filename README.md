# Stand UP!

一个轻量的 macOS 久坐/喝水提醒工具：常驻 Dock 与菜单栏，用两个进度环倒计时——到点提醒你站一站、喝口水。

UI 按 `design_handoff_standup/` 中的高保真设计稿 1:1 实现。

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

提醒生命周期：`坐（倒计时）→ 到点（红环 + Start/Skip）→ 站（暖色环倒计时）→ 完成（Next）→ 回到坐`；喝水为独立循环 `倒计时 → 到点（Done/Skip）→ 重新计时`。

## 开发

```bash
# 依赖：Rust（rustup）+ cargo tauri（cargo install tauri-cli）
cd src-tauri
cargo tauri dev        # 开发运行
cargo tauri build      # 产出 .app / .dmg（target/release/bundle/）
```

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
