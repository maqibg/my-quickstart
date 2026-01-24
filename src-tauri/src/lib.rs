// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::{Path, PathBuf}};
use tauri::Manager;

mod icon;
mod hotkey;
mod tray;
mod uwp;
mod window_utils;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn spawn_app(path: String, args: Vec<String>) -> Result<(), String> {
    let resolved_path = resolve_launch_path(&path);
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
    if is_special_path(&raw) {
        return Err("path has no folder".to_string());
    }
    let resolved = resolve_launch_path(&raw);
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

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LauncherState {
    version: u8,
    #[serde(rename = "activeGroupId")]
    active_group_id: String,
    groups: Vec<Group>,
    #[serde(default)]
    settings: UiSettings,
}

fn default_card_size() -> u32 {
    120
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UiSettings {
    #[serde(rename = "cardWidth", alias = "cardSize", default = "default_card_size")]
    card_width: u32,
    #[serde(rename = "cardHeight", default = "default_card_height")]
    card_height: u32,
    #[serde(rename = "toggleHotkey", default)]
    toggle_hotkey: String,
    #[serde(rename = "theme", default = "default_theme")]
    theme: String,
    #[serde(rename = "sidebarWidth", default = "default_sidebar_width")]
    sidebar_width: u32,
    #[serde(rename = "fontFamily", default = "default_font_family")]
    font_family: String,
    #[serde(rename = "fontSize", default = "default_font_size")]
    font_size: u32,
    #[serde(rename = "cardFontSize", default = "default_card_font_size")]
    card_font_size: u32,
    #[serde(rename = "cardIconScale", default = "default_card_icon_scale")]
    card_icon_scale: u32,
    #[serde(
        rename = "dblClickBlankToHide",
        default = "default_dbl_click_blank_to_hide"
    )]
    dbl_click_blank_to_hide: bool,
    #[serde(rename = "hideOnStartup", default = "default_hide_on_startup")]
    hide_on_startup: bool,
    #[serde(rename = "useRelativePath", default = "default_use_relative_path")]
    use_relative_path: bool,
}

fn default_card_height() -> u32 {
    96
}

fn default_theme() -> String {
    "dark".to_string()
}

fn default_sidebar_width() -> u32 {
    140
}

fn default_font_family() -> String {
    "maye".to_string()
}

fn default_font_size() -> u32 {
    13
}

fn default_card_font_size() -> u32 {
    11
}

fn default_card_icon_scale() -> u32 {
    56
}

fn default_dbl_click_blank_to_hide() -> bool {
    true
}

fn default_hide_on_startup() -> bool {
    false
}

fn default_use_relative_path() -> bool {
    false
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            card_width: default_card_size(),
            card_height: default_card_height(),
            toggle_hotkey: String::new(),
            theme: default_theme(),
            sidebar_width: default_sidebar_width(),
            font_family: default_font_family(),
            font_size: default_font_size(),
            card_font_size: default_card_font_size(),
            card_icon_scale: default_card_icon_scale(),
            dbl_click_blank_to_hide: default_dbl_click_blank_to_hide(),
            hide_on_startup: default_hide_on_startup(),
            use_relative_path: default_use_relative_path(),
        }
    }
}

fn is_special_path(path: &str) -> bool {
    let lower = path.trim().to_ascii_lowercase();
    lower.starts_with("shell:") || lower.starts_with("uwp:")
}

fn app_base_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
}

fn make_relative_path_inner(path: &Path, base: &Path) -> Option<PathBuf> {
    let path_components: Vec<_> = path.components().collect();
    let base_components: Vec<_> = base.components().collect();
    if path_components.is_empty() || base_components.is_empty() {
        return None;
    }
    if let (Some(std::path::Component::Prefix(p1)), Some(std::path::Component::Prefix(p2))) =
        (path_components.first(), base_components.first())
    {
        if p1.kind() != p2.kind() {
            return None;
        }
    }

    let mut idx = 0usize;
    while idx < path_components.len()
        && idx < base_components.len()
        && path_components[idx] == base_components[idx]
    {
        idx += 1;
    }

    let mut rel = PathBuf::new();
    for _ in idx..base_components.len() {
        rel.push("..");
    }
    for comp in &path_components[idx..] {
        rel.push(comp.as_os_str());
    }
    if rel.as_os_str().is_empty() {
        rel.push(".");
    }
    Some(rel)
}

fn resolve_launch_path(path: &str) -> String {
    if path.trim().is_empty() || is_special_path(path) {
        return path.to_string();
    }
    let p = Path::new(path);
    if p.is_absolute() {
        return path.to_string();
    }
    if let Some(base) = app_base_dir() {
        return base.join(p).to_string_lossy().to_string();
    }
    path.to_string()
}

#[tauri::command]
fn make_relative_path(path: String) -> Result<String, String> {
    if path.trim().is_empty() || is_special_path(&path) {
        return Ok(path);
    }
    let base = app_base_dir().ok_or_else(|| "base dir not found".to_string())?;
    let p = Path::new(&path);
    if !p.is_absolute() {
        return Ok(path);
    }
    let rel = make_relative_path_inner(p, &base).unwrap_or_else(|| p.to_path_buf());
    Ok(rel.to_string_lossy().to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Group {
    id: String,
    name: String,
    apps: Vec<AppEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppEntry {
    id: String,
    name: String,
    path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    args: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
    #[serde(rename = "addedAt")]
    added_at: i64,
}

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base_dir = app.path().local_data_dir().map_err(|e| e.to_string())?;
    Ok(base_dir.join("my-quickstart").join("launcher.db"))
}

fn legacy_db_paths(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(p) = app.path().app_local_data_dir() {
        paths.push(p.join("launcher.db"));
    }
    if let Ok(p) = app.path().app_data_dir() {
        paths.push(p.join("launcher.db"));
    }
    paths
}

fn count_groups_in_existing_db(path: &PathBuf) -> i64 {
    use rusqlite::OpenFlags;
    if !path.exists() {
        return 0;
    }
    let conn = match Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) {
        Ok(c) => c,
        Err(_) => return 0,
    };
    conn.query_row("SELECT COUNT(1) FROM groups", [], |r| r.get(0))
        .unwrap_or(0)
}

fn migrate_legacy_db_if_needed(app: &tauri::AppHandle, new_path: &PathBuf) -> Result<(), String> {
    let new_groups = count_groups_in_existing_db(new_path);
    let need_migration = !new_path.exists() || new_groups == 0;
    if !need_migration {
        return Ok(());
    }

    let legacy_paths = legacy_db_paths(app);
    let legacy_path = legacy_paths
        .into_iter()
        .find(|p| count_groups_in_existing_db(p) > 0);
    let Some(legacy_path) = legacy_path else {
        return Ok(());
    };

    if let Some(parent) = new_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(&legacy_path, new_path).map_err(|e| e.to_string())?;
    Ok(())
}

fn open_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    migrate_legacy_db_if_needed(app, &path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    conn.execute_batch(
        r#"
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  args TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
);
"#,
    )
    .map_err(|e| e.to_string())?;

    let has_icon: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM pragma_table_info('apps') WHERE name = 'icon'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_icon == 0 {
        let _ = conn.execute(
            "ALTER TABLE apps ADD COLUMN icon TEXT NOT NULL DEFAULT ''",
            [],
        );
    }
    Ok(conn)
}

#[tauri::command]
fn load_launcher_state(app: tauri::AppHandle) -> Result<Option<LauncherState>, String> {
    let conn = open_db(&app)?;

    let has_any: i64 = conn
        .query_row("SELECT COUNT(1) FROM groups", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if has_any == 0 {
        return Ok(None);
    }

    let active_group_id: String = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'active_group_id' LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| String::new());

    let mut groups_stmt = conn
        .prepare("SELECT id, name FROM groups ORDER BY position ASC")
        .map_err(|e| e.to_string())?;
    let group_rows = groups_stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let mut groups: Vec<Group> = Vec::new();
    for row in group_rows {
        let (id, name) = row.map_err(|e| e.to_string())?;
        groups.push(Group {
            id,
            name,
            apps: Vec::new(),
        });
    }

    let mut apps_stmt = conn
        .prepare(
            "SELECT id, group_id, name, path, args, icon, added_at FROM apps ORDER BY position ASC",
        )
        .map_err(|e| e.to_string())?;
    let app_rows = apps_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, i64>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut apps_by_group: HashMap<String, Vec<AppEntry>> = HashMap::new();
    for row in app_rows {
        let (id, group_id, name, path, args, icon, added_at) = row.map_err(|e| e.to_string())?;
        let args_opt = if args.trim().is_empty() {
            None
        } else {
            Some(args)
        };
        let icon_opt = if icon.trim().is_empty() { None } else { Some(icon) };
        apps_by_group.entry(group_id).or_default().push(AppEntry {
            id,
            name,
            path,
            args: args_opt,
            icon: icon_opt,
            added_at,
        });
    }

    for g in &mut groups {
        if let Some(apps) = apps_by_group.remove(&g.id) {
            g.apps = apps;
        }
    }

    let active = if !active_group_id.is_empty()
        && groups.iter().any(|g| g.id == active_group_id)
    {
        active_group_id
    } else {
        groups
            .first()
            .map(|g| g.id.clone())
            .unwrap_or_else(String::new)
    };

    let settings = load_ui_settings(&conn);

    Ok(Some(LauncherState {
        version: 1,
        active_group_id: active,
        groups,
        settings,
    }))
}

#[tauri::command]
fn save_launcher_state(app: tauri::AppHandle, state: LauncherState) -> Result<(), String> {
    let mut conn = open_db(&app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM apps", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM groups", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM meta", []).map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO meta(key, value) VALUES('active_group_id', ?1)",
        params![state.active_group_id],
    )
    .map_err(|e| e.to_string())?;

    let settings_json =
        serde_json::to_string(&state.settings).map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO meta(key, value) VALUES('ui_settings', ?1)",
        params![settings_json],
    )
    .map_err(|e| e.to_string())?;

    for (group_pos, group) in state.groups.iter().enumerate() {
        tx.execute(
            "INSERT INTO groups(id, name, position) VALUES(?1, ?2, ?3)",
            params![group.id, group.name, group_pos as i64],
        )
        .map_err(|e| e.to_string())?;

        for (app_pos, app_entry) in group.apps.iter().enumerate() {
            tx.execute(
                "INSERT INTO apps(id, group_id, name, path, args, icon, position, added_at)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    app_entry.id,
                    group.id,
                    app_entry.name,
                    app_entry.path,
                    app_entry.args.clone().unwrap_or_default(),
                    app_entry.icon.clone().unwrap_or_default(),
                    app_pos as i64,
                    app_entry.added_at
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())
}

fn load_ui_settings(conn: &Connection) -> UiSettings {
    let settings_raw: String = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'ui_settings' LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| String::new());
    if settings_raw.trim().is_empty() {
        return UiSettings::default();
    }
    serde_json::from_str::<UiSettings>(&settings_raw).unwrap_or_else(|_| UiSettings::default())
}

fn load_saved_hotkey(app: &tauri::AppHandle) -> Option<String> {
    let conn = open_db(app).ok()?;
    let settings = load_ui_settings(&conn);
    let v = settings.toggle_hotkey.trim().to_string();
    if v.is_empty() { None } else { Some(v) }
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

                let saved = load_saved_hotkey(&app.handle());
                if let Some(state) = app.try_state::<hotkey::HotkeyState>() {
                    hotkey::init_from_saved_hotkey(&app.handle(), &state, saved);
                }
            }
            if let Ok(conn) = open_db(&app.handle()) {
                let settings = load_ui_settings(&conn);
                if settings.hide_on_startup {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.hide();
                    }
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
        .invoke_handler(tauri::generate_handler![
            greet,
            spawn_app,
            uwp::list_uwp_apps,
            uwp::spawn_uwp_app,
            icon::get_file_icon,
            set_toggle_hotkey,
            make_relative_path,
            open_app_folder,
            load_launcher_state,
            save_launcher_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
