// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::Path;
use tauri::Manager;

mod icon;
mod hotkey;
mod tray;
mod uwp;
mod window_utils;
mod paths;
mod storage;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn spawn_app(path: String, args: Vec<String>) -> Result<(), String> {
    let resolved_path = paths::resolve_launch_path(&path);
    if args.is_empty() {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(resolved_path)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::process::Command::new(resolved_path)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
    } else {
        std::process::Command::new(resolved_path)
            .args(args)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn open_app_folder(path: String) -> Result<(), String> {
    let mut raw = path.trim().to_string();
    if raw.starts_with('\"') && raw.ends_with('\"') && raw.len() >= 2 {
        raw = raw[1..raw.len() - 1].to_string();
    }
    if raw.starts_with('\'') && raw.ends_with('\'') && raw.len() >= 2 {
        raw = raw[1..raw.len() - 1].to_string();
    }
    if raw.trim().is_empty() {
        return Err("path is empty".to_string());
    }
    if paths::is_special_path(&raw) {
        return Err("path has no folder".to_string());
    }
    let resolved = paths::resolve_launch_path(&raw);
    let p = Path::new(&resolved);
    if p.exists() && p.is_dir() {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(resolved)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::process::Command::new(resolved)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    if p.exists() {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg("/select,")
                .arg(p.to_string_lossy().to_string())
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
        #[cfg(not(target_os = "windows"))]
        {
            let parent = p.parent().unwrap_or(p);
            std::process::Command::new(parent.to_string_lossy().to_string())
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    if let Some(parent) = p.parent() {
        #[cfg(target_os = "windows")]
        {
            let arg = parent.to_string_lossy().to_string();
            std::process::Command::new("explorer")
                .arg(arg)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::process::Command::new(parent.to_string_lossy().to_string())
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    Err("parent folder not found".to_string())
}

#[tauri::command]
fn set_toggle_hotkey(
    app: tauri::AppHandle,
    hotkey_state: tauri::State<'_, hotkey::HotkeyState>,
    hotkey: String,
) -> Result<(), String> {
    hotkey::apply_hotkey(&app, &hotkey_state, hotkey)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            {
                tray::setup_tray(&app.handle())?;
                app.manage(hotkey::HotkeyState(std::sync::Mutex::new(None)));
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(|app, _shortcut, event| {
                            hotkey::handle_shortcut_event(app, event.state);
                        })
                        .build(),
                )?;

                let saved = storage::load_saved_hotkey(&app.handle());
                if let Some(state) = app.try_state::<hotkey::HotkeyState>() {
                    hotkey::init_from_saved_hotkey(&app.handle(), &state, saved);
                }
            }
            if storage::should_hide_on_startup(&app.handle()) {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![
            greet,
            spawn_app,
            uwp::list_uwp_apps,
            uwp::spawn_uwp_app,
            icon::get_file_icon,
            set_toggle_hotkey,
            paths::make_relative_path,
            open_app_folder,
            storage::load_launcher_state,
            storage::save_launcher_state,
            paths::validate_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
