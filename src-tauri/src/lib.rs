//! Random Sober Life — Windows shell. The UI (ui/) holds all journey logic; Rust stores the state file,
//! makes HTTP calls for the UI (relay sync), and shows the daily summary notification from the tray.
mod notify;

use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

pub(crate) fn data_dir(app: &AppHandle) -> PathBuf {
    let d = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("RandomSoberLife"));
    let _ = std::fs::create_dir_all(&d);
    d
}

pub(crate) fn write_atomic(p: &PathBuf, data: &str) -> Result<(), String> {
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, data).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, p).map_err(|e| e.to_string())
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn load_state(app: AppHandle) -> Option<String> {
    std::fs::read_to_string(data_dir(&app).join("state.json")).ok()
}

#[tauri::command]
fn save_state(app: AppHandle, data: String) -> Result<(), String> {
    write_atomic(&data_dir(&app).join("state.json"), &data)
}

#[tauri::command]
async fn http_req(method: String, url: String, body: String) -> Value {
    tauri::async_runtime::spawn_blocking(move || {
        if !(url.starts_with("https://ntfy.sh/")) {
            return json!({"status": 0, "body": "blocked url"});
        }
        let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(25)).build();
        let req = agent
            .request(&method, &url)
            .set("User-Agent", concat!("windows:com.randomseasons.randomsoberlife:", env!("CARGO_PKG_VERSION"), " (sobriety counter)"));
        let res = if body.is_empty() { req.call() } else { req.send_string(&body) };
        match res {
            Ok(r) => {
                let s = r.status();
                json!({"status": s, "body": r.into_string().unwrap_or_default()})
            }
            Err(ureq::Error::Status(s, r)) => json!({"status": s, "body": r.into_string().unwrap_or_default()}),
            Err(e) => json!({"status": 0, "body": e.to_string()}),
        }
    })
    .await
    .unwrap_or_else(|e| json!({"status": 0, "body": e.to_string()}))
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("only https links".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_notify(app: AppHandle, cfg: String) {
    notify::set_config(&app, &cfg);
}

/// Automatic backup: Documents\Random Sober Life\Random Sober Life backup.json (outside the app data, survives a reinstall)
fn auto_backup_path(app: &AppHandle) -> Option<PathBuf> {
    let d = app.path().document_dir().ok()?.join("Random Sober Life");
    std::fs::create_dir_all(&d).ok()?;
    Some(d.join("Random Sober Life backup.json"))
}

#[tauri::command]
fn backup_auto(app: AppHandle, data: String) -> Result<(), String> {
    let p = auto_backup_path(&app).ok_or("no Documents folder")?;
    write_atomic(&p, &data)
}

#[tauri::command]
fn backup_find(app: AppHandle) -> Option<String> {
    std::fs::read_to_string(auto_backup_path(&app)?).ok()
}

#[tauri::command]
async fn backup_save(app: AppHandle, data: String, name: String) -> String {
    let mut dlg = app.dialog().file().set_file_name(&name).add_filter("Random Sober Life backup", &["json"]);
    if let Some(d) = auto_backup_path(&app).and_then(|p| p.parent().map(|x| x.to_path_buf())) {
        dlg = dlg.set_directory(d);
    }
    match dlg.blocking_save_file().and_then(|f| f.into_path().ok()) {
        Some(p) => match write_atomic(&p, &data) {
            Ok(()) => "ok".into(),
            Err(e) => format!("Could not save: {e}"),
        },
        None => "cancel".into(),
    }
}

#[tauri::command]
async fn backup_open(app: AppHandle) -> Option<String> {
    let mut dlg = app.dialog().file().add_filter("Random Sober Life backup", &["json"]);
    if let Some(d) = auto_backup_path(&app).and_then(|p| p.parent().map(|x| x.to_path_buf())) {
        dlg = dlg.set_directory(d);
    }
    let p = dlg.blocking_pick_file()?.into_path().ok()?;
    std::fs::read_to_string(p).ok()
}

#[tauri::command]
fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
fn get_autostart(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_autostart(app: AppHandle, on: bool) {
    let _ = if on { app.autolaunch().enable() } else { app.autolaunch().disable() };
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let h = app.handle().clone();
            // start with Windows once by default (the daily summary needs the tray app); the user can turn it off
            let flag = data_dir(&h).join("autostart.init");
            if !flag.exists() {
                let _ = h.autolaunch().enable();
                let _ = std::fs::write(&flag, "1");
            }
            let ver = app.package_info().version.to_string();
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_title(&format!("Random Sober Life {ver}"));
            }
            let open = MenuItem::with_id(app, "open", "Open Random Sober Life", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(format!("Random Sober Life {ver}"))
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            notify::start(h.clone());
            if !std::env::args().any(|a| a == "--minimized") {
                show_main(&h);
            }
            Ok(())
        })
        .on_window_event(|w, e| {
            // closing the window keeps the app in the tray (for sync + the daily summary)
            if let (WindowEvent::CloseRequested { api, .. }, "main") = (e, w.label()) {
                api.prevent_close();
                let _ = w.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_state, save_state, http_req, open_url, set_notify, app_version, get_autostart, set_autostart,
            backup_auto, backup_find, backup_save, backup_open
        ])
        .run(tauri::generate_context!())
        .expect("error while running Random Sober Life");
}
