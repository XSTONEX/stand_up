# Stand UP!

一个轻量的 macOS 久坐/喝水提醒工具：常驻 Dock 与菜单栏，用两个进度环倒计时——到点提醒你站一站、喝口水。

原生 HTML / CSS / JS + [Tauri 2](https://tauri.app)（Rust）实现，零框架零依赖，安装包只有几 MB。

## 安装

> ⚠️ 本 App 未经 Apple 公证，从浏览器下载后首次打开可能提示 **「已损坏，无法打开」**——不是文件坏了，解除隔离标记即可。

1. 把 **Stand UP.app** 拖进「应用程序」文件夹；
2. 解除隔离，任选其一：
   - 终端执行：`xattr -cr "/Applications/Stand UP.app"`
   - 或双击随包附带的 `fix-gatekeeper.command`。

之后正常双击打开即可。

## 使用

- **主窗口 / 菜单栏 popover**：两个进度环分别是坐/站与喝水倒计时，到点变红并出现 Start/Skip、Done/Skip 按钮；环上的滑块可以拖动，直接调整当前剩余时间。
- **Reminders 设置**：坐 / 站 / 喝水时长可步进调整或点击数值直接输入，另有开机自启开关。
- **到点提醒**：Dock 图标变红弹跳 + 红色 “!” 徽标、菜单栏 popover 自动弹出、通知中心横幅。
- **快捷键**：`⌘W` 隐藏窗口、`⌘M` 最小化、`⌘Q` 退出、`Esc` 收起 popover。
- **自动更新**：后台定期静默检查 GitHub Releases，有新版自动下载安装；也可在应用菜单 **Check for Updates…** 手动检查。
