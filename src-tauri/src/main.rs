// Stand UP! — Tauri shell. All timer logic lives in the frontend (main window
// webview, which is hidden—never destroyed—on close). This shell owns the
// macOS surfaces the webview can't reach: tray icon, popover positioning,
// live Dock icon/badge, Dock bounce, notifications, launch-at-login.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine as _;
use tauri::{
    image::Image,
    menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, Rect, RunEvent, UserAttentionType, WebviewWindow,
    WindowEvent, Wry,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_notification::NotificationExt as _;
use tauri_plugin_updater::UpdaterExt as _;

const TRAY_ID: &str = "main-tray";
const TRAY_NORMAL: &[u8] = include_bytes!("../icons/tray-normal.png");
const TRAY_ALERT_LIGHT: &[u8] = include_bytes!("../icons/tray-alert-light.png");
const TRAY_ALERT_DARK: &[u8] = include_bytes!("../icons/tray-alert-dark.png");

#[derive(Default)]
struct PopoverState {
    tray_rect: Mutex<Option<Rect>>,
    hidden_at: Mutex<Option<Instant>>,
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

fn popover(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("popover")
}

fn focused_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.webview_windows()
        .into_values()
        .find(|w| w.is_focused().unwrap_or(false))
}

fn show_main(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// ---------- popover ----------

fn position_popover(app: &AppHandle) {
    let Some(pop) = popover(app) else { return };
    let Ok(size) = pop.outer_size() else { return };
    let scale = pop.scale_factor().unwrap_or(2.0);
    let margin = (8.0 * scale) as i32;

    let tray_rect = app.state::<PopoverState>().tray_rect.lock().unwrap().clone();
    let (x, y) = if let Some(rect) = tray_rect {
        let pos = rect.position.to_physical::<i32>(scale);
        let sz = rect.size.to_physical::<u32>(scale);
        (
            pos.x + sz.width as i32 / 2 - size.width as i32 / 2,
            pos.y + sz.height as i32 + margin / 2,
        )
    } else if let Ok(Some(mon)) = app.primary_monitor() {
        (
            mon.size().width as i32 - size.width as i32 - margin * 2,
            (38.0 * mon.scale_factor()) as i32,
        )
    } else {
        (100, 100)
    };

    // keep it on screen horizontally
    let x = if let Ok(Some(mon)) = app.primary_monitor() {
        x.clamp(margin, (mon.size().width as i32 - size.width as i32 - margin).max(margin))
    } else {
        x
    };

    let _ = pop.set_position(PhysicalPosition::new(x, y));
}

fn open_popover(app: &AppHandle) {
    position_popover(app);
    if let Some(pop) = popover(app) {
        let _ = pop.show();
        let _ = pop.set_focus();
    }
}

fn toggle_popover(app: &AppHandle) {
    let Some(pop) = popover(app) else { return };
    let visible = pop.is_visible().unwrap_or(false);
    // clicking the tray while the popover is open first blurs (and hides) it,
    // then delivers the click — treat a just-hidden popover as "close" intent
    let just_hidden = app
        .state::<PopoverState>()
        .hidden_at
        .lock()
        .unwrap()
        .map(|t| t.elapsed().as_millis() < 350)
        .unwrap_or(false);
    if visible {
        let _ = pop.hide();
    } else if !just_hidden {
        open_popover(app);
    }
}

// ---------- commands ----------

#[tauri::command]
fn show_popover(app: AppHandle) {
    open_popover(&app);
}

#[tauri::command]
fn hide_popover(app: AppHandle) {
    if let Some(pop) = popover(&app) {
        let _ = pop.hide();
    }
}

#[tauri::command]
fn request_attention(app: AppHandle) {
    // on macOS this bounces the Dock icon (critical = until the user reacts)
    if let Some(w) = main_window(&app) {
        let _ = w.request_user_attention(Some(UserAttentionType::Critical));
    }
}

#[tauri::command]
fn notify(app: AppHandle, title: String, body: String) {
    #[cfg(debug_assertions)]
    eprintln!("[standup] notify: {title}");
    let r = app.notification().builder().title(title).body(body).show();
    #[cfg(debug_assertions)]
    if let Err(e) = &r {
        eprintln!("[standup] notify error: {e}");
    }
    let _ = r;
}

#[tauri::command]
fn set_tray_alert(app: AppHandle, alert: bool, dark: bool) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    if alert {
        let bytes = if dark { TRAY_ALERT_DARK } else { TRAY_ALERT_LIGHT };
        if let Ok(img) = Image::from_bytes(bytes) {
            let _ = tray.set_icon(Some(img));
            let _ = tray.set_icon_as_template(false); // keep the red badge red
        }
    } else if let Ok(img) = Image::from_bytes(TRAY_NORMAL) {
        let _ = tray.set_icon(Some(img));
        let _ = tray.set_icon_as_template(true);
    }
}

#[tauri::command]
fn set_dock_icon(app: AppHandle, png: String) {
    #[cfg(target_os = "macos")]
    {
        let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(png) else {
            return;
        };
        #[cfg(debug_assertions)]
        eprintln!("[standup] dock icon update ({} bytes)", bytes.len());
        let _ = app.run_on_main_thread(move || {
            use objc2::{AnyThread as _, MainThreadMarker};
            use objc2_app_kit::{NSApplication, NSImage};
            use objc2_foundation::NSData;
            let Some(mtm) = MainThreadMarker::new() else { return };
            let ns_app = NSApplication::sharedApplication(mtm);
            let data = NSData::with_bytes(&bytes);
            if let Some(img) = NSImage::initWithData(NSImage::alloc(), &data) {
                unsafe { ns_app.setApplicationIconImage(Some(&img)) };
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, png);
}

#[tauri::command]
fn set_dock_badge(app: AppHandle, label: Option<String>) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(move || {
            use objc2::MainThreadMarker;
            use objc2_app_kit::NSApplication;
            use objc2_foundation::NSString;
            let Some(mtm) = MainThreadMarker::new() else { return };
            let ns_app = NSApplication::sharedApplication(mtm);
            let tile = ns_app.dockTile();
            let s = label.map(|l| NSString::from_str(&l));
            tile.setBadgeLabel(s.as_deref());
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, label);
}

#[tauri::command]
fn get_autostart(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) {
    let launcher = app.autolaunch();
    let _ = if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    };
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

// ---------- updater ----------
// No backend: the app polls a static `latest.json` on GitHub Releases, verifies
// the minisign signature against the pubkey baked into tauri.conf.json, and
// swaps the .app bundle in place.

fn spawn_update_check(app: &AppHandle, interactive: bool) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = check_and_install_update(&app, interactive).await;
        if let Err(e) = result {
            #[cfg(debug_assertions)]
            eprintln!("[standup] update check failed: {e}");
            let _ = e;
            if interactive {
                let _ = app
                    .notification()
                    .builder()
                    .title("Stand UP!")
                    .body("Could not check for updates. Please try again later.")
                    .show();
            }
        }
    });
}

async fn check_and_install_update(
    app: &AppHandle,
    interactive: bool,
) -> tauri_plugin_updater::Result<()> {
    let updater = app.updater()?;
    match updater.check().await? {
        Some(update) => {
            let version = update.version.clone();
            update.download_and_install(|_, _| {}, || {}).await?;
            if interactive {
                // the user asked for the update — apply it right away
                app.restart();
            } else {
                let _ = app
                    .notification()
                    .builder()
                    .title("Stand UP! updated")
                    .body(format!(
                        "Version {version} was downloaded and will be used the next time the app starts."
                    ))
                    .show();
            }
        }
        None if interactive => {
            let _ = app
                .notification()
                .builder()
                .title("Stand UP!")
                .body("You're on the latest version.")
                .show();
        }
        None => {}
    }
    Ok(())
}

// ---------- setup ----------

// Explicit app menu. The windows are undecorated (`decorations: false`), so the
// standard Close/Minimize items — which go through `performClose:` /
// `performMiniaturize:` — silently fail on them. Custom items with the same
// accelerators route Cmd+W / Cmd+M (and Cmd+Q) through our own handlers.
fn build_app_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let app_menu = SubmenuBuilder::new(app, "Stand UP!")
        .about(None)
        .separator()
        .item(&MenuItemBuilder::with_id("check-updates", "Check for Updates…").build(app)?)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(
            &MenuItemBuilder::with_id("app-quit", "Quit Stand UP!")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?,
        )
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(
            &MenuItemBuilder::with_id("app-minimize", "Minimize")
                .accelerator("CmdOrCtrl+M")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("app-close", "Close Window")
                .accelerator("CmdOrCtrl+W")
                .build(app)?,
        )
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&edit_menu)
        .item(&window_menu)
        .build()
}

fn on_app_menu_event(app: &AppHandle, id: &str) {
    match id {
        "app-quit" => app.exit(0),
        // closing means hiding: the app lives on in the Dock + menu bar
        "app-close" => {
            if let Some(w) = focused_window(app).or_else(|| main_window(app)) {
                let _ = w.hide();
            }
        }
        "app-minimize" => match focused_window(app) {
            Some(w) if w.label() == "popover" => {
                let _ = w.hide();
            }
            Some(w) => {
                let _ = w.minimize();
            }
            None => {
                if let Some(w) = main_window(app) {
                    let _ = w.minimize();
                }
            }
        },
        "check-updates" => spawn_update_check(app, true),
        _ => {}
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id("open", "Open Stand UP!").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("quit", "Quit Stand UP!").build(app)?)
        .build()?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(TRAY_NORMAL)?)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                let app = tray.app_handle();
                *app.state::<PopoverState>().tray_rect.lock().unwrap() = Some(rect);
                toggle_popover(app);
            }
        })
        .build(app)?;

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PopoverState::default())
        .invoke_handler(tauri::generate_handler![
            show_popover,
            hide_popover,
            request_attention,
            notify,
            set_tray_alert,
            set_dock_icon,
            set_dock_badge,
            get_autostart,
            set_autostart,
            quit_app,
        ])
        .menu(build_app_menu)
        .on_menu_event(|app, event| on_app_menu_event(app, event.id().as_ref()))
        .setup(|app| {
            build_tray(app.handle())?;

            // silent update check shortly after launch, then once a day
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(20));
                spawn_update_check(&handle, false);
                std::thread::sleep(Duration::from_secs(24 * 60 * 60));
            });

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // closing the main window hides it; the app stays in Dock + menu bar
            WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) if window.label() == "popover" => {
                let _ = window.hide();
                *window
                    .app_handle()
                    .state::<PopoverState>()
                    .hidden_at
                    .lock()
                    .unwrap() = Some(Instant::now());
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while building Stand UP!")
        .run(|app, event| {
            // Dock icon click with no visible window → bring the main window back
            if let RunEvent::Reopen { .. } = event {
                show_main(app);
            }
        });
}
